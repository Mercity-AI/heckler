"""Register a target, start a run, and watch the attack live in your terminal.

Talks to a running API server over HTTP only (exactly what a frontend would do).

    # offline, no keys needed (server started with HECKLER_ATTACKER_PROVIDER=fake HECKLER_SIMULA_PROVIDER=fake)
    python scripts/live_run.py --target fake

    # real: GLM on OpenRouter as the target, Claude attackers (server needs OPENROUTER_API_KEY)
    python scripts/live_run.py --target openrouter --model z-ai/glm-5.3-flash \
        --system-prompt-file examples/prompts/travel_booking_agent.txt --scenarios 6 --turns 5
"""

from __future__ import annotations

import argparse
import json
import sys
import textwrap
from pathlib import Path

import httpx

COLORS = {"Agent A": "\033[95m", "Agent B": "\033[93m", "Agent C": "\033[96m"}
RESET, DIM, BOLD, RED, GREEN, YELLOW = "\033[0m", "\033[2m", "\033[1m", "\033[91m", "\033[92m", "\033[33m"


def target_payload(args: argparse.Namespace, system_prompt: str) -> dict:
    if args.target == "fake":
        connection = {"kind": "fake", "behavior": "leaky"}
    elif args.target == "openrouter":
        connection = {
            "kind": "openai_chat",
            "base_url": "https://openrouter.ai/api/v1",
            "model": args.model,
            "api_key_env": "OPENROUTER_API_KEY",
            "send_system_prompt": True,
            "max_tokens": 2048,
        }
    else:  # any OpenAI-compatible endpoint
        connection = {
            "kind": "openai_chat",
            "base_url": args.target_base_url,
            "model": args.model,
            "api_key_env": args.target_api_key_env,
            "send_system_prompt": True,
        }
    return {"name": args.name, "description": args.description, "system_prompt": system_prompt, "connection": connection}


