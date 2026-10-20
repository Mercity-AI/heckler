from __future__ import annotations

from fastapi import APIRouter, Depends

from ... import __version__
from ..container import Container, get_container

router = APIRouter(tags=["meta"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": __version__}


@router.get("/config")
async def public_config(c: Container = Depends(get_container)) -> dict:
    """Non-secret settings the frontend needs (defaults and limits for the run form)."""
    s = c.settings
    return {
        "defaults": {"max_turns": s.default_max_turns},
        "limits": {"max_turns": s.max_turns_limit, "concurrency": s.max_concurrency, "num_scenarios": s.max_scenarios},
        # Prefills for the connect form's evaluator section (the user still brings the key).
        "suggested_evaluator": {
            "base_url": s.suggested_evaluator_base_url,
            "model": s.suggested_evaluator_model,
            "scenario_model": s.suggested_scenario_model,
        },
        "example_run_id": s.example_run_id,
    }
