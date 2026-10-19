# Heckler UI

React dashboard for the Heckler backend. Connect an agent, start an evaluation, and watch evaluator agents A, B and C hold live conversations with it, each graded against the agent's own system prompt.

## Run it

```bash
# terminal 1: the backend (from the repo root)
python -m heckler.main                       # http://127.0.0.1:8000

# terminal 2: the UI
cd web
npm install
npm run dev                                  # http://localhost:5173
```

The dev server proxies `/api/*` to the backend, so you don't need CORS. To point it somewhere else:

```bash
HECKLER_API_URL=http://127.0.0.1:8765 npm run dev
#   PowerShell: $env:HECKLER_API_URL='http://127.0.0.1:8765'; npm run dev
```

For a static build that calls the API directly, set `VITE_API_URL` at build time (`VITE_API_URL=https://heckler-api.example.com npm run build`) and add the UI's origin to `HECKLER_CORS_ORIGINS`.

To try it offline for free, start the backend with the fake providers (see the root README), then connect an **Offline demo** agent from the UI.

## Screens

- **New evaluation** (`/`): pick an agent, choose how many Simula scenarios to generate (or replay an earlier run's scenarios for regression testing), set turns and parallelism, then launch. `Ctrl+Enter` launches. `N` opens this page from anywhere.
- **Run** (`/runs/:id`): the live view.
  - Header with a WebGL flow field that moves while the run is active and shifts toward red as instruction breaches come in.
  - Tiles for instruction breaches, policy violations, held policy and mean score.
  - **Conversations** tab: every chat streams in real time, with typing indicators and violation evidence highlighted in the transcript.
  - **Insights** tab:
    - Charts: a score timeline with a running mean, the score distribution, the turn of the first violation, dimensions per evaluator, and score by difficulty.
    - Also: weakest dimensions, verdict mix, policy findings grouped by rule, per-evaluator and per-category breach rates, and recommended prompt changes.
  - **Scenarios** tab: the Simula taxonomy as a coverage map, plus every scenario.
  - Clicking a chat opens the full transcript next to the evaluator's report (`↑`/`↓` steps through chats). The URL holds the open chat and tab, so links are shareable.
- **Your agents** (`/agents`): connected endpoints, connection test, system prompt, and latest result.
- **Sidebar**: run history with live status and breach rates. Collapse it to an icon rail with the button at the top or `[`; the choice is remembered.

## How live updates work

`useRunStream` (`src/hooks/useRunStream.ts`) subscribes to `GET /runs/{id}/events` and folds every event into one reducer.

- **Refresh-safe:** the server replays the run's full history first, so reloading the page rebuilds everything.
- **Old runs:** runs from an earlier server process arrive as a single `run.snapshot`. Their transcripts are then fetched over REST.

## Stack

- **App:** Vite, React 19, TypeScript and Tailwind v4.
- **Components:** Radix primitives (dialog, tooltip, slider) and Motion for transitions.
- **Data:** TanStack Query for REST.
- **Visuals:** no chart library; charts are plain HTML/SVG. The design tokens, fonts and dithered canvas backdrops follow mercity.ai.
