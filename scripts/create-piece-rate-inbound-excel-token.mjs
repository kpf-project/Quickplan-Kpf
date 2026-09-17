import { createHash, randomBytes } from "node:crypto";

// ponytail: one shared token; use per-device hashes when independent revocation is needed.
const token = randomBytes(48).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
process.stdout.write(`Token (install in Windows only): ${token}\nServer env KPF_INBOUND_EXCEL_TOKEN_SHA256: ${hash}\n`);
