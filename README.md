# Alloy Partner Portal

Client-facing partner portal for **Alloy Growth Partners**. A logged-in client (e.g. "RISE Association Management Group") sees their weekly snapshot, action queue, active projects, quarterly roadmap, ROI metrics, support tickets, leads, recognition badges, and a resource library.

This is a migration of the design-handoff prototype (CDN React + in-browser Babel, mock `window.DATA`) into a production-ready **Vite + React 18** SPA, deployable on **Vercel**.

## Status

**Phase 1 — done.** Working Vite + React app, deployable to Vercel today. All UI, styling, interactions, and responsive behavior from the prototype are preserved. Data is still the mock dataset in `src/data.js`.

**Phase 2 — not started.** Supabase backend (Postgres + Auth + RLS + Storage). See [Phase 2 — Supabase](#phase-2--supabase) below.

## Stack

- **Vite 6** + **React 18** (SPA, no router — screens switch via `App` state)
- Plain CSS, lifted verbatim from the handoff (`src/styles/`)
- Fonts from Google Fonts CDN (Poppins / Inter / JetBrains Mono)
- Deploy target: **Vercel** (static build + SPA rewrite via `vercel.json`)

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## Deploy to Vercel

The repo is Vercel-ready. Either:

- **Dashboard:** Import the GitHub repo. Vercel auto-detects Vite (build `npm run build`, output `dist/`). `vercel.json` handles the SPA rewrite.
- **CLI:** `npm i -g vercel && vercel` (then `vercel --prod`).

When Phase 2 lands, add the Supabase env vars in the Vercel project (Settings → Environment Variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. See `.env.example`.

## Project structure

```
index.html              App entry (loads /src/main.jsx, Google Fonts)
vercel.json             Vite framework + SPA rewrite
public/
  alloy-icon.png        Sidebar Alloy mark
  assets/               Client logos (RISE marks, Alloy logo)
src/
  main.jsx              Renders <App>, imports CSS in order, registers <image-slot>
  App.jsx               Root: screen routing, sidebar, role/tweaks state
  data.js               Mock data (DATA) — replaced by Supabase in Phase 2
  components/
    icons.jsx           Inline SVG icon set (I)
    shell.jsx           Sidebar, RisePageHero
    screen-dashboard.jsx  Dashboard + top bar, action queue, weekly snapshot...
    screens-projects-roi.jsx  Projects list + ROI/Insight
    screens-rest.jsx    Roadmap, Tickets, Recognition, Library, Account
  lib/
    image-slot.js       <image-slot> custom element (localStorage-backed)
  styles/               01-base → 06-alloy-hero (import order matters)
```

### What changed from the prototype

- CDN `<script>` tags + in-browser Babel removed; Vite compiles JSX.
- Each component file exposed globals via `window.X = X`. Those are now ES module `export`s with explicit `import`s. Shared deps (`I`, `DATA`) are imported, not global.
- `<image-slot>` (the prototype's 641-line omelette-runtime web component) is replaced by a minimal `src/lib/image-slot.js` that persists to `localStorage`. **In Phase 2 this becomes a Supabase Storage upload.**
- Fixed a stray `}` in `01-base.css` (line 217).
- Asset paths switched to absolute (`/alloy-icon.png`, `/assets/...`) served from `public/`.

## Phase 2 — Supabase

The mock `DATA` object in `src/data.js` is the schema spec. The product is **multi-tenant** (many client accounts): every client-scoped table needs an `account_id` FK enforced with **Row-Level Security**.

Suggested migration order:

1. Create a Supabase project; add `@supabase/supabase-js`; create `src/lib/supabase.js` from the env vars.
2. Apply the schema (see the design handoff README for the full `CREATE TABLE` set: `accounts`, `profiles`, `projects`, `recurring_services`, `tickets`, `leads`, `weekly_snapshots` + items, `roadmap_quarters` + focuses, `roi`, `kpis`, `badges` + `account_badges`, `library_resources`, `activity`).
3. Seed from `src/data.js`.
4. Replace `DATA.*` reads with Supabase-backed hooks (TanStack Query recommended), scoped to the signed-in user's `account_id` via RLS.
5. Add Supabase Auth (email/OTP or SSO); gate the app.
6. Wire Supabase Storage for the profile photo (`<image-slot>`) and the weekly/quarterly PDF downloads.

### Open questions to resolve before Phase 2

- **Auth method:** email magic link / OTP, password, or SSO?
- **Roles** (`owner | bd | ops`) exist in the mock but gate nothing — what should each role see/do?
- **PDFs:** are weekly snapshots / quarterly reports pre-generated files in Storage, or generated on demand?
- **White-labeling:** the portal is meant to be per-account branded (logo, name, colors via tokens). Keep brand values data-driven — confirm scope.

The full data-model notes and UI→table mapping live in the original design handoff (`README.md` inside the handoff bundle).
