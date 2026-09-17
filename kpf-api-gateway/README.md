# KPF API Gateway

Read-only API gateway that exposes ERP (192.168.210.5) and HR/Attendance (192.168.210.6)
queries over HTTPS via Cloudflare Tunnel. Designed for external projects to fetch data
without direct LAN access.

## 1) Install
```powershell
cd C:\Users\Administrator\Desktop\KPF-API-Gateway
npm install
```

## 2) Environment
Copy `.env.example` to `.env.local` (or `.env`) and update credentials.

Required keys:
- ERP: `DB_SERVER_KPF_ERP`, `DB_NAME_KPF_ERP`, `DB_USER_KPF_ERP`, `DB_PASSWORD_KPF_ERP`
- HR: `SQL_SERVER`, `SQL_DATABASE`, `SQL_USER`, `SQL_PASSWORD`
- Security: `KPF_API_KEY`
- Optional CORS: `CORS_ORIGINS` (comma-separated). Empty = allow all origins.

## 3) Run
```powershell
$env:PORT=4000
npm run start
```

## 4) Endpoints
All `/api/*` routes require authentication.
- Cloudflare Access header: `cf-access-jwt-assertion`
- OR API key header: `x-api-key: <KPF_API_KEY>`

Routes:
- `GET /api/raw-materials`
  - params: `brandCodes`, `iccatCodes`, `skuName`, `dateFrom`, `dateTo`, `page`, `pageSize`
- `GET /api/employees`
  - params: `search`, `status`, `page`, `pageSize`
- `GET /api/attendance`
  - params: `badgenumber`, `page`, `pageSize`
- `GET /api/consolidated`
  - params: `startDate`, `endDate`, `search`, `department`, `branch`, `page`, `pageSize`

## 5) PM2 (Windows)
```powershell
pm2 start cmd --name kpf-api-gateway -- /c "set PORT=4000 && npm run start"
pm2 save
```

## 6) Cloudflare Tunnel
Add to your existing tunnel config:
```yaml
ingress:
  - hostname: api.kpfoods.co.th
    service: http://localhost:4000
  - service: http_status:404
```
Restart the tunnel service.

## 7) Health check
- `GET /health`

