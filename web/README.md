# Heckler UI

React dashboard for the Heckler backend. Connect an agent, start an evaluation, and watch simulated users hold live conversations with it in parallel, each graded against the agent's own system prompt.

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

To require sign-in, copy `.env.example` to `.env.local` and set `VITE_CLERK_PUBLISHABLE_KEY` (and the matching key on the backend; see the root README's Auth section).

For a static build that calls the API directly, set `VITE_API_URL` at build time (`VITE_API_URL=https://heckler-api.example.com npm run build`) and add the UI's origin to `HECKLER_CORS_ORIGINS`.

To try it offline for free, start the backend with the fake providers (see the root README), then connect an **Offline demo** agent from the UI.

## Screens

- **Connect** (`/`): a short intro, "See an example" (a pinned run, or a free offline demo), a picker for saved agents, and the connect form. The form has two parts: **your agent** (name, system prompt, endpoint and key) and the **evaluator model** (endpoint, evaluator model, scenario model and key, all on the user's own key). "Test connection" checks both before saving. `N` opens this page from anywhere.
- **Design the test** (`/evaluate/:targetId`): how many conversations, an optional focus, max turns, or replay an earlier run's scenarios. Every conversation runs in parallel. `Ctrl+Enter` launches.
- **Run** (`/runs/:id`): the live view.
  - Header with a WebGL flow field that keeps drifting (faster while the run is active) and shifts toward red as breaches come in.
  - While Simula works: the real call log. Each model call shows as it starts and finishes, with model, timing, tokens and a one-line result; click it to see the prompt and response. Drafted scenario titles stream in alongside.
  - Tiles: violated policy (any violation fails a chat), held policy, instruction breaches and mean score.
  - **Conversations** tab: numbered cards (`#01`, `#02`, …) streaming in real time, with violation evidence highlighted.
  - **Insights** tab: outcomes, weakest dimensions, score distribution, turn of first violation, a score-by-difficulty box plot, policy findings grouped by rule, per-category violation rates and recommended prompt changes.
  - **Scenarios** tab: the Simula taxonomy as a coverage map, plus every scenario.
  - Clicking a chat opens the transcript next to **Report**, **Policy violations** and **Scenario** tabs. Hover highlighted evidence for what went wrong; click it to open that violation. Click a violation to jump to it in the transcript. The URL holds the open chat and tab, so links are shareable.
- **Agents** (`/agents`): connected agents with their evaluator and latest result. Edit or evaluate each.
- **Sidebar**: run history, one line per run with an outcome dot. Collapse it to an icon rail with the button at the top or `[`; the choice is remembered.

## How live updates work

`useRunStream` (`src/hooks/useRunStream.ts`) subscribes to `GET /runs/{id}/events` and folds every event into one reducer.

- **Refresh-safe:** the server replays the run's full history first, so reloading the page rebuilds everything.
- **Old runs:** runs from an earlier server process arrive as a single `run.snapshot`. Their transcripts are then fetched over REST.

## Stack

- **App:** Vite, React 19, TypeScript and Tailwind v4.
- **Components:** Radix primitives (dialog, tooltip, slider) and Motion for transitions.
- **Data:** TanStack Query for REST.
- **Visuals:** no chart library; charts are plain HTML/SVG. The design tokens, fonts and dithered canvas backdrops follow mercity.ai.
