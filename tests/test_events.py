import asyncio

from heckler.events import EventBus


async def _collect(bus: EventBus, run_id: str, after: int = 0) -> list[int]:
    return [event.seq async for event in bus.subscribe(run_id, after=after)]


async def test_late_subscriber_replays_history_then_follows_live():
    bus = EventBus()
    bus.publish("r1", "a")
    bus.publish("r1", "b")
    task = asyncio.create_task(_collect(bus, "r1"))
    await asyncio.sleep(0)
    bus.publish("r1", "c")
    bus.close("r1")
    assert await asyncio.wait_for(task, 1) == [1, 2, 3]


async def test_resume_after_seq_and_closed_channel():
    bus = EventBus()
    for name in "abcd":
        bus.publish("r1", name)
    bus.close("r1")
    assert await asyncio.wait_for(_collect(bus, "r1", after=2), 1) == [3, 4]
