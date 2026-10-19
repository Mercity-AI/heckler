"""Run lifecycle: scenarios -> one evaluator per conversation, all in parallel -> live stats.

Runs execute as background asyncio tasks inside the API process. Everything a client needs to follow a
run live is published on the EventBus; everything durable is written through the Repository.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass, field

from ..agents.attacker import AttackerAgent
from ..config import Settings
from ..domain.models import (
    AgentProfile,
    Conversation,
    ConversationStatus,
    FakeConnection,
    ModelSpec,
    Run,
    RunConfig,
    RunStatus,
    Scenario,
    Target,
    utcnow,
)
from ..events import EventBus, EventType
from ..llm.base import LLMProvider
from ..llm.factory import ProviderRegistry
from ..llm.openai_compat import OpenAICompatibleProvider
from ..scenarios.base import RoleModels, ScenarioGenerator, ScenarioProgress
from ..storage.base import Repository
from ..targets.base import TargetClient
from .conversation import ConversationRunner
from .scoring import compute_stats

logger = logging.getLogger(__name__)

TargetFactory = Callable[[Target], TargetClient]


class RunValidationError(ValueError):
    pass


@dataclass
class EvaluatorModels:
    """The models one run uses: the evaluator that plays and grades every conversation, and Simula's roles."""

    provider: LLMProvider
    attacker: ModelSpec
    simula: RoleModels
    # Providers built for this run only (the agent owner's own key); closed when the run ends.
    owned: list[LLMProvider] = field(default_factory=list)

    async def aclose(self) -> None:
        for provider in self.owned:
            await provider.aclose()


def evaluator_label(index: int) -> str:
    return f"#{index + 1:02d}"


