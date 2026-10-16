"""Run lifecycle: scenarios -> agent assignment -> parallel conversations -> live stats.

Runs execute as background asyncio tasks inside the API process. Everything a client needs to follow a
run live is published on the EventBus; everything durable is written through the Repository.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from ..agents.attacker import AttackerAgent
from ..config import Settings
from ..domain.models import (
    AgentProfile,
    Conversation,
    ConversationStatus,
    Run,
    RunConfig,
    RunStatus,
    Scenario,
    Target,
    utcnow,
)
from ..events import EventBus, EventType
from ..llm.factory import ProviderRegistry
from ..scenarios.base import ScenarioGenerator, ScenarioProgress
from ..storage.base import Repository
from ..targets.base import TargetClient
from .conversation import ConversationRunner
from .scoring import compute_stats

logger = logging.getLogger(__name__)

TargetFactory = Callable[[Target], TargetClient]


class RunValidationError(ValueError):
    pass


def assign_agents(scenarios: list[Scenario], profiles: list[AgentProfile]) -> list[AgentProfile]:
    """Round-robin scenarios over the attacker agents so each gets a balanced share."""
    if not profiles:
        raise RunValidationError("No attacker agents are configured.")
    return [profiles[i % len(profiles)] for i in range(len(scenarios))]


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
        agent_profiles: list[AgentProfile] | None = None,
    ) -> None:
        self._settings = settings
        self._repo = repository
        self._bus = bus
        self._providers = providers
        self._generator = scenario_generator
        self._target_factory = target_factory
        self._profiles = agent_profiles or settings.attacker_profiles()
        self._tasks: dict[str, asyncio.Task[None]] = {}

    @property
    def agent_profiles(self) -> list[AgentProfile]:
        return list(self._profiles)

    # ------------------------------------------------------------------ public API

    def normalise_config(self, config: RunConfig) -> RunConfig:
        s = self._settings
        if config.max_turns > s.max_turns_limit:
            raise RunValidationError(f"max_turns must be <= {s.max_turns_limit}.")
        if config.concurrency > s.max_concurrency:
            raise RunValidationError(f"concurrency must be <= {s.max_concurrency}.")
        if config.num_scenarios > s.max_scenarios:
            raise RunValidationError(f"num_scenarios must be <= {s.max_scenarios}.")
        if config.scenarios:
            config.num_scenarios = len(config.scenarios)
        return config

    async def start_run(self, target: Target, config: RunConfig) -> Run:
        config = self.normalise_config(config)
        for profile in self._profiles:
            try:
                self._providers.get(profile.model.provider)
            except Exception as exc:
                raise RunValidationError(f"{profile.name}: {exc}") from exc
        if config.reuse_scenarios_from_run_id:
            await self._repo.get_run(config.reuse_scenarios_from_run_id)  # 404 early if it doesn't exist
        run = Run(target_id=target.id, target_name=target.name, config=config)
        await self._repo.save_run(run)
        self._publish(run.id, EventType.RUN_STATUS, {"status": run.status})
        task = asyncio.create_task(self._execute(run, target), name=f"run:{run.id}")
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

    async def _execute(self, run: Run, target: Target) -> None:
        conversations: list[Conversation] = []
        target_client: TargetClient | None = None
        try:
            run.started_at = utcnow()
            # Built first so a misconfigured target fails before we spend money on scenarios.
            target_client = self._target_factory(target)
            scenarios = await self._resolve_scenarios(run, target)

            conversations = [
                Conversation(run_id=run.id, index=i, agent_name=profile.name, scenario=scenario)
                for i, (scenario, profile) in enumerate(zip(scenarios, assign_agents(scenarios, self._profiles)))
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
            await self._run_conversations(run, target, target_client, conversations)

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
            self._publish(run.id, EventType.RUN_FINISHED, {"status": run.status, "stats": run.stats.model_dump(mode="json"), "error": run.error})
            self._bus.close(run.id)

    async def _resolve_scenarios(self, run: Run, target: Target) -> list[Scenario]:
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
            target=target, count=config.num_scenarios, focus=config.focus, workdir_name=run.id, on_progress=on_progress
        )
        run.taxonomy = result.taxonomy
        await self._repo.save_run(run)
        return result.scenarios

    async def _run_conversations(self, run: Run, target: Target, target_client: TargetClient, conversations: list[Conversation]) -> None:
        limiter = asyncio.Semaphore(run.config.concurrency)
        stats_lock = asyncio.Lock()
        runner = ConversationRunner(
            publish=lambda type_, data: self._publish(run.id, type_, data),
            persist=self._repo.save_conversation,
        )
        profiles = {p.name: p for p in self._profiles}

        async def one(conversation: Conversation) -> None:
            async with limiter:
                profile = profiles[conversation.agent_name]
                attacker = AttackerAgent(
                    profile=profile,
                    provider=self._providers.get(profile.model.provider),
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
