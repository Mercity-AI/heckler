"""Entry point: `python -m heckler.main` or the `heckler` console script."""

from __future__ import annotations

import argparse
import logging

import uvicorn

from .api.app import create_app


def run() -> None:
    parser = argparse.ArgumentParser(description="Run the Heckler API server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--log-level", default="info")
    args = parser.parse_args()
    logging.basicConfig(level=args.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    uvicorn.run(create_app(), host=args.host, port=args.port, log_level=args.log_level)


if __name__ == "__main__":
    run()
