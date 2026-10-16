from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sse_starlette.sse import EventSourceResponse

from ...domain.models import Conversation, RunConfig
from ...events import EventType
from ..container import Container, get_container
from ..schemas import ConversationSummary, RunCreate, RunDetail, RunSummary

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("", response_model=RunDetail, status_code=status.HTTP_202_ACCEPTED)
async def create_run(body: RunCreate, c: Container = Depends(get_container)) -> RunDetail:
    """Start a run in the background. Follow it live on `GET /runs/{id}/events`."""
    target = await c.repository.get_target(body.target_id)
    config = RunConfig.model_validate(body.model_dump(exclude={"target_id"}))
    run = await c.orchestrator.start_run(target, config)
    return RunDetail.of(run, [], is_active=True)


@router.get("", response_model=list[RunSummary])
async def list_runs(
    target_id: str | None = None, limit: int = Query(50, ge=1, le=500), c: Container = Depends(get_container)
) -> list[RunSummary]:
    return [RunSummary.of(r) for r in await c.repository.list_runs(target_id=target_id, limit=limit)]


@router.get("/{run_id}", response_model=RunDetail)
async def get_run(run_id: str, c: Container = Depends(get_container)) -> RunDetail:
    run = await c.repository.get_run(run_id)
    conversations = await c.repository.list_conversations(run_id)
    return RunDetail.of(run, conversations, is_active=c.orchestrator.is_active(run_id))


@router.post("/{run_id}/cancel", response_model=RunDetail)
async def cancel_run(run_id: str, c: Container = Depends(get_container)) -> RunDetail:
    await c.repository.get_run(run_id)
    if not await c.orchestrator.cancel_run(run_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Run is not active.")
    return await get_run(run_id, c)


@router.get("/{run_id}/taxonomy")
async def get_taxonomy(run_id: str, c: Container = Depends(get_container)) -> dict:
    """The Simula taxonomy the run's scenarios were sampled from (null for manual/reused runs)."""
    run = await c.repository.get_run(run_id)
    return {"taxonomy": run.taxonomy}


@router.get("/{run_id}/conversations", response_model=list[ConversationSummary])
async def list_conversations(run_id: str, c: Container = Depends(get_container)) -> list[ConversationSummary]:
    await c.repository.get_run(run_id)
    return [ConversationSummary.of(x) for x in await c.repository.list_conversations(run_id)]


@router.get("/{run_id}/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(run_id: str, conversation_id: str, c: Container = Depends(get_container)) -> Conversation:
    conversation = await c.repository.get_conversation(conversation_id)
    if conversation.run_id != run_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "conversation not found in this run")
    return conversation


@router.get("/{run_id}/events")
async def stream_events(
    run_id: str,
    request: Request,
    after: int = Query(0, ge=0, description="Only replay events with seq > after."),
    last_event_id: str | None = Header(default=None),
    c: Container = Depends(get_container),
) -> EventSourceResponse:
    """Server-Sent Events: full replay of the run so far, then live events until the run finishes.

    Event names are the `type` values in `heckler.events.EventType`; `data` is the JSON event.
    For runs from a previous server process (no live channel) a single `run.snapshot` is sent.
    """
    run = await c.repository.get_run(run_id)
    if last_event_id and last_event_id.isdigit():
        after = max(after, int(last_event_id))

    async def events() -> AsyncIterator[dict]:
        if not c.bus.has_channel(run_id):
            detail = RunDetail.of(run, await c.repository.list_conversations(run_id), is_active=False)
            yield {"event": "run.snapshot", "data": detail.model_dump_json()}
            return
        async for event in c.bus.subscribe(run_id, after=after):
            if await request.is_disconnected():
                return
            yield {"event": event.type, "id": str(event.seq), "data": event.model_dump_json()}
            if event.type == EventType.RUN_FINISHED:
                return

    return EventSourceResponse(events(), ping=15)
