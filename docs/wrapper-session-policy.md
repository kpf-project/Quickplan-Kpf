# Wrapper Session Policy

## Effective Session TTL

1. `rememberDevice = true`
- TTL: `30 days` (`REMEMBER_SESSION_TTL_SECONDS`)

2. `rememberDevice = false` and request from SUNMI Wrapper
- TTL: `WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS`
- Default: `12 hours`

3. `rememberDevice = false` and normal browser/web
- TTL: `4 hours` (`SESSION_TTL_SECONDS`)

## Wrapper Detection Rule

- Backend treats request as wrapper when `User-Agent` includes:
- `KPF-SUNMI-WRAPPER/1.0`

Android wrapper app appends this token to WebView User-Agent automatically.

## Environment Override

Set in root app environment:

```env
WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS=43200
```

- Value must be a positive integer (seconds).
- If missing or invalid, system falls back to `43200` seconds (12 hours).
