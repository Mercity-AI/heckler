"""Process-wide settings, loaded from environment variables and an optional `.env` file.

Everything tunable lives here so the rest of the code never reads `os.environ` directly.

Heckler is strictly bring-your-own-key: the server holds no LLM provider keys. Every run is paid for
by the evaluator key saved on the agent (the offline demo agent needs none).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="HECKLER_", extra="ignore")

    # --- storage ---
    data_dir: Path = Path("data")

    # --- prefills for the agent form's evaluator section (the user's own key always pays) ---
    suggested_evaluator_base_url: str = "https://openrouter.ai/api/v1"
    suggested_evaluator_model: str = "anthropic/claude-opus-5.5"
    # Simula scenario generation: cheap + fast is fine here.
    suggested_scenario_model: str = "google/gemini-3.8-flash"

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

    # A finished run to show behind the UI's "See an example" button. Unset: the button starts an offline demo.
    example_run_id: str | None = None

    # --- auth (Clerk). Unset: auth is off and the API serves one local user who sees all data. ---
    # The same pk_test_/pk_live_ key the web UI uses; the token issuer and JWKS URL are derived from it.
    clerk_publishable_key: str | None = None
    # Comma-separated web origins allowed in a token's `azp` claim, e.g. http://localhost:5173. Empty: not checked.
    clerk_authorized_parties: str = ""

    @property
    def db_path(self) -> Path:
        return self.data_dir / "heckler.sqlite3"

    @property
    def simula_dir(self) -> Path:
        return self.data_dir / "simula"


@lru_cache
def get_settings() -> Settings:
    return Settings()
