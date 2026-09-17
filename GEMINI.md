# Project Context: Quickplan

## Overview
This project is a **Next.js** application designed as an **Employee Data Console** for a production line environment. It is intended to be PWA-ready and likely runs on POS terminals.

The primary function observed is fetching and displaying detailed employee records from a **Microsoft SQL Server** database. It also includes configuration for **Supabase**, though the primary data source for the main view currently appears to be the SQL Server.

## Key Technologies
*   **Framework:** Next.js 16 (App Router)
*   **Language:** JavaScript / React 19
*   **Styling:** Tailwind CSS (v4)
*   **Database (Primary):** Microsoft SQL Server (accessed via `mssql` / `tedious`)
*   **Database (Secondary/Auth):** Supabase (`@supabase/supabase-js`)
*   **Deployment:** Vercel (recommended in README), Docker/Self-hosted possible.

## Architecture & Key Files

### Directory Structure
*   `src/app`: Contains the App Router pages and API routes.
*   `src/lib`: Shared libraries and clients (e.g., `supabaseClient.js`).
*   `public`: Static assets.

### Critical Files
*   **`src/app/page.js`**: The main dashboard. It fetches employee data from `/api/employees` and renders a searchable, paginated table. It handles UI state for loading, errors, and filtering.
*   **`src/app/api/employees/route.js`**: A server-side API route that establishes a connection pool to the SQL Server and executes a complex `JOIN` query to retrieve comprehensive employee information (personal, family, tax, payroll, etc.).
*   **`src/lib/supabaseClient.js`**: Initializes the Supabase client using environment variables.
*   **`package.json`**: Defines dependencies and scripts.

## Setup & Development

### Prerequisites
*   Node.js
*   Access to a Microsoft SQL Server instance.
*   (Optional) Supabase project credentials.

### Environment Variables
Create a `.env.local` file with the following keys (inferred from code):

```env
# SQL Server Configuration
SQL_SERVER=your_server_address
SQL_DATABASE=your_database_name
SQL_USER=your_username
SQL_PASSWORD=your_password
SQL_PORT=1433
SQL_ENCRYPT=true # or false
SQL_TRUST_CERT=true # or false

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Commands
*   **Development:** `npm run dev` (Starts server on http://localhost:3000)
*   **Build:** `npm run build`
*   **Start:** `npm run start`
*   **Lint:** `npm run lint`

## Development Conventions
*   **Data Fetching:** The project uses internal API routes (`/api/...`) to proxy database requests, keeping credentials secure on the server.
*   **Styling:** Utility-first CSS using Tailwind.
*   **Components:** React Functional Components with Hooks (`useState`, `useEffect`, `useMemo`).
*   **Database Access:** Uses `mssql` connection pooling.