class RunOrchestrator:
    def __init__(
        self,
        *,
        settings: Settings,
        repository: Repository,
        bus: EventBus,
        providers: ProviderRegistry,
        scenario_generator: ScenarioGenerator,
        target_factory: TargetFactory,
    ) -> None:
        self._settings = settings
        self._repo = repository
        self._bus = bus
        self._providers = providers
        self._generator = scenario_generator
        self._target_factory = target_factory
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def evaluator_models(self, target: Target) -> EvaluatorModels:
        """Resolve which models (and whose key) a run against `target` uses.

        1. The agent's own evaluator connection (the normal case: the owner's key pays).
        2. The offline demo agent: the scripted fake models, free and keyless.
        3. Server defaults, unless the deployment requires users to bring their own keys.
        """
        s = self._settings
        ev = target.evaluator
        if ev is not None:
            key = ev.api_key.get_secret_value() if ev.api_key else None
            if not key:
                raise RunValidationError("Add an API key for the evaluator model in this agent's settings.")
            headers = {"X-Title": "Heckler"} if "openrouter.ai" in ev.base_url else None
            provider = OpenAICompatibleProvider(
                name="evaluator", base_url=ev.base_url, api_key=key, timeout=s.llm_timeout_seconds, default_headers=headers
            )
            attacker = ModelSpec(provider="evaluator", model=ev.model, max_tokens=ev.max_tokens, temperature=ev.temperature)
            scenario_model = ev.scenario_model or ev.model
            simula = {
                role: (provider, ModelSpec(provider="evaluator", model=scenario_model, max_tokens=default.max_tokens))
                for role, default in s.simula_models().items()
            }
            return EvaluatorModels(provider=provider, attacker=attacker, simula=simula, owned=[provider])
        if isinstance(target.connection, FakeConnection):
            fake = self._providers.get("fake")
            spec = ModelSpec(provider="fake", model="offline-demo")
            return EvaluatorModels(provider=fake, attacker=spec, simula={role: (fake, spec) for role in s.simula_models()})
        if s.require_user_keys:
            raise RunValidationError("This agent has no evaluator model. Edit the agent and add the evaluator's endpoint and API key.")
        try:
            attacker = s.attacker_spec()
            simula = {role: (self._providers.get(spec.provider), spec) for role, spec in s.simula_models().items()}
            return EvaluatorModels(provider=self._providers.get(attacker.provider), attacker=attacker, simula=simula)
        except Exception as exc:
            raise RunValidationError(f"Evaluator model unavailable: {exc}") from exc

    # ------------------------------------------------------------------ public API

    def normalise_config(self, config: RunConfig) -> RunConfig:
        s = self._settings
        if config.max_turns > s.max_turns_limit:
            raise RunValidationError(f"max_turns must be <= {s.max_turns_limit}.")
        if config.concurrency is not None and config.concurrency > s.max_concurrency:
            raise RunValidationError(f"concurrency must be <= {s.max_concurrency}.")
        if config.num_scenarios > s.max_scenarios:
            raise RunValidationError(f"num_scenarios must be <= {s.max_scenarios}.")
        if config.scenarios:
            config.num_scenarios = len(config.scenarios)
        return config

    async def start_run(self, target: Target, config: RunConfig) -> Run:
        config = self.normalise_config(config)
        models = self.evaluator_models(target)  # fails fast on a missing key, before anything is saved
        if config.reuse_scenarios_from_run_id:
            await self._repo.get_run(config.reuse_scenarios_from_run_id)  # 404 early if it doesn't exist
        run = Run(target_id=target.id, target_name=target.name, config=config)
        await self._repo.save_run(run)
        self._publish(run.id, EventType.RUN_STATUS, {"status": run.status})
        task = asyncio.create_task(self._execute(run, target, models), name=f"run:{run.id}")
        self._tasks[run.id] = task
        task.add_done_callback(lambda _t, run_id=run.id: self._tasks.pop(run_id, None))
        return run

    def is_active(self, run_id: str) -> bool:
        return run_id in self._tasks

    async def cancel_run(self, run_id: str) -> bool:
        task = self._tasks.get(run_id)
        if task is None:
            return False
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        return True

    async def recover_interrupted_runs(self) -> int:
        """Runs left non-terminal by a previous process can never finish; mark them failed."""
        count = 0
        for run in await self._repo.list_runs(limit=1000):
            if not run.status.is_terminal and run.id not in self._tasks:
                run.status = RunStatus.FAILED
                run.error = "Interrupted: the server stopped while this run was in progress."
                run.finished_at = run.finished_at or utcnow()
                await self._repo.save_run(run)
                count += 1
        return count

    async def shutdown(self) -> None:
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    # ------------------------------------------------------------------ execution

    async def _execute(self, run: Run, target: Target, models: EvaluatorModels) -> None:
        conversations: list[Conversation] = []
        target_client: TargetClient | None = None
        try:
            run.started_at = utcnow()
            # Built first so a misconfigured target fails before we spend money on scenarios.
            target_client = self._target_factory(target)
            scenarios = await self._resolve_scenarios(run, target, models)

            conversations = [
                Conversation(run_id=run.id, index=i, agent_name=evaluator_label(i), scenario=scenario)
                for i, scenario in enumerate(scenarios)
            ]
            for conversation in conversations:
                await self._repo.save_conversation(conversation)
            run.stats = compute_stats(conversations)
            self._publish(
                run.id,
                EventType.SCENARIOS_READY,
                {
                    "conversations": [
                        {"conversation_id": c.id, "index": c.index, "agent_name": c.agent_name, "scenario": c.scenario.model_dump(mode="json")}
                        for c in conversations
                    ],
                    "taxonomy": run.taxonomy,
                },
            )

            await self._set_status(run, RunStatus.RUNNING)
            await self._run_conversations(run, target, target_client, conversations, models)

            run.stats = compute_stats(conversations)
            await self._set_status(run, RunStatus.COMPLETED)
        except asyncio.CancelledError:
            await asyncio.shield(self._finish_cancelled(run, conversations))
            raise
        except Exception as exc:  # noqa: BLE001 - surface any failure on the run itself
            logger.exception("run %s failed", run.id)
            run.error = str(exc)
            run.stats = compute_stats(conversations)
            await self._set_status(run, RunStatus.FAILED)
        finally:
            if target_client is not None:
                await target_client.aclose()
            await models.aclose()
            self._publish(run.id, EventType.RUN_FINISHED, {"status": run.status, "stats": run.stats.model_dump(mode="json"), "error": run.error})
            self._bus.close(run.id)

    async def _resolve_scenarios(self, run: Run, target: Target, models: EvaluatorModels) -> list[Scenario]:
        config = run.config
        if config.scenarios:
            return [s.model_copy(update={"source": "manual"}) for s in config.scenarios]
        if config.reuse_scenarios_from_run_id:
            source = await self._repo.get_run(config.reuse_scenarios_from_run_id)
            previous = await self._repo.list_conversations(source.id)
            if not previous:
                raise RunValidationError(f"Run {source.id} has no scenarios to reuse.")
            run.taxonomy = source.taxonomy
            return [c.scenario for c in previous]

        await self._set_status(run, RunStatus.GENERATING_SCENARIOS)

        async def on_progress(progress: ScenarioProgress) -> None:
            self._publish(run.id, EventType.SCENARIOS_PROGRESS, progress.model_dump())

        result = await self._generator.generate(
            target=target, count=config.num_scenarios, focus=config.focus, workdir_name=run.id, on_progress=on_progress,
            models=models.simula,
        )
        run.taxonomy = result.taxonomy
        await self._repo.save_run(run)
        return result.scenarios

    async def _run_conversations(
        self, run: Run, target: Target, target_client: TargetClient, conversations: list[Conversation], models: EvaluatorModels
    ) -> None:
        # Every conversation gets its own evaluator and, by default, they all start at once.
        limit = min(run.config.concurrency or len(conversations), self._settings.max_concurrency)
        limiter = asyncio.Semaphore(max(1, limit))
        stats_lock = asyncio.Lock()
        runner = ConversationRunner(
            publish=lambda type_, data: self._publish(run.id, type_, data),
            persist=self._repo.save_conversation,
        )

        async def one(conversation: Conversation) -> None:
            async with limiter:
                attacker = AttackerAgent(
                    profile=AgentProfile(name=f"Evaluator {conversation.agent_name}", model=models.attacker),
                    provider=models.provider,
                    scenario=conversation.scenario,
                    target_name=target.name,
                    target_system_prompt=target.system_prompt,
                    max_turns=run.config.max_turns,
                )
                await runner.run(conversation, attacker, target_client, run.config.max_turns)
            async with stats_lock:
                run.stats = compute_stats(conversations)
                await self._repo.save_run(run)
                self._publish(run.id, EventType.STATS, run.stats.model_dump(mode="json"))

        async with asyncio.TaskGroup() as group:
            for conversation in conversations:
                group.create_task(one(conversation))

    async def _finish_cancelled(self, run: Run, conversations: list[Conversation]) -> None:
        for conversation in conversations:
            if conversation.status in {ConversationStatus.PENDING, ConversationStatus.RUNNING, ConversationStatus.EVALUATING}:
                conversation.status = ConversationStatus.CANCELLED
                await self._repo.save_conversation(conversation)
        run.stats = compute_stats(conversations)
        await self._set_status(run, RunStatus.CANCELLED)

    async def _set_status(self, run: Run, status: RunStatus) -> None:
        run.status = status
        if status.is_terminal:
            run.finished_at = utcnow()
        await self._repo.save_run(run)
        self._publish(run.id, EventType.RUN_STATUS, {"status": status, "error": run.error})

    def _publish(self, run_id: str, type_: str, data: dict) -> None:
        self._bus.publish(run_id, type_, data)
