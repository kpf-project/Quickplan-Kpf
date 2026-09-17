# Production-Line Architecture Guide (Plain Language)

This guide explains what each main folder means, how data flows, and gives one detailed example file.

## Quick Data Flow (start to finish)
1) A user opens a page in `src/app/...` (this is the route entry).
2) The route renders a feature UI component from `src/features/.../components`.
3) The UI calls a hook from `src/features/.../hooks` to manage state and actions.
4) The hook calls a client service in `src/features/.../services` (browser-safe).
5) The client service calls `/api/...` routes.
6) API routes in `src/app/api/...` call server services in `src/features/.../services` (server-only).
7) Server services talk to Supabase or KPF gateway and return typed Result shapes.

## Folder Map (human-friendly)
- `src/app/`  
  The "pages" of the app. Each file here is a route.  
  We keep only routing/layout logic here (no business rules).

- `src/app/api/`  
  The server API endpoints. They validate input and call feature services.  
  They do not talk to Supabase/gateway directly anymore.

- `src/features/`  
  Each business area (products, suppliers, raw-materials, attendance, etc.) lives here.  
  Typical subfolders:
  - `components/` UI only (presentational; no direct data access).
  - `hooks/` UI state + actions (fetching, pagination, etc.).
  - `services/` data access (either client or server usage).

- `src/components/`  
  Shared UI building blocks used by many features.

- `src/lib/`  
  Shared helpers: validation, Result helpers, gateway client, session tools, etc.

- `DOC/`  
  Project docs like this guide.

## One File, Explained in Detail (Example)
File: `src/features/products/hooks/useProductsPage.js`

Purpose (plain language):
- This hook is the "brain" of the Products screen.
- It fetches products, tracks pagination, loading state, and search filters.
- UI components just display values from this hook.

What it does step-by-step:
1) Keeps UI state like `loading`, `pagination`, `searchText`, `selectedIccat`.
2) Builds query parameters based on current UI inputs.
3) Calls the client service (`fetchProducts`, `fetchIccatTypes`) to load data.
4) Updates state so the UI can re-render with the new data.
5) Exposes actions like `handleSearch`, `toggleIccat`, `fetchPage`.

Mini example (usage):
```jsx
import { useProductsPage } from "@/features/products/hooks/useProductsPage";

export default function ProductsPageClient() {
  const { rows, loading, pagination, handleSearch } = useProductsPage();

  return (
    <>
      <button onClick={handleSearch} disabled={loading}>Search</button>
      <div>{pagination.totalRecords} items</div>
      <ul>{rows.map((row) => <li key={row.id}>{row.SKU_NAME}</li>)}</ul>
    </>
  );
}
```

Why this is good:
- UI is simple and only shows data.
- Logic is in one place, easy to test and update.
- No direct Supabase/gateway calls from the UI.

## Files That Work the Same Way (no need to re-explain)
These follow the same pattern as the example above:
- `src/features/suppliers/hooks/useSuppliersPage.js`
- `src/features/attendance/hooks/useAttendancePage.js`
- `src/features/employees/hooks/useEmployeesPage.js`
- `src/features/sku-min-max/hooks/useSkuMinMaxPage.js`

## Example Service Files (same idea)
Client services (browser-side API calls):
- `src/features/products/services/productsClient.js`
- `src/features/raw-materials/services/rawMaterialsClient.js`

Server services (talk to Supabase or KPF gateway):
- `src/features/products/services/productsService.js`
- `src/features/raw-materials/services/rawMaterialsService.js`
- `src/features/admin/services/usersService.js`

## Rule of Thumb (easy checklist)
- If it renders UI -> `components/`
- If it holds state or actions -> `hooks/`
- If it talks to data -> `services/`
- If it defines a route -> `app/`
