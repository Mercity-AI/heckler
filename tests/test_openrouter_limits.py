import pytest

from heckler.llm import openrouter

OPENROUTER = "https://openrouter.ai/api/v1"


@pytest.fixture
def caps(monkeypatch):
    monkeypatch.setattr(openrouter, "_caps", {"small/model": 4096, "big/model": 128000})
    monkeypatch.setattr(openrouter, "_retry_at", 0.0)


async def test_clamps_to_the_model_output_cap(caps):
    assert await openrouter.clamp_max_tokens(OPENROUTER, "small/model", 16384) == 4096
    assert await openrouter.clamp_max_tokens(OPENROUTER, "small/model:nitro", 16384) == 4096
    assert await openrouter.clamp_max_tokens(OPENROUTER, "big/model", 16384) == 16384


async def test_unknown_models_and_other_endpoints_are_left_alone(caps):
    assert await openrouter.clamp_max_tokens(OPENROUTER, "new/model", 16384) == 16384
    assert await openrouter.clamp_max_tokens("https://api.example.com/v1", "small/model", 16384) == 16384


async def test_unreadable_model_list_sends_the_request_unchanged(monkeypatch):
    monkeypatch.setattr(openrouter, "_caps", None)
    monkeypatch.setattr(openrouter, "_retry_at", 0.0)
    assert await openrouter.clamp_max_tokens("https://openrouter.ai.invalid/api/v1", "small/model", 16384) == 16384
    assert openrouter._caps is None and openrouter._retry_at > 0  # backs off instead of refetching every call
