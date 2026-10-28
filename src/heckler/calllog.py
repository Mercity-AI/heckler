"""Local record of every model call a run makes: one JSON line per call in `<dir>/<run_id>.jsonl`.

Off unless `HECKLER_CALL_LOG_DIR` is set. It is meant for local debugging and cost checks: lines hold prompts, outputs
and costs in plaintext, unlike the database (encrypted) and the server log (ids, counts and timings only),
so never turn it on for a shared deployment.

Roles: `scenario` (Simula, with its full system prompt, messages and output), `guard_policy` (with the
policy written), `evaluator_turn` and `evaluator_grade` (with the evaluator's output), `agent` (the agent's
reply), `guard` (every rule's probability), and one `run_summary` line when the run ends.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any

from .domain.models import utcnow

logger = logging.getLogger(__name__)


class CallLog:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def path(self, run_id: str) -> Path:
        return self.directory / f"{run_id}.jsonl"

    def write(self, run_id: str, role: str, **fields: Any) -> None:
        """Append one line. Never raises: a full disk must not take a run down with it."""
        line = json.dumps({"at": utcnow().isoformat(), "run_id": run_id, "role": role, **fields}, default=str, ensure_ascii=False)
        try:
            with self._lock, self.path(run_id).open("a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError as exc:
            logger.warning("could not write the call log for %s: %s", run_id, exc)