def short(text: str, width: int = 110) -> str:
    return textwrap.indent(textwrap.fill(text, width), "      ")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--target", choices=["fake", "openrouter", "openai_compatible"], default="fake")
    parser.add_argument("--model", default="z-ai/glm-5.3-flash", help="target model id")
    parser.add_argument("--target-base-url", default="http://localhost:8001/v1")
    parser.add_argument("--target-api-key-env", default="TARGET_API_KEY")
    parser.add_argument("--system-prompt-file", type=Path, default=Path("examples/prompts/travel_booking_agent.txt"))
    parser.add_argument("--name", default="Demo agent")
    parser.add_argument("--description", default=None)
    parser.add_argument("--scenarios", type=int, default=6)
    parser.add_argument("--turns", type=int, default=5)
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--focus", default=None, help="optional steer for scenario generation")
    parser.add_argument("--probe", action="store_true", help="send one test message to the target first")
    args = parser.parse_args()

    system_prompt = args.system_prompt_file.read_text(encoding="utf-8")
    with httpx.Client(base_url=args.api, timeout=60) as api:
        target = api.post("/targets", json=target_payload(args, system_prompt))
        target.raise_for_status()
        target_id = target.json()["id"]
        print(f"{BOLD}target{RESET} {target_id}  ({args.target}{'' if args.target == 'fake' else ' / ' + args.model})")

        if args.probe:
            probe = api.post(f"/targets/{target_id}/probe").json()
            print(f"{BOLD}probe{RESET} ok={probe['ok']} {probe.get('reply') or probe.get('error')}")
            if not probe["ok"]:
                return 1

        body = {"target_id": target_id, "num_scenarios": args.scenarios, "max_turns": args.turns,
                "concurrency": args.concurrency, "focus": args.focus}
        run = api.post("/runs", json=body)
        if run.status_code >= 400:
            print(f"{RED}could not start run: {run.text}{RESET}")
            return 1
        run_id = run.json()["id"]
        print(f"{BOLD}run{RESET} {run_id}  (stream: {args.api}/runs/{run_id}/events)\n")

        agents: dict[str, str] = {}
        titles: dict[str, str] = {}
        with httpx.Client(base_url=args.api, timeout=None) as stream_client:
            with stream_client.stream("GET", f"/runs/{run_id}/events") as stream:
                event_type = None
                for line in stream.iter_lines():
                    if line.startswith("event:"):
                        event_type = line.split(":", 1)[1].strip()
                        continue
                    if not line.startswith("data:"):
                        continue
                    data = json.loads(line.split(":", 1)[1].strip()).get("data", {})
                    if event_type == "run.status":
                        print(f"{DIM}[run] {data['status']}{RESET}")
                    elif event_type == "scenarios.progress":
                        print(f"\r{DIM}[simula] {data['phase']:<12} {data['calls']} model calls{RESET}", end="", flush=True)
                    elif event_type == "scenarios.ready":
                        print()
                        for c in data["conversations"]:
                            agents[c["conversation_id"]] = c["agent_name"]
                            titles[c["conversation_id"]] = c["scenario"]["title"]
                            print(f"  {COLORS.get(c['agent_name'], '')}{c['agent_name']}{RESET} <- {c['scenario']['title']} "
                                  f"{DIM}[{c['scenario']['category']}, {c['scenario']['difficulty']}]{RESET}")
                        print()
                    elif event_type == "conversation.message":
                        cid, msg = data["conversation_id"], data["message"]
                        agent = agents.get(cid, "?")
                        tag = f"{COLORS.get(agent, '')}{agent:<7}{RESET}" if msg["role"] == "attacker" else f"{GREEN}target {RESET}"
                        print(f"{DIM}{cid[-6:]} t{msg['turn']}{RESET} {tag}\n{short(msg['content'])}")
                    elif event_type == "conversation.completed":
                        e = data["evaluation"]
                        color = GREEN if e["verdict"] == "pass" else YELLOW if e["verdict"] == "partial" else RED
                        broken = f" {RED}BROKEN{RESET}" if e["broken"] else ""
                        print(f"{BOLD}{color}== {data['conversation_id'][-6:]} {titles.get(data['conversation_id'], '')}: "
                              f"{e['verdict'].upper()} {e['score']}/100{RESET}{broken}\n{short(e['summary'])}")
                        for v in e["policy_violations"]:
                            print(f"      {RED}- [{v['severity']}] {v['rule']}{RESET}: {DIM}{v['evidence']}{RESET}")
                    elif event_type == "conversation.failed":
                        print(f"{RED}!! {data['conversation_id'][-6:]} failed: {data['error']}{RESET}")
                    elif event_type == "run.stats":
                        print(f"{DIM}[stats] {data['finished']}/{data['total']} done, mean {data['mean_score']}, "
                              f"broken {data['broken']}/{data['evaluated']}{RESET}")
                    elif event_type == "run.finished":
                        break

        final = api.get(f"/runs/{run_id}").json()
        s = final["stats"]
        print(f"\n{BOLD}run {final['status']}{RESET}" + (f"  {RED}{final['error']}{RESET}" if final["error"] else ""))
        print(f"  evaluated {s['evaluated']}/{s['total']}   errored {s['errored']}")
        print(f"  mean score {s['mean_score']}   pass {s['passed']}  partial {s['partial']}  fail {s['failed']}")
        print(f"  broken {s['broken']}/{s['evaluated']}   with policy violations {s['with_violations']}/{s['evaluated']}")
        print(f"  dimensions {s['dimension_means']}")
        print(f"  severities {s['severity_counts']}")
        for name, g in s["by_agent"].items():
            print(f"  {COLORS.get(name, '')}{name}{RESET}: {g['evaluated']} evaluated, mean {g['mean_score']}, broken {g['broken']}")
        print(f"  attacker usage {s['attacker_usage']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
