from __future__ import annotations

from fastapi import APIRouter, Depends

from ... import __version__
from ...llm.factory import PROVIDER_NAMES
from ..container import Container, get_container
from ..schemas import AgentOut

router = APIRouter(tags=["meta"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": __version__}


@router.get("/agents", response_model=list[AgentOut])
async def list_agents(c: Container = Depends(get_container)) -> list[AgentOut]:
    """The attacker agents (A, B, C) and the models they run on. Personas come from the scenarios."""
    return [AgentOut(name=p.name, model=p.model) for p in c.orchestrator.agent_profiles]


@router.get("/config")
async def public_config(c: Container = Depends(get_container)) -> dict:
    """Non-secret settings the frontend needs (defaults and limits for the run form)."""
    s = c.settings
    return {
        "providers": list(PROVIDER_NAMES),
        "configured_keys": {
            "openrouter": bool(s.openrouter_api_key),
            "anthropic": bool(s.anthropic_api_key),
            "openai": bool(s.openai_api_key),
        },
        "defaults": {"max_turns": s.default_max_turns, "concurrency": s.default_concurrency},
        "limits": {"max_turns": s.max_turns_limit, "concurrency": s.max_concurrency, "num_scenarios": s.max_scenarios},
        "simula_models": {role: spec.model_dump() for role, spec in s.simula_models().items()},
    }
