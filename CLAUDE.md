# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KPF Production-Line is an ERP/inventory management system for KPF Foods, built with Next.js (App Router) on the frontend and a separate Express API gateway that connects to on-premise SQL Server databases.

## Commands

**Main App (repo root):**
```bash
npm run dev          # Start Next.js dev server (webpack)
npm run build        # Production build
npm run start        # Run production server
npm run lint         # ESLint (Next.js core-web-vitals)
npm run analyze      # Bundle analyzer build
npm run gen:types    # Regenerate Supabase TypeScript types
npm run repair:subplan-snapshots -- --master-plan=MP-YYYY-MM-NNN --apply
npm run repair:bom-item-units -- --apply
node scripts/run-production-planning-uat-evidence.mjs
python scripts/generate_barcode.py <value>   # Code 128 barcode SVG
```

**API Gateway (from `kpf-api-gateway/`):**
```bash
npm run dev    # Run gateway server
npm run start  # Same as dev
```

**Tests:** No test runner configured. If adding tests, use `node --test path/to/test.js`.

## Architecture

### Two-Service Setup

```
Browser → Next.js Frontend (port 3002 prod)
        → KPF API Gateway (port 4000)
        → SQL Server ERP (192.168.210.5) + SQL Server HR (192.168.210.6)

Browser → Next.js API Routes (/api/*)
        → Supabase PostgreSQL (auth, roles, permissions, metadata)
```

### Frontend: Next.js App Router

- `src/app/` — Routes and API handlers; every route file must be `page.js`, `layout.js`, or `route.js`
- `src/components/` — Shared UI components (PascalCase filenames)
- `src/features/` — Feature modules organized by domain (each has components, services, hooks)
- `src/lib/` — Shared utilities; server-only modules use `import "server-only"`
- `src/types/supabase.ts` — Auto-generated; never hand-edit (use `npm run gen:types`)

Route groups: `(public)` for auth-free pages, `admin/` for admin-only pages. Auth is enforced in `middleware.js` — exempt paths: `/login`, `/unauthorized`, `/production-line/bom/approval/liff` (LINE LIFF integration), `/apk`, `/manifest.json`, `/manifest.webmanifest`, and prefix-based: `/apk/*`, `/brand/*`, `/icons/*`. The middleware matcher skips all `/api/*` routes entirely, so Next.js API routes have no automatic auth — they must enforce it themselves.

**Feature domains in `src/features/`:** admin, attendance, auth, department-lookup-27, employees, hr, performance, printing, production-line, production-line-settings, production-planning, products, raw-material-requisitions, raw-materials, settings, sku-min-max, suppliers.

**Full data flow:** `src/app/[route]/page.js` → feature component → `hooks/use*.js` (state + actions) → `services/*Client.js` (browser-safe, calls `/api/*`) → `src/app/api/*/route.js` → `services/*Service.js` (server-only, calls Supabase or gateway).

**API route pattern:** All `route.js` files set `export const dynamic = "force-dynamic"` and delegate to services in `/features/[domain]/services/`. Never put business logic directly in route handlers.

**Service naming within features:** `*Client.js` = browser-safe (calls Next.js API routes via `fetchJson` from `src/lib/clientFetch.js`). `*Service.js` = server-only (calls Supabase or `gatewayClient`). Both live in `features/[domain]/services/`.

### Backend: API Gateway (`kpf-api-gateway/`)

- Single `server.js` file containing all Express routes
- CommonJS (`require`) style — not ESM
- Dual SQL Server connection pools (ERP + HR databases)
- Authentication: Cloudflare Access JWT (`cf-access-jwt-assertion` header) or `x-api-key`
- Response caching: 30s default, 60s for LOT data
- Cursor-based pagination uses base64url JSON encoding

### Authentication & Permissions

- **User auth**: Supabase JWT, enforced by `middleware.js`
- **Gateway auth**: Cloudflare Access headers or API key
- **Role-based permissions**: Stored in Supabase tables (`roles`, `permissions`, `role_permissions`, `user_roles`) — not hardcoded in code
- Admin APIs use Supabase service role via `getSupabaseAdmin()`
- Server-side permission guard: `requirePermissionKeys([...keys])` from `src/lib/permissionGuard.js` — throws if session lacks required permissions
- Permission data is cached in-memory with ~5-minute TTL (`src/lib/permissionsData.js`)

**Adding a new page/tab:** Three steps are required — (1) create the Next.js route, (2) insert a row into `public.permissions` and bind it to roles via `public.role_permissions`, (3) add it to the static `PERMISSION_GROUPS` array in `src/app/admin/settings/page.js` so it appears in the settings UI. Each tab must have its own URL (e.g. `/admin/module/tab`) for per-tab access control. See `DOC/ACCESS_CONTROL_GUIDE.md` for SQL templates.

### Data Fetching Patterns

- Gateway-backed data: may use `unstable_cache` in server components
- Real-time/uncached: use `cache: "no-store"`
- Client-side: SWR hooks
- Gateway URL and key read from env: `KPF_GATEWAY_URL`, `KPF_API_KEY`
- `src/lib/gatewayClient.js` is server-only; deduplicates in-flight requests by method + cacheStrategy + URL
- `src/lib/clientFetch.js` — client-side fetch wrapper returning `ok`/`fail` Result shapes; deduplicates in-flight GETs; `fetcher` export is SWR-compatible

### Integrations

- **LINE messaging**: `src/lib/lineMessaging.js` — push notifications via LINE API
- **Sunmi devices**: `src/lib/sunmiScaleClient.js` + `src/features/printing/` — direct printing to Sunmi hardware

## Code Conventions

**Style:** JavaScript everywhere except `src/types/supabase.ts`. 2-space indent, semicolons, double quotes. No Prettier config — match the file you're editing.

**Imports:** Absolute `@/` paths (from `jsconfig.json`). Group external packages first, then internal `@/` paths.

**Naming:**
- React components: PascalCase
- Hooks: `useX` prefix
- Services/clients: camelCase (e.g., `skuMinMaxService.js`)

**Error handling:**
- Next.js API routes: try/catch with `jsonError` or `ApiError`; return `Response.json(...)` with `status`
- Use `ok`, `fail`, `toJsonResponse` from `src/lib/result.js`
- Gateway: `res.status(code).json({ error, details })`

**Gateway SQL:** Always use parameterized inputs via `request.input(...)`, never string-concatenated queries.

## Environment

- Root app: `.env.local` (never commit)
- Gateway: `kpf-api-gateway/.env` or `.env.local`
- Key vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `KPF_GATEWAY_URL`, `KPF_API_KEY`, SQL Server credentials

## Generated / Sensitive Files

- `src/types/supabase.ts` — generated; do not edit
- `supabase/migrations/` — avoid rewriting migration history
- `profiling-data.*.json` — profiling output; do not commit

## Deployment

Windows Server with PM2 process manager + Cloudflare Tunnel:
- `api.kpfoods.co.th` → gateway at `localhost:4000`
- `data.kpfoods.co.th` → frontend at `localhost:3002`

After any `.env.local` change or gateway code change, restart the relevant PM2 process. Logs:
```bash
pm2 logs kpf-api-gateway
pm2 logs production-line
```
