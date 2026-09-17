import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
const suffix = randomBytes(4).toString("hex");
const deploymentId = `kpf-${timestamp}-${suffix}`;

await writeFile(new URL("../.deployment-id", import.meta.url), `${deploymentId}\n`, "utf8");
process.stdout.write(`Generated deployment id: ${deploymentId}\n`);
