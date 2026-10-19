from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, status

from ...domain.models import ChatMessage, FakeConnection, OpenAIChatConnection, Target
from ...llm.base import LLMError
from ...llm.openai_compat import OpenAICompatibleProvider
from ...storage.base import NotFoundError
from ...targets.base import TargetError
from ...targets.factory import build_target_client
from ..container import Container, get_container
from ..schemas import MASK, ConnectionTest, ConnectionTestResult, ProbeRequest, ProbeResult, TargetCreate, TargetOut

router = APIRouter(prefix="/targets", tags=["targets"])


def _merge_secrets(body: TargetCreate, saved: Target | None) -> Target:
    """Build a Target from a form body. A masked or empty key means "keep the stored one"."""
    target = Target(**body.model_dump(exclude={"connection", "evaluator", "target_id"}), connection=body.connection, evaluator=body.evaluator)
    conn = target.connection
    if isinstance(conn, OpenAIChatConnection) and (conn.api_key is None or conn.api_key.get_secret_value() in ("", MASK)):
        old = saved.connection if saved else None
        conn.api_key = old.api_key if isinstance(old, OpenAIChatConnection) and not conn.api_key_env else None
    ev = target.evaluator
    if ev is not None and (ev.api_key is None or ev.api_key.get_secret_value() in ("", MASK)):
        ev.api_key = saved.evaluator.api_key if saved and saved.evaluator else None
    return target


def _check_keys(target: Target, c: Container) -> None:
    """Public deployments only run on keys the user brings: no server env vars, no shared keys."""
    if not c.settings.require_user_keys or isinstance(target.connection, FakeConnection):
        return
    if isinstance(target.connection, OpenAIChatConnection) and target.connection.api_key_env:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Paste the agent's API key; server-side keys are disabled here.")
    if target.evaluator is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Add an evaluator model and its API key.")


@router.post("", response_model=TargetOut, status_code=status.HTTP_201_CREATED)
async def create_target(body: TargetCreate, c: Container = Depends(get_container)) -> TargetOut:
    target = _merge_secrets(body, None)
    _check_keys(target, c)
    await c.repository.save_target(target)
    return TargetOut.of(target)


@router.get("", response_model=list[TargetOut])
async def list_targets(c: Container = Depends(get_container)) -> list[TargetOut]:
    return [TargetOut.of(t) for t in await c.repository.list_targets()]


@router.get("/{target_id}", response_model=TargetOut)
async def get_target(target_id: str, c: Container = Depends(get_container)) -> TargetOut:
    return TargetOut.of(await c.repository.get_target(target_id))


@router.put("/{target_id}", response_model=TargetOut)
async def update_target(target_id: str, body: TargetCreate, c: Container = Depends(get_container)) -> TargetOut:
    """Edit an agent. Send keys as "***" (or omit them) to keep the stored ones."""
    saved = await c.repository.get_target(target_id)
    target = _merge_secrets(body, saved)
    target.id, target.created_at = saved.id, saved.created_at
    _check_keys(target, c)
    await c.repository.save_target(target)
    return TargetOut.of(target)


@router.delete("/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_target(target_id: str, c: Container = Depends(get_container)) -> None:
    await c.repository.delete_target(target_id)


async def _probe_target(target: Target, c: Container, message: str) -> ProbeResult:
    started = time.perf_counter()
    client = None
    try:
        client = build_target_client(target, c.settings)
        reply = await client.reply([ChatMessage(role="user", content=message)])
        return ProbeResult(ok=True, reply=reply, latency_ms=int((time.perf_counter() - started) * 1000))
    except TargetError as exc:
        return ProbeResult(ok=False, error=str(exc), latency_ms=int((time.perf_counter() - started) * 1000))
    finally:
        if client is not None:
            await client.aclose()


async def _probe_evaluator(target: Target, c: Container) -> ProbeResult | None:
    ev = target.evaluator
    if ev is None:
        return None
    started = time.perf_counter()
    if not ev.api_key or not ev.api_key.get_secret_value():
        return ProbeResult(ok=False, error="No API key for the evaluator model.", latency_ms=0)
    provider = OpenAICompatibleProvider(name="evaluator", base_url=ev.base_url, api_key=ev.api_key.get_secret_value(), timeout=30, max_retries=0)
    try:
        models = [ev.model] + ([ev.scenario_model] if ev.scenario_model and ev.scenario_model != ev.model else [])
        reply = ""
        for model in models:
            response = await provider.complete(
                model=model, system="You are a connectivity check.", messages=[ChatMessage(role="user", content="Reply with the single word: ready")], max_tokens=512
            )
            reply = response.text.strip()
        return ProbeResult(ok=True, reply=reply[:200], latency_ms=int((time.perf_counter() - started) * 1000))
    except LLMError as exc:
        return ProbeResult(ok=False, error=str(exc), latency_ms=int((time.perf_counter() - started) * 1000))
    finally:
        await provider.aclose()


@router.post("/test", response_model=ConnectionTestResult)
async def test_connection(body: ConnectionTest, c: Container = Depends(get_container)) -> ConnectionTestResult:
    """Check an agent's settings before saving them: one message to the agent, one to the evaluator."""
    saved = None
    if body.target_id:
        try:
            saved = await c.repository.get_target(body.target_id)
        except NotFoundError:
            saved = None
    target = _merge_secrets(body, saved)
    _check_keys(target, c)
    return ConnectionTestResult(target=await _probe_target(target, c, ProbeRequest().message), evaluator=await _probe_evaluator(target, c))


@router.post("/{target_id}/probe", response_model=ProbeResult)
async def probe_target(target_id: str, body: ProbeRequest | None = None, c: Container = Depends(get_container)) -> ProbeResult:
    """Send one message to a saved target to check connectivity/credentials before a full run."""
    target = await c.repository.get_target(target_id)
    return await _probe_target(target, c, (body or ProbeRequest()).message)
