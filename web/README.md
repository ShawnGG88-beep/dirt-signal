# Dirt Signal web dashboard

Responsive web version of the Dirt Signal desktop dashboard, installable as
a PWA on iOS. It talks directly to Supabase with the publishable (anon) key
plus Supabase Auth; there is no FastAPI sidecar dependency. The UI, tokens,
types and pure logic are shared with the desktop app via
`@dirt-signal/shared`.

## Prerequisites

- Node 20 or newer (`engines` in the root `package.json`)
- pnpm 10 (`packageManager` pins `pnpm@10.33.3`; `corepack enable` gives
  you the right version automatically)
- A Supabase project with migrations `001` to `009` applied
  (`supabase/migrations/`), including `009_web_auth_rls.sql`, which this
  app's row-level security depends on

## Auth model

Single user, email and password, via Supabase Auth. **There is no sign-up
flow.** Create the account once in the Supabase dashboard (Authentication,
Add user, tick auto-confirm). The session persists in localStorage
(supabase-js default), so a phone stays signed in between visits. All
row-level security policies target the `authenticated` role; the anon key
alone can read nothing.

## Local development

```bash
# from the repo root
pnpm install

# configure Supabase credentials
cp web/.env.example web/.env
# then fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

pnpm --filter dirt-signal-web dev
```

Only the publishable (anon) key belongs in `web/.env`. Never put the
service role key anywhere under `web/`; it bypasses row-level security on
every table.

## Production build

```bash
# from the repo root
pnpm --filter dirt-signal-web... build
# output lands in web/dist
```

The build needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the
environment (Vite inlines them at build time). A build without them
succeeds but renders a configuration notice instead of the login screen.

## Deploying to Vercel

Configuration lives in `vercel.json` **at the repo root**, and the Vercel
project's Root Directory is left at the repo root too. Reasoning: with the
root as the project root, the install command runs against the single
workspace lockfile exactly as it does locally, and no reliance is placed on
Vercel's subdirectory lockfile discovery or the "Include source files
outside of the Root Directory" toggle (that setting only matters when the
Root Directory is a subdirectory, which it is not here).

Project settings when connecting the repo:

| Setting | Value |
|---------|-------|
| Framework preset | Vite (cosmetic; `vercel.json` overrides the commands) |
| Root Directory | leave empty (repo root) |
| Install command | taken from `vercel.json`: `pnpm install --frozen-lockfile` |
| Build command | taken from `vercel.json`: `pnpm --filter dirt-signal-web... build` |
| Output directory | taken from `vercel.json`: `web/dist` |
| Node version | project default 20+ (root `engines` requires >= 20) |
| pnpm version | resolved from the root `packageManager` field via corepack |

The `...` suffix in the build command includes workspace dependencies of
`dirt-signal-web`, so `@dirt-signal/shared` is built first if it ever gains
a build step (today it is consumed as source and has none).

Environment variables (Project Settings, Environment Variables, set for
Production and Preview):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Pushes to `main` that change files under `web/` or `shared/` trigger a
fresh production deployment on Vercel (see `ignoreCommand` in
`vercel.json` at the repo root).

Nothing else is required for a production build. Supabase needs no
configuration for the new origin: password sign-in has no OAuth redirect,
and the Supabase API accepts requests from any origin.

`vercel.json` also contains:

- an SPA rewrite (`/(.*)` to `/index.html`) so direct navigation and
  refresh never 404; in-app routing is hash-based on top of that
- an `ignoreCommand` that skips builds when nothing under `web/`,
  `shared/`, or the workspace files changed, so Pi collector or ml-backend
  commits do not trigger deploys

What was tested without a live Vercel project: the exact install command
from a wiped `node_modules` against the committed lockfile, the exact
build command, and the output directory contents (index.html, hashed
assets, `manifest.webmanifest`, `sw.js`, icons). What needs checking on
the first real deploy: the build goes green in Vercel's environment, a
deep URL like `/anything` serves the app (rewrite working),
`/manifest.webmanifest` is reachable, sign-in works from the `vercel.app`
URL, and Add to Home Screen on an iPhone yields a standalone app with the
dark theme colour.

## PWA behaviour

- The service worker precaches the app shell only. **No data is ever
  served from cache**: Supabase requests always go to the network, so
  readings are live or absent, never stale.
- Offline, the shell loads and a banner states that data is not live plus
  the time of the last successful fetch.
- The dashboard header shows "updated Xs ago" so a stalled Pi is obvious.
- Polling pauses while the tab is hidden and refetches on return.

## Known parity gaps (by design, not bugs)

1. **No alert evaluation runs here.** The alert engine lives in the
   desktop app's FastAPI sidecar and evaluates only while that app is
   open. This dashboard shows recorded firings and supports acknowledge,
   enable/disable, promote/demote notify, snooze and CSV export; the
   "Evaluate now" control is deliberately absent and the Alerts view
   carries a prominent note. Continuous server-side evaluation is future
   work.
2. **Observation images show "Image not uploaded".** The Pi stores
   captures on its own filesystem and records only a local path; nothing
   is uploaded to Supabase Storage yet. Metadata (time, light condition,
   NDVI estimate, notes) is live. When the collector gains Storage
   upload, `src/lib/observationImages.ts` is the single place that swaps
   in signed URLs.
3. **Notifications** fire only while a tab is open, on platforms exposing
   the Notification API. iOS Safari outside an installed PWA does not,
   and the adapter reports that honestly. There is no push service.
4. **Rule `params` are not editable from the web.** The migration 009
   column grants exclude them on purpose; tuning stays a desktop/sidecar
   concern and the web client rejects a params patch with a clear
   message.
5. **"Offline" here means Supabase is unreachable**, whereas on desktop
   it means the sidecar is unreachable. Staleness thresholds are shared:
   2x `devices.collector_interval_seconds`.
6. Soil tests and Observations exist only on the web (the desktop app
   never had those views), and the web requires sign-in while desktop
   trusts its local sidecar.
