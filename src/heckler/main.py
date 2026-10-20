"""Entry point: `python -m heckler.main` or the `heckler` console script."""

from __future__ import annotations

import argparse
import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

import uvicorn

from .api.app import create_app
from .config import get_settings

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def configure_logging(level: str, log_file: Path) -> None:
    """Log to the console and to a rotating UTF-8 file, so a run can be traced after the fact."""
    # A console on a legacy code page (cp1252 on Windows, or stdout redirected to a file) can't encode
    # characters like "→"; replace them instead of raising mid-run.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="backslashreplace")
    log_file.parent.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(log_file, maxBytes=10_000_000, backupCount=5, encoding="utf-8")
    logging.basicConfig(level=level.upper(), format=LOG_FORMAT, handlers=[logging.StreamHandler(), file_handler])


def run() -> None:
    parser = argparse.ArgumentParser(description="Run the Heckler API server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--log-level", default="info")
    parser.add_argument("--log-file", type=Path, default=None, help="default: <HECKLER_DATA_DIR>/logs/heckler.log")
    args = parser.parse_args()
    configure_logging(args.log_level, args.log_file or get_settings().data_dir / "logs" / "heckler.log")
    # log_config=None: uvicorn's own loggers propagate to ours, so request logs land in the file too.
    uvicorn.run(create_app(), host=args.host, port=args.port, log_level=args.log_level, log_config=None)


if __name__ == "__main__":
    run()
