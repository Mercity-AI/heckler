from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sse_starlette.sse import EventSourceResponse

from ...domain.models import Conversation, FakeConnection, GuardConnection, Run, RunConfig, Target
from ...events import EventType
from ..auth import User, check_owner, current_user
from ..container import Container, get_container
from ..schemas import ConversationSummary, ExampleRunCreate, RunCreate, RunDetail, RunSummary

router = APIRouter(prefix="/runs", tags=["runs"])

# The demo's scripted guards: one over-blocks, one misses some violations (see testing.fakes.guard_responder).
OFFLINE_GUARDS = [
    GuardConnection(id="grd_offline_strict", name="Strict guard", kind="fake", model="offline-strict"),
    GuardConnection(id="grd_offline_lenient", name="Lenient guard", kind="fake", model="offline-lenient"),
]


async def _owned_run(run_id: str, c: Container, user: User) -> Run:
    run = await c.repository.get_run(run_id)
    check_owner(run, user)
    return run


async def _readable_run(run_id: str, c: Container, user: User) -> Run:
    """Your own runs, plus the configured showcase run that every signed-in user can open."""
    run = await c.repository.get_run(run_id)
    if run_id != c.settings.example_run_id:
        check_owner(run, user)
    return run


@router.post("", response_model=RunDetail, status_code=status.HTTP_202_ACCEPTED)
async def create_run(body: RunCreate, c: Container = Depends(get_container), user: User = Depends(current_user)) -> RunDetail:
    """Start a run in the background. Follow it live on `GET /runs/{id}/events`."""
    target = await c.repository.get_target(body.target_id)
    check_owner(target, user)
    if body.reuse_scenarios_from_run_id:
        await _owned_run(body.reuse_scenarios_from_run_id, c, user)
    config = RunConfig.model_validate(body.model_dump(exclude={"target_id"}))
    run = await c.orchestrator.start_run(target, config)
    return RunDetail.of(run, [], is_active=True)


@router.post("/example", response_model=RunDetail, status_code=status.HTTP_202_ACCEPTED)
async def create_example_run(
    body: ExampleRunCreate, c: Container = Depends(get_container), user: User = Depends(current_user)
) -> RunDetail:
    """Run the offline demo against an unsaved agent. Nothing is added to the agents or run listings.

    Only each user's latest example run is kept, so reloading its page still works; earlier ones are deleted.
    """
    for previous in await c.repository.list_runs(limit=500, example=True, owner_id=user.id):
        if not c.orchestrator.is_active(previous.id):
            await c.orchestrator.delete_run(previous.id)
    target = Target(
        name=body.name,
        description=body.description,
        system_prompt=body.system_prompt,
        connection=FakeConnection(behavior="leaky"),
        guards=OFFLINE_GUARDS if body.guards else [],
        owner_id=user.id,
    )
    config = RunConfig(num_scenarios=body.num_scenarios, max_turns=body.max_turns)
    run = await c.orchestrator.start_run(target, config, example=True)
    return RunDetail.of(run, [], is_active=True)


@router.get("", response_model=list[RunSummary])
async def list_runs(
    target_id: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    c: Container = Depends(get_container),
    user: User = Depends(current_user),
) -> list[RunSummary]:
    return [RunSummary.of(r) for r in await c.repository.list_runs(target_id=target_id, limit=limit, owner_id=user.id)]


@router.get("/{run_id}", response_model=RunDetail)
async def get_run(run_id: str, c: Container = Depends(get_container), user: User = Depends(current_user)) -> RunDetail:
    run = await _readable_run(run_id, c, user)
    conversations = await c.repository.list_conversations(run_id)
    return RunDetail.of(run, conversations, is_active=c.orchestrator.is_active(run_id))


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_run(run_id: str, c: Container = Depends(get_container), user: User = Depends(current_user)) -> Response:
    """Delete a run and its conversations. A run still in progress is stopped first."""
    await _owned_run(run_id, c, user)
    await c.orchestrator.delete_run(run_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{run_id}/cancel", response_model=RunDetail)
async def cancel_run(run_id: str, c: Container = Depends(get_container), user: User = Depends(current_user)) -> RunDetail:
    await _owned_run(run_id, c, user)
    if not await c.orchestrator.cancel_run(run_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Run is not active.")
    return await get_run(run_id, c, user)


@router.get("/{run_id}/taxonomy")
async def get_taxonomy(run_id: str, c: Container = Depends(get_container), user: User = Depends(current_user)) -> dict:
    """The Simula taxonomy the run's scenarios were sampled from (null for manual/reused runs)."""
    run = await _readable_run(run_id, c, user)
    return {"taxonomy": run.taxonomy}


@router.get("/{run_id}/conversations", response_model=list[ConversationSummary])
async def list_conversations(
    run_id: str, c: Container = Depends(get_container), user: User = Depends(current_user)
) -> list[ConversationSummary]:
    await _readable_run(run_id, c, user)
    return [ConversationSummary.of(x) for x in await c.repository.list_conversations(run_id)]


@router.get("/{run_id}/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(
    run_id: str, conversation_id: str, c: Container = Depends(get_container), user: User = Depends(current_user)
) -> Conversation:
    await _readable_run(run_id, c, user)
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
    user: User = Depends(current_user),
) -> EventSourceResponse:
    """Server-Sent Events: full replay of the run so far, then live events until the run finishes.

    Event names are the `type` values in `heckler.events.EventType`; `data` is the JSON event.
    For runs from a previous server process (no live channel) a single `run.snapshot` is sent.
    EventSource cannot send headers, so with auth on this relies on Clerk's same-origin `__session` cookie.
    """
    run = await _readable_run(run_id, c, user)
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
