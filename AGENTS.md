# AGENTS.md

Customer portal for Blank CO PH Solutions (branded "neostar"): a React 19 + TypeScript single-page app backed directly by Supabase Auth/PostgREST.

## Commands

- `npm run dev` — Vite dev server on `--host` (port 5173, matching `supabase/config.toml` redirect URLs).
- `npm run typecheck` — `tsc -b` only. This is the fastest verification step.
- `npm run build` — `tsc -b && vite build`; run before calling work done.
- There are no test, lint, or formatting scripts. Do not invent them; if validation is needed, use typecheck + build.

## Repo shape

- `src/App.tsx` — the entire UI (auth screen, dashboard, tables, modals, settings) in one large component file. Prefer targeted edits over splitting it up.
- `src/lib/portal-data.ts` — the only data layer. Maps snake_case Supabase rows into the camelCase display types in `src/types.ts` and performs inserts/updates.
- `src/lib/supabase.ts` — client created only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are both set; `supabase` is `null` otherwise.
- `src/lib/session-store.ts` — shared auth session store (`useSyncExternalStore`); mount/unmount via `startAuthSessionStore()` in `App`.
- `src/lib/ticket-intake.ts` — second Supabase client for the landing-page admin inbox (`public.messages`). `createSupportTicket` writes both the landing ticket and the customer-scoped `support_tickets` row, then invokes the landing project's `notify-ticket` Edge Function, which emails the ticket to `hello@blankcoph.solutions` via GoDaddy Titan SMTP.
- `src/lib/chat.ts` — customer-side support chat. Obtains the CPL session token and calls the landing project's `chat` Edge Function; customer identity is verified against CPL's public JWKS. The Support page lists conversations and opens a chat modal that refreshes every few seconds.
- `src/styles.css` — all styling; UI relies on existing class names (`.panel`, `.page-card`, `.badge` statuses via `statusClass`, etc.).
- `supabase/migrations/` — schema, triggers, and RLS policies. This is the real backend contract.

`README.md` is mostly a product/feature spec. Sections describing the admin panel, Go backend, payment gateway, notifications, and roadmap are planned features, not current code. Only the "Current implementation" notes near the top reflect what exists.

## Data and Supabase constraints

- The browser uses only the anon key. Never add service-role keys or server secrets to `.env`/`VITE_*`.
- Supabase is optional: the app must keep working in in-memory demo mode when env vars are absent. Guard every `supabase` use (`isSupabaseConfigured`, `supabase?.`).
- Demo mode is intentionally ephemeral: empty starting data, no localStorage persistence. Old keys `blank-co-ph-solutions-demo-state` / `northstar-demo-state` are cleared on mount.
- RLS is the authorization boundary. Clients can only select their own rows (matched by `auth.uid() = customer_id`/`id`). Inserts are restricted:
  - orders: `total_amount = 0`, `status = 'Pending'`, `payment_status = 'Pending'`
  - support tickets: `status = 'Open'`
  - invoices/payments: select-only from the browser; do not add client-side creation or invoice editing.
- `saveProfile` updates `profiles` only; email changes go through `supabase.auth.updateUser` and may require confirmation.
- New schema changes belong in a new timestamped file under `supabase/migrations/`; do not rewrite the existing applied migration unless explicitly asked.
- Keep amounts as `numeric` in Postgres and PHP (`Intl.NumberFormat('en-PH', { currency: 'PHP' })`) in the UI. Do not introduce FX conversion.
- Status strings are constrained by DB `check` clauses and the UI's lowercase-dash CSS classes. Keep them in sync with the migration and the filter option lists.

## Conventions / gotchas

- `tsconfig` uses `strict`, `noUnusedLocals`, `noUnusedParameters`, and `verbatimModuleSyntax` — use `import type` for type-only imports and remove unused symbols.
- TS build is project-references based (`tsconfig.app.json` for `src`, `tsconfig.node.json` for Vite config).
- `.env` is gitignored and already present locally; `.env.example` documents the required variables. Never commit real keys.
- When embedding the app in the landing site, build with `VITE_BASE_PATH=/portal/` (the landing build script does this automatically) so assets resolve under `/portal/assets/`.
- Branding is inconsistent by design: product name "neostar", legal/company name "Blank CO PH Solutions", and assets under `public/neostar-*`. Preserve existing labels when editing UI copy.
