from __future__ import annotations

import time

from fastapi import APIRouter, Depends, status

from ...domain.models import ChatMessage, Target
from ...targets.base import TargetError
from ...targets.factory import build_target_client
from ..container import Container, get_container
from ..schemas import ProbeRequest, ProbeResult, TargetCreate, TargetOut

router = APIRouter(prefix="/targets", tags=["targets"])


@router.post("", response_model=TargetOut, status_code=status.HTTP_201_CREATED)
async def create_target(body: TargetCreate, c: Container = Depends(get_container)) -> TargetOut:
    target = Target(**body.model_dump(exclude={"connection"}), connection=body.connection)
    await c.repository.save_target(target)
    return TargetOut.of(target)


@router.get("", response_model=list[TargetOut])
async def list_targets(c: Container = Depends(get_container)) -> list[TargetOut]:
    return [TargetOut.of(t) for t in await c.repository.list_targets()]


@router.get("/{target_id}", response_model=TargetOut)
async def get_target(target_id: str, c: Container = Depends(get_container)) -> TargetOut:
    return TargetOut.of(await c.repository.get_target(target_id))


@router.delete("/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_target(target_id: str, c: Container = Depends(get_container)) -> None:
    await c.repository.delete_target(target_id)


@router.post("/{target_id}/probe", response_model=ProbeResult)
async def probe_target(target_id: str, body: ProbeRequest | None = None, c: Container = Depends(get_container)) -> ProbeResult:
    """Send one message to the target to check connectivity/credentials before a full run."""
    target = await c.repository.get_target(target_id)
    message = (body or ProbeRequest()).message
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
