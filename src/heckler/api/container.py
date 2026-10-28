"""Composition root: wires settings, storage, providers, Simula and the orchestrator together."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request

from ..calllog import CallLog
from ..config import Settings
from ..engine.orchestrator import RunOrchestrator
from ..events import EventBus
from ..llm.factory import ProviderRegistry
from ..scenarios.base import ScenarioGenerator
from ..scenarios.simula_generator import SimulaScenarioGenerator
from ..storage.base import Repository
from ..storage.encryption import build_cipher
from ..storage.sqlite import SQLiteRepository
from ..targets.factory import build_target_client
from .clerk import ClerkVerifier, issuer_from_publishable_key


@dataclass
class Container:
    settings: Settings
    repository: Repository
    bus: EventBus
    providers: ProviderRegistry
    scenario_generator: ScenarioGenerator
    orchestrator: RunOrchestrator
    # None: auth is off (no Clerk key configured).
    auth: ClerkVerifier | None = None

    @classmethod
    def build(
        cls,
        settings: Settings,
        *,
        repository: Repository | None = None,
        providers: ProviderRegistry | None = None,
        scenario_generator: ScenarioGenerator | None = None,
    ) -> "Container":
        repository = repository or SQLiteRepository(settings.db_path, build_cipher(settings))
        providers = providers or ProviderRegistry(settings)
        bus = EventBus()
        scenario_generator = scenario_generator or SimulaScenarioGenerator(output_root=settings.simula_dir)
        orchestrator = RunOrchestrator(
            settings=settings,
            repository=repository,
            bus=bus,
            providers=providers,
            scenario_generator=scenario_generator,
            target_factory=lambda target: build_target_client(target, settings),
            call_log=CallLog(settings.call_log_dir) if settings.call_log_dir else None,
        )
        auth = None
        if settings.clerk_publishable_key:
            parties = [p.strip() for p in settings.clerk_authorized_parties.split(",") if p.strip()]
            auth = ClerkVerifier(issuer_from_publishable_key(settings.clerk_publishable_key), parties)
        return cls(settings, repository, bus, providers, scenario_generator, orchestrator, auth)

    async def aclose(self) -> None:
        await self.orchestrator.shutdown()
        await self.providers.aclose()
        await self.repository.close()


def get_container(request: Request) -> Container:
    return request.app.state.container
