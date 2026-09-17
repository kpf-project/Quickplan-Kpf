# Production-Line Project Diagrams

This document contains Mermaid diagrams for the Production-Line project. You can view these directly in GitHub, VS Code (with Mermaid extension), or copy the code into [draw.io](https://app.diagrams.net/).

## 1. System Architecture
Overview of the connection between the Frontend, API, Supabase, and SQL Server.

```mermaid
graph TD
    %% Nodes
    Client[User / Client Device]
    
    subgraph NextJS_App [Next.js Application]
        UI[React UI / Components]
        API[API Routes / Server Actions]
        Middleware[Middleware / Auth Guard]
    end
    
    subgraph Databases [Data Layer]
        Supabase[(Supabase PostgreSQL)]
        MSSQL[(Microsoft SQL Server)]
    end

    %% Connections
    Client -->|HTTPS| Middleware
    Middleware -->|Pass| UI
    UI -->|Fetch/SWR| API
    
    API -->|Supabase Client| Supabase
    API -->|Tedious/MSSQL| MSSQL
    
    %% Descriptions
    Supabase -.->|Auth / Permissions / BOMs / Cache| API
    MSSQL -.->|Employee Data / Legacy ERP| API
    
    style NextJS_App fill:#e1f5fe,stroke:#01579b
    style Databases fill:#f3e5f5,stroke:#4a148c
```

## 2. Feature Modules Structure
The modular structure of the `src/features` directory.

```mermaid
graph LR
    Root[src/features]
    
    subgraph Core [Core System]
        Auth[auth]
        Settings[settings]
        Admin[admin]
    end
    
    subgraph HR_Managment [HR & People]
        Employees[employees]
        Attendance[attendance]
        HR[hr]
    end
    
    subgraph Production [Production & Inventory]
        ProdLine[production-line]
        ProdSettings[production-line-settings]
        Products[products]
        SKU[sku-min-max]
        BOM[raw-materials / BOMs]
    end
    
    subgraph Supply_Chain [Supply Chain]
        Suppliers[suppliers]
        Requisitions[raw-material-requisitions]
    end

    Root --> Auth
    Root --> Settings
    Root --> Admin
    Root --> Employees
    Root --> Attendance
    Root --> HR
    Root --> ProdLine
    Root --> ProdSettings
    Root --> Products
    Root --> SKU
    Root --> BOM
    Root --> Suppliers
    Root --> Requisitions

    style Core fill:#fff9c4,stroke:#fbc02d
    style HR_Managment fill:#ffe0b2,stroke:#f57c00
    style Production fill:#c8e6c9,stroke:#388e3c
    style Supply_Chain fill:#d1c4e9,stroke:#512da8
```

## 3. Comprehensive Entity Relationship Diagram (ERD)
Focus on IAM (Identity & Access Management) and Production/BOM Management.

```mermaid
erDiagram
    %% Auth & Profiles
    profiles {
        uuid id PK "auth.users ref"
        citext username
        uuid department_id FK
        boolean is_active
    }
    
    departments {
        uuid id PK
        string name
        string source "hr, custom"
    }

    roles {
        uuid id PK
        string role_key "unique"
        string name
    }

    permissions {
        uuid id PK
        string perm_key "unique"
        string label
        string path
        string group_key
    }

    user_roles {
        uuid user_id PK, FK
        uuid role_id PK, FK
        boolean is_primary
    }

    role_permissions {
        uuid role_id PK, FK
        uuid permission_id PK, FK
    }

    %% Product & Inventory Cache
    products_cache {
        string sku_code PK
        string sku_name
        string iccat_code
        string uom_name
    }

    production_categories {
        uuid id PK
        string code
        string name
    }

    production_category_products {
        uuid id PK
        uuid category_id FK
        string sku_code FK
    }

    %% Production BOMs
    production_boms {
        uuid id PK
        string sku_code FK
        string status "draft, pending_review, approved, rejected"
    }

    production_bom_versions {
        uuid id PK
        uuid bom_id FK
        int version_no
        string status
        jsonb diff
        jsonb changes
    }

    production_bom_items {
        uuid id PK
        uuid version_id FK
        string material_sku_code FK
        numeric qty
    }

    production_bom_approvals {
        uuid id PK
        uuid bom_id FK
        uuid version_id FK
        string status
        string token_id
        uuid requested_by FK "profiles(id)"
        uuid decided_by FK "profiles(id)"
    }

    %% Relationships
    profiles }o--|| departments : belongs_to
    profiles ||--o{ user_roles : has
    roles ||--o{ user_roles : assigned_to
    roles ||--o{ role_permissions : defines
    permissions ||--o{ role_permissions : assigned_to

    products_cache ||--o{ production_category_products : "linked to"
    production_categories ||--o{ production_category_products : "contains"
    
    products_cache ||--o{ production_boms : "has BOM"
    production_boms ||--o{ production_bom_versions : "has versions"
    production_bom_versions ||--o{ production_bom_items : "contains materials"
    products_cache ||--o{ production_bom_items : "referenced as material"
    
    production_boms ||--o{ production_bom_approvals : "has requests"
    production_bom_versions ||--o{ production_bom_approvals : "is subject of"
    profiles ||--o{ production_bom_approvals : "manages/requests"
```

---
*Created by Gemini CLI Agent - 2026-01-22*