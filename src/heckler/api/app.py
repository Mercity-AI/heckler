"""FastAPI application factory."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .. import __version__
from ..config import Settings, get_settings
from ..engine.orchestrator import RunValidationError
from ..scenarios.base import ScenarioGenerationError
from ..storage.base import NotFoundError
from .container import Container
from .routes import meta, runs, targets

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.container = container or Container.build(settings)
        recovered = await app.state.container.orchestrator.recover_interrupted_runs()
        if recovered:
            logger.warning("marked %d interrupted run(s) as failed", recovered)
        try:
            yield
        finally:
            await app.state.container.aclose()

    app = FastAPI(
        title="Heckler",
        version=__version__,
        description="Simulated attacker agents that stress-test an LLM agent against its own system prompt.",
        lifespan=lifespan,
    )
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(NotFoundError)
    async def _not_found(_: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc.args[0]) if exc.args else "not found"})

    @app.exception_handler(RunValidationError)
    async def _invalid_run(_: Request, exc: RunValidationError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(ScenarioGenerationError)
    async def _scenario_error(_: Request, exc: ScenarioGenerationError) -> JSONResponse:
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    app.include_router(meta.router)
    app.include_router(targets.router)
    app.include_router(runs.router)
    return app
