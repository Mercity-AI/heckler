"""Run lifecycle: scenarios -> one evaluator per conversation, all in parallel -> live stats.

Runs execute as background asyncio tasks inside the API process. Everything a client needs to follow a
run live is published on the EventBus; everything durable is written through the Repository.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
from collections.abc import Callable
from dataclasses import dataclass, field

from ..agents.attacker import AttackerAgent
from ..calllog import CallLog
from ..config import Settings
from ..domain.models import (
    AgentProfile,
    Conversation,
    ConversationStatus,
    FakeConnection,
    GuardConnection,
    GuardInfo,
    ModelSpec,
    Run,
    RunConfig,
    RunStatus,
    Scenario,
    ScenarioCall,
    Target,
    Usage,
    utcnow,
)
from ..events import EventBus, EventType
from ..guards.screen import Guard, write_policy
from ..guards.systemone import FakeSystemOneClient, HttpSystemOneClient, SystemOneClient, guard_key
from ..llm.base import LLMProvider
from ..llm.factory import ProviderRegistry
from ..llm.openai_compat import OpenAICompatibleProvider
from ..scenarios.base import ROLE_MAX_TOKENS, RoleModels, ScenarioGenerator, ScenarioProgress
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
    # The guard models screening this run, each with the System One client it is called through.
    guards: list[tuple[GuardConnection, SystemOneClient]] = field(default_factory=list)
    # Providers built for this run only (the agent owner's own key); closed when the run ends.
    owned: list[LLMProvider] = field(default_factory=list)

    async def aclose(self) -> None:
        for provider in self.owned:
            await provider.aclose()
        for _, client in self.guards:
            await client.aclose()


def _cost_summary(run: Run) -> str:
    """Reported USD cost by role, for the run's last log line ("n/a" where no call reported a cost)."""
    s = run.stats
    parts = {
        "scenarios": run.scenario_usage.cost,
        "policy": run.policy_usage.cost,
        "evaluator": s.attacker_usage.cost,
        "agent": s.target_usage.cost,
        "guards": sum(g.cost for g in s.guards.values() if g.cost is not None) if any(g.cost is not None for g in s.guards.values()) else None,
    }
    known = [v for v in parts.values() if v is not None]
    total = f"${sum(known):.4f}" if known else "n/a"
    return total + " (" + ", ".join(f"{k} {'n/a' if v is None else f'${v:.4f}'}" for k, v in parts.items()) + ")"


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
        call_log: CallLog | None = None,
    ) -> None:
        self._settings = settings
        self._call_log = call_log
        self._repo = repository
        self._bus = bus
        self._providers = providers
        self._generator = scenario_generator
        self._target_factory = target_factory
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def evaluator_models(self, target: Target) -> EvaluatorModels:
        """Resolve which models a run against `target` uses. Heckler is bring-your-own-key only:

        1. The agent's own evaluator connection: the owner's key pays for every call.
        2. The offline demo agent: the scripted fake models, free and keyless.

        Anything else is refused. There is no server key to fall back to.
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
                role: (provider, ModelSpec(provider="evaluator", model=scenario_model, max_tokens=max_tokens))
                for role, max_tokens in ROLE_MAX_TOKENS.items()
            }
            return EvaluatorModels(provider=provider, attacker=attacker, simula=simula, owned=[provider])
        if isinstance(target.connection, FakeConnection):
            fake = self._providers.get("fake")
            spec = ModelSpec(provider="fake", model="offline-demo")
            return EvaluatorModels(provider=fake, attacker=spec, simula={role: (fake, spec) for role in ROLE_MAX_TOKENS})
        raise RunValidationError("This agent has no evaluator model. Edit the agent and add the evaluator's endpoint and API key.")

    def guard_models(self, target: Target, config: RunConfig) -> list[tuple[GuardConnection, SystemOneClient]]:
        """The agent's guards this run screens with (all of them unless `config.guard_ids` picks some).

        Each runs on its own key, like the evaluator (a guard on OpenRouter may share the evaluator's
        OpenRouter key); the offline demo guards are scripted."""
        known = {g.id for g in target.guards}
        unknown = [g for g in (config.guard_ids or []) if g not in known]
        if unknown:
            raise RunValidationError(f"Unknown guard model(s) for this agent: {', '.join(unknown)}.")
        picked = target.guards if config.guard_ids is None else [g for g in target.guards if g.id in set(config.guard_ids)]
        missing = [g.name for g in picked if g.kind == "systemone" and not guard_key(g, target.evaluator)]
        if missing:
            raise RunValidationError(f"Add an API key for the guard model '{missing[0]}' in this agent's settings.")
        return [(guard, self.guard_client(guard, target)) for guard in picked]

    def guard_client(self, guard: GuardConnection, target: Target) -> SystemOneClient:
        if guard.kind == "fake":
            return FakeSystemOneClient(latency_seconds=self._settings.fake_latency_seconds)
        key = guard_key(guard, target.evaluator) or ""
        return HttpSystemOneClient(base_url=guard.base_url, api_key=key, timeout=self._settings.llm_timeout_seconds)

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

    async def start_run(self, target: Target, config: RunConfig, *, example: bool = False) -> Run:
        config = self.normalise_config(config)
        models = self.evaluator_models(target)  # fails fast on a missing key, before anything is saved
        try:
            models.guards = self.guard_models(target, config)
        except RunValidationError:
            await models.aclose()
            raise
        if config.reuse_scenarios_from_run_id:
            await self._repo.get_run(config.reuse_scenarios_from_run_id)  # 404 early if it doesn't exist
        run = Run(target_id=target.id, target_name=target.name, config=config, example=example, owner_id=target.owner_id)
        run.guards = [GuardInfo(id=g.id, name=g.name, model=g.model, threshold=g.threshold) for g, _ in models.guards]
        run.guard_policy = (target.guard_policy or "").strip() or None if models.guards else None
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

    async def delete_run(self, run_id: str) -> None:
        """Stop the run if it is still going, then remove it, its conversations and its Simula artifacts."""
        await self._repo.get_run(run_id)  # 404 before touching anything
        await self.cancel_run(run_id)
        await self._repo.delete_run(run_id)
        self._bus.drop(run_id)
        await asyncio.to_thread(shutil.rmtree, self._settings.simula_dir / run_id, True)

    async def recover_interrupted_runs(self) -> int:
        """Runs left non-terminal by a previous process can never finish; mark them failed.

        Also removes Simula working files those runs left behind (plaintext, like any in-flight generation)."""
        await asyncio.to_thread(shutil.rmtree, self._settings.simula_dir, True)
        count = 0
        for run in await self._repo.list_runs(limit=1000, example=None):
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
            logger.info(
                "run %s started: agent %s, target %s, evaluator %s, %d scenarios x %d turns",
                run.id, target.id,getattr(target.connection, "model", target.connection.kind), models.attacker.model,
                run.config.num_scenarios, run.config.max_turns,
            )
            # Built first so a misconfigured target fails before we spend money on scenarios.
            target_client = self._target_factory(target)
            guards = await self._build_guards(run, target, models)
            scenarios = await self._resolve_scenarios(run, target, models)
            logger.info("run %s: %d scenarios ready, starting conversations", run.id, len(scenarios))

            conversations = [
                Conversation(run_id=run.id, index=i, agent_name=evaluator_label(i), scenario=scenario)
                for i, scenario in enumerate(scenarios)
            ]
            for conversation in conversations:
                await self._repo.save_conversation(conversation)
            run.stats = compute_stats(conversations, run.guards)
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
            await self._run_conversations(run, target, target_client, conversations, models, guards)

            run.stats = compute_stats(conversations, run.guards)
            await self._set_status(run, RunStatus.COMPLETED)
        except asyncio.CancelledError:
            await asyncio.shield(self._finish_cancelled(run, conversations))
            raise
        except Exception as exc:  # noqa: BLE001 - surface any failure on the run itself
            logger.exception("run %s failed", run.id)
            run.error = str(exc)
            run.stats = compute_stats(conversations, run.guards)
            await self._set_status(run, RunStatus.FAILED)
        finally:
            if target_client is not None:
                await target_client.aclose()
            await models.aclose()
            # Simula's working files hold the system prompt and scenarios in plaintext; the encrypted DB has what we keep.
            await asyncio.to_thread(shutil.rmtree, self._settings.simula_dir / run.id, True)
            s = run.stats
            logger.info(
                "run %s finished: %s; %d/%d evaluated, %d passed, %d failed, %d broken, %d errored, mean score %s, "
                "evaluator tokens %d in / %d out, reported cost %s%s",
                run.id, run.status, s.evaluated, s.total, s.passed, s.failed, s.broken, s.errored, s.mean_score,
                s.attacker_usage.input_tokens, s.attacker_usage.output_tokens, _cost_summary(run), f"; error: {run.error}" if run.error else "",
            )
            if self._call_log is not None:
                self._call_log.write(
                    run.id, "run_summary", status=run.status, target_id=target.id, target_name=target.name,
                    agent_model=getattr(target.connection, "model", target.connection.kind), evaluator_model=models.attacker.model,
                    scenario_model=next(iter(models.simula.values()))[1].model, config=run.config.model_dump(mode="json", exclude={"scenarios"}),
                    guards=[g.model_dump(mode="json") for g in run.guards], cost=_cost_summary(run),
                    scenario_usage=run.scenario_usage.model_dump(), policy_usage=run.policy_usage.model_dump(),
                    stats=run.stats.model_dump(mode="json"), error=run.error,
                )
            self._publish(run.id, EventType.RUN_FINISHED, {"status": run.status, "stats": run.stats.model_dump(mode="json"), "error": run.error})
            self._bus.close(run.id)

    async def _build_guards(self, run: Run, target: Target, models: EvaluatorModels) -> list[Guard]:
        """Bind each guard to the run's policy, first writing one from the system prompt if the agent has none."""
        if not models.guards:
            return []
        if not run.guard_policy:
            run.guard_policy, response = await write_policy(models.provider, models.attacker.model, target.system_prompt)
            run.policy_usage.add(response.input_tokens, response.output_tokens, response.cost)
            if self._call_log is not None:
                self._call_log.write(
                    run.id, "guard_policy", model=response.model, input_tokens=response.input_tokens,
                    output_tokens=response.output_tokens, cost=response.cost, output=run.guard_policy,
                )
            await self._repo.save_run(run)
            logger.info("run %s: wrote a %d-char guard policy from the system prompt", run.id, len(run.guard_policy))
        return [
            Guard(info=GuardInfo(id=g.id, name=g.name, model=g.model, threshold=g.threshold), client=client, model=g.model, policy=run.guard_policy, threshold=g.threshold)
            for g, client in models.guards
        ]

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

        calls: list[ScenarioCall] = []
        try:
            result = await self._generator.generate(
                target=target, count=config.num_scenarios, focus=config.focus, workdir_name=run.id, on_progress=on_progress,
                models=models.simula, call_log=calls,
            )
        finally:
            # Kept even when generation fails part way: those calls were made, and paid for.
            if calls:
                run.scenario_usage = Usage()
                for call in calls:
                    run.scenario_usage.add(call.input_tokens, call.output_tokens, call.cost)
                if self._call_log is not None:
                    # calls finish out of order (Simula runs several at once); log them in the order they started
                    for call in sorted(calls, key=lambda c: c.id):
                        fields = call.model_dump(mode="json")
                        fields["simula_role"] = fields.pop("role")  # strategic | bulk | critic; `role` is the log's own
                        self._call_log.write(run.id, "scenario", **fields)
        run.taxonomy = result.taxonomy
        await self._repo.save_run(run)
        return result.scenarios

    async def _run_conversations(
        self,
        run: Run,
        target: Target,
        target_client: TargetClient,
        conversations: list[Conversation],
        models: EvaluatorModels,
        guards: list[Guard],
    ) -> None:
        # Every conversation gets its own evaluator and, by default, they all start at once.
        limit = min(run.config.concurrency or len(conversations), self._settings.max_concurrency)
        limiter = asyncio.Semaphore(max(1, limit))
        stats_lock = asyncio.Lock()
        log = self._call_log

        def log_call(role: str, conversation: Conversation, **fields: object) -> None:
            if log is not None:
                log.write(run.id, role, conversation_id=conversation.id, conversation=conversation.agent_name, **fields)

        runner = ConversationRunner(
            publish=lambda type_, data: self._publish(run.id, type_, data),
            persist=self._repo.save_conversation,
            guards=guards,
            log_call=log_call if log is not None else None,
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
                    on_call=(
                        (lambda kind, response, latency_ms, c=conversation: log_call(
                            kind, c, turn=sum(m.role == "target" for m in c.messages) + (kind == "evaluator_turn"),
                            model=response.model, input_tokens=response.input_tokens, output_tokens=response.output_tokens,
                            cost=response.cost, latency_ms=latency_ms, stop_reason=response.stop_reason, output=response.text,
                        ))
                        if log is not None
                        else None
                    ),
                )
                await runner.run(conversation, attacker, target_client, run.config.max_turns)
            async with stats_lock:
                run.stats = compute_stats(conversations, run.guards)
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
        run.stats = compute_stats(conversations, run.guards)
        await self._set_status(run, RunStatus.CANCELLED)

    async def _set_status(self, run: Run, status: RunStatus) -> None:
        run.status = status
        if status.is_terminal:
            run.finished_at = utcnow()
        await self._repo.save_run(run)
        self._publish(run.id, EventType.RUN_STATUS, {"status": status, "error": run.error})

    def _publish(self, run_id: str, type_: str, data: dict) -> None:
        self._bus.publish(run_id, type_, data)
