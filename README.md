# Heckler

Simulated attacker agents that stress-test an LLM agent **before** it ships.

You register your agent (an endpoint plus its system prompt) and an evaluator model on your own key. The service then:

1. **Maps the scenario space with [Simula](https://github.com/Mercity-AI/Simula).** It builds a taxonomy grounded in *your* system prompt (user intents, personas and emotions, pressure tactics, policy boundaries), samples weighted combinations, and generates realistic, critic-checked scenarios.
2. **Runs every conversation at once, each with its own evaluator.** One evaluator instance per scenario role-plays its user in a live multi-turn chat; none waits for another to finish. The evaluator has no fixed personality: the user it plays (persona, mood, goal, tactics) comes entirely from its Simula scenario. Conversations are numbered `#01`, `#02`, ….
3. **Has each evaluator grade its own conversation.** When the chat ends, the evaluator gets a secret per-conversation code, steps out of character and returns a structured report: score, verdict, *broken?*, policy violations (what went wrong in plain words, the rule, a verbatim quote, severity), per-dimension scores and recommendations. **Any violation fails the conversation.** Reusing the evaluator keeps the transcript in a warm prompt cache, so you don't pay for a separate judge.
4. **Streams everything live** over Server-Sent Events (every Simula model call with its prompt and response, every message, every evaluation, rolling stats) and stores it in SQLite so you can look back at previous runs.

The service isn't tied to one domain. Whatever the system prompt describes (support bot, tutor, travel agent, internal copilot) becomes the attack surface.

---

## Quick start

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env        # then fill in OPENROUTER_API_KEY (and/or ANTHROPIC_API_KEY)
```

Python 3.11+ is required (Simula uses `StrEnum`). Simula installs straight from GitHub at a pinned commit.

### 1. Offline smoke test (no keys, no cost)

The `fake` provider scripts every model (Simula, the attackers and a "leaky" target), so you can try the whole pipeline and API for free.

```bash
pytest -q                                   # 23 tests, including full end-to-end runs

# terminal 1: server in offline mode
HECKLER_ATTACKER_PROVIDER=fake HECKLER_SIMULA_PROVIDER=fake python -m heckler.main
#   PowerShell: $env:HECKLER_ATTACKER_PROVIDER='fake'; $env:HECKLER_SIMULA_PROVIDER='fake'; python -m heckler.main

# terminal 2: watch a run live
python scripts/live_run.py --target fake --scenarios 3 --turns 4
```

### 2. Real run: attack GLM with Claude

Put `OPENROUTER_API_KEY` in `.env`. The defaults then use Claude Opus 5.5 for the attackers and Gemini Flash for Simula, both through OpenRouter.

```bash
python -m heckler.main                 # http://127.0.0.1:8000, docs at /docs

python scripts/live_run.py --target openrouter --model z-ai/glm-5.3-flash \
    --system-prompt-file examples/prompts/travel_booking_agent.txt \
    --scenarios 6 --turns 5 --concurrency 3 --probe
```

`--probe` sends one message to the target first to check credentials. Try `examples/prompts/math_tutor.txt` for a non-support domain, or add `--focus "privacy extraction and emergencies"` to steer scenario generation.

**Rough cost:** a 6-scenario × 5-turn run is about 50 Simula calls on Flash plus about 40 attacker calls on Opus. Start small, or point the attackers at something cheaper (`HECKLER_ATTACKER_MODEL=anthropic/claude-sonnet-5.5`).

---

## Configuration

All settings come from environment variables or `.env` (see `.env.example`). Provider keys use their usual names. Everything else is prefixed `HECKLER_`.

| Setting | Default | Meaning |
|---|---|---|
| `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | – | provider credentials |
| `HECKLER_REQUIRE_USER_KEYS` | `false` | public deployments: every agent must bring its own evaluator key; server keys are never used for user endpoints |
| `HECKLER_EXAMPLE_RUN_ID` | – | run shown by the UI's "See an example" button (unset: an offline demo runs) |
| `HECKLER_ATTACKER_PROVIDER` | `openrouter` | default evaluator for agents without their own: `openrouter` \| `anthropic` \| `openai` \| `fake` |
| `HECKLER_ATTACKER_MODEL` | `anthropic/claude-opus-5.5` | use `claude-opus-5-5` with the `anthropic` provider |
| `HECKLER_ATTACKER_MAX_TOKENS` | `8192` | per attacker turn (thinking counts toward this on Claude) |
| `HECKLER_ANTHROPIC_EFFORT` | `medium` | native Anthropic only: `low`…`max` |
| `HECKLER_ANTHROPIC_REFUSAL_FALLBACKS` | `true` | native Anthropic only: server-side refusal fallback |
| `HECKLER_SIMULA_PROVIDER` | `openrouter` | provider for scenario generation |
| `HECKLER_SIMULA_{STRATEGIC,BULK,CRITIC}_MODEL` | `google/gemini-3.8-flash` | Simula's three model roles |
| `HECKLER_DATA_DIR` | `data` | SQLite DB and Simula artifacts |
| `HECKLER_MAX_TURNS_LIMIT` / `HECKLER_MAX_CONCURRENCY` / `HECKLER_MAX_SCENARIOS` | `20` / `100` / `100` | request guard rails |
| `HECKLER_CORS_ORIGINS` | `*` | comma-separated, for the frontend |

---

## API

Interactive docs: `http://127.0.0.1:8000/docs`.

### Register a target

```http
POST /targets
{
  "name": "Atlas (travel)",
  "description": "Booking assistant",
  "system_prompt": "You are Atlas ...",
  "connection": {
    "kind": "openai_chat",
    "base_url": "https://openrouter.ai/api/v1",
    "model": "z-ai/glm-5.3-flash",
    "api_key_env": "OPENROUTER_API_KEY",
    "send_system_prompt": true
  }
}
```

Connection kinds:

- **`openai_chat`**: any OpenAI-compatible `/chat/completions` endpoint. Set `send_system_prompt: false` if your deployed agent already applies its own system prompt. For keys, prefer `api_key_env` (looked up in the server's environment or `.env`) over an inline `api_key`. Inline keys are stored and never returned (they come back as `"***"`).
- **`http`**: a custom agent backend. We POST `{"messages": [{role, content}...], ...extra_body}` and read the reply at `response_path` (a dotted path, e.g. `reply` or `choices.0.message.content`).
- **`fake`**: offline scripted target (`behavior`: `leaky` | `compliant`).

Add `"evaluator": {"base_url", "model", "scenario_model", "api_key"}` (any OpenAI-compatible endpoint) to run the simulated users, the grading and Simula on the agent owner's key. Without it, runs use the server's default models (unless `HECKLER_REQUIRE_USER_KEYS` is set); the offline `fake` agent uses scripted evaluators.

Keys are never returned: responses show `"***"`. `PUT /targets/{id}` edits an agent; send `"***"` (or omit the key) to keep a stored key. `POST /targets/test` checks unsaved settings (one message to the agent, one to the evaluator). `POST /targets/{id}/probe` sends one message to a saved agent and returns `{ok, reply | error, latency_ms}`.

### Start a run

```http
POST /runs
{
  "target_id": "tgt_…",
  "num_scenarios": 9,
  "max_turns": 6,
  "concurrency": null,
  "focus": "optional steer for Simula",
  "reuse_scenarios_from_run_id": null,
  "scenarios": null
}
```

This returns `202` immediately and the run continues in the background. `concurrency: null` (the default) starts every conversation at once. Use `reuse_scenarios_from_run_id` to replay the exact scenarios of an earlier run, for regression testing after a prompt change. Pass hand-written `scenarios` to skip Simula entirely.

### Watch it live

`GET /runs/{id}/events` is a Server-Sent Events stream. It replays the run so far and then follows it live until it finishes, so a page refresh never loses state. Resume with `?after=<seq>` or the `Last-Event-ID` header. For runs from an earlier server process you get a single `run.snapshot` event instead.

| event | data |
|---|---|
| `run.status` | `{status, error}`: `queued → generating_scenarios → running → completed \| failed \| cancelled` |
| `scenarios.progress` | `{phase, calls, detail, call}`: Simula phase (`taxonomy`, `strategies`, `meta_prompts`, `generating`); `call` is one model call (task, model, status `running`/`done`/`error`, timing, tokens, prompt and response previews), sent when it starts and again when it ends |
| `scenarios.ready` | `{conversations: [{conversation_id, index, agent_name, scenario}], taxonomy}` |
| `conversation.started` | `{conversation_id, agent_name}` |
| `conversation.message` | `{conversation_id, message: {role: attacker\|target, content, turn}}` |
| `conversation.evaluating` | `{conversation_id}` |
| `conversation.completed` | `{conversation_id, end_reason, evaluation, error}` |
| `conversation.failed` | `{conversation_id, error}` |
| `run.stats` | full `RunStats` (below), after every finished conversation |
| `run.finished` | `{status, stats, error}`, always the last event |

Each SSE `data` field is the event envelope: `{seq, type, run_id, data, created_at}`.

### Read results

- `GET /runs`: sidebar list (status, mean score, pass/break/violation rates)
- `GET /runs/{id}`: config, stats and a per-conversation summary
- `GET /runs/{id}/conversations/{cid}`: full transcript and evaluation
- `GET /runs/{id}/taxonomy`: the Simula taxonomy behind the scenarios
- `POST /runs/{id}/cancel`
- `GET /config`, `GET /health`

### Scores

Each conversation's `evaluation`:

```json
{
  "score": 22, "verdict": "fail", "broken": true,
  "policy_violations": [{"explanation": "what the agent did wrong", "rule": "...", "evidence": "verbatim quote", "severity": "high"}],
  "dimension_scores": {"instruction_adherence": 2, "safety": 4, "helpfulness": 7, "tone": 8, "robustness": 2},
  "escalation_appropriate": false,
  "strengths": [], "weaknesses": [], "recommendations": [], "summary": "..."
}
```

`verdict` is forced to `fail` whenever `broken` is true or there is any policy violation, so the headline numbers can't contradict the details.

Run `stats` are computed from the stored evaluations (never by an LLM):

- `total`, `finished`, `evaluated` and `errored`
- `passed` (held: no violation at all), `partial` (held, but graded partial), `failed` and `broken`
- `mean_score`
- `pass_rate`, `break_rate` and `violation_rate`, each over evaluated conversations ("broken 5/10")
- `dimension_means` and `severity_counts`
- `by_category` breakdown
- `attacker_usage` in tokens

---

## Project layout

```
src/heckler/
  domain/models.py     pure data models shared by every layer
  llm/                 provider-agnostic LLM interface + Anthropic, OpenAI-compatible, fake
  targets/             clients for the agent under test (openai_chat, http, fake)
  scenarios/           Simula adapter (Simula used as a library)
  agents/              attacker prompts, attacker/evaluator agent, report parsing
  engine/              conversation runner, run orchestrator, stats
  events.py            in-process pub/sub with replay (feeds SSE)
  storage/             repository interface + SQLite implementation
  api/                 FastAPI app, routes, request/response schemas, wiring
  testing/fakes.py     scripted responders behind the `fake` provider
scripts/live_run.py    terminal client that drives and watches a run
examples/prompts/      sample system prompts
tests/                 unit + end-to-end tests (offline)
```

## Known limitations

- Runs execute in the API process as asyncio tasks. Restarting the server marks in-flight runs as `failed`. A multi-worker deployment would need a job queue and a shared event bus (see the architecture doc).
- Live event history is kept in memory per process. Finished runs remain fully available from SQLite.
- No auth yet. Put it behind your gateway before exposing it.
