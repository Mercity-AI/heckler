"""Process-wide settings, loaded from environment variables and an optional `.env` file.

Everything tunable lives here so the rest of the code never reads `os.environ` directly.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from .domain.models import ModelSpec


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="HECKLER_", extra="ignore")

    # --- provider credentials (read without the HECKLER_ prefix: these are the conventional names) ---
    openrouter_api_key: str | None = Field(default=None, validation_alias="OPENROUTER_API_KEY")
    anthropic_api_key: str | None = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    openai_api_key: str | None = Field(default=None, validation_alias="OPENAI_API_KEY")
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openai_base_url: str = "https://api.openai.com/v1"

    # --- storage ---
    data_dir: Path = Path("data")

    # --- attacker agents (A, B, C). Override with HECKLER_ATTACKER_PROVIDER / HECKLER_ATTACKER_MODEL ---
    attacker_provider: str = "openrouter"
    attacker_model: str = "anthropic/claude-opus-5.5"
    # Generous: Claude Opus 5.5 always thinks, and thinking tokens count against this budget.
    # 16384 stays under the Anthropic SDK's non-streaming ceiling (~21k), and calls to OpenRouter
    # are lowered to the model's own output cap (see llm.openrouter).
    attacker_max_tokens: int = 16384
    # Anthropic-only knobs (ignored by other providers).
    anthropic_effort: str = "medium"
    anthropic_refusal_fallbacks: bool = True

    # --- Simula scenario generation models (cheap + fast is fine here) ---
    simula_provider: str = "openrouter"
    simula_strategic_model: str = "google/gemini-3.8-flash"
    simula_bulk_model: str = "google/gemini-3.8-flash"
    simula_critic_model: str = "google/gemini-3.8-flash"

    # --- run defaults / safety limits ---
    default_max_turns: int = 6
    max_turns_limit: int = 20
    # Every conversation runs in parallel by default; this only caps very large runs.
    max_concurrency: int = 100
    max_scenarios: int = 100
    llm_timeout_seconds: float = 120.0
    target_timeout_seconds: float = 90.0
    # Artificial delay per call of the offline `fake` provider, so keyless demos look live.
    fake_latency_seconds: float = 0.4

    # CORS for the web UI; comma-separated origins.
    cors_origins: str = "*"

    # Public deployments: every agent must bring its own evaluator key, and server-side keys
    # (env vars) are never used for or exposed to user-configured endpoints.
    require_user_keys: bool = False
    # A finished run to show behind the UI's "See an example" button. Unset: the button starts an offline demo.
    example_run_id: str | None = None

    def attacker_spec(self) -> ModelSpec:
        """Server-default evaluator model, for agents that do not configure their own."""
        return ModelSpec(provider=self.attacker_provider, model=self.attacker_model, max_tokens=self.attacker_max_tokens)

    def simula_models(self) -> dict[str, ModelSpec]:
        return {
            "strategic": ModelSpec(provider=self.simula_provider, model=self.simula_strategic_model, max_tokens=4096),
            "bulk": ModelSpec(provider=self.simula_provider, model=self.simula_bulk_model, max_tokens=4096),
            "critic": ModelSpec(provider=self.simula_provider, model=self.simula_critic_model, max_tokens=2048),
        }

    @property
    def db_path(self) -> Path:
        return self.data_dir / "heckler.sqlite3"

    @property
    def simula_dir(self) -> Path:
        return self.data_dir / "simula"


@lru_cache
def get_settings() -> Settings:
    return Settings()
