import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

const CRITICAL_ROUTE_CHECKS = [
  {
    file: "src/app/api/production-planning/calculate/route.js",
    mustIncludeAny: ["plan.calculate_own_dept", "plan.edit_own_dept", "production-line-planning-manage"],
    label: "Calculate materials",
  },
  {
    file: "src/app/api/production-planning/master-publish/route.js",
    mustIncludeAny: ["plan.publish_master", "production-line-planning-manage"],
    label: "Master publish",
  },
  {
    file: "src/app/api/production-planning/replan/route.js",
    mustIncludeAny: ["plan.approve_exception", "production-line-planning-manage"],
    label: "Replan enqueue",
  },
  {
    file: "src/app/api/production-planning/replan/worker/route.js",
    mustIncludeAny: ["plan.approve_exception", "production-line-planning-manage"],
    label: "Replan worker",
  },
  {
    file: "src/app/api/production-planning/eta-feedback/route.js",
    mustIncludeAny: ["plan.calculate_own_dept", "production-line-planning-manage"],
    label: "ETA feedback",
  },
  {
    file: "src/app/api/production-planning/scheduling/advanced/route.js",
    mustIncludeAny: ["plan.approve_exception", "production-line-planning-manage"],
    label: "Advanced scheduling",
  },
  {
    file: "src/app/api/production-planning/scheduling/policies/route.js",
    mustIncludeAny: ["plan.approve_exception", "production-line-planning-manage"],
    label: "Scheduling policies",
  },
  {
    file: "src/app/api/production-planning/scheduling/capacities/route.js",
    mustIncludeAny: ["plan.approve_exception", "production-line-planning-manage"],
    label: "Department capacities",
  },
  {
    file: "src/app/api/production-planning/status/route.js",
    mustIncludeAny: ["plan.edit_own_dept", "plan.calculate_own_dept", "production-line-planning-manage"],
    label: "Plan status mutations",
  },
];

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function readFileSafe(relativeFile) {
  const absoluteFile = path.join(ROOT, relativeFile);
  const content = await fs.readFile(absoluteFile, "utf8");
  return { absoluteFile, content };
}

function evaluateCheck(content, check) {
  const hasGuard = content.includes("requirePermissionKeys(");
  const matched = check.mustIncludeAny.filter((token) => content.includes(token));
  const pass = hasGuard && matched.length > 0;
  return {
    label: check.label,
    file: check.file,
    pass,
    hasGuard,
    matchedTokens: matched,
    expectedTokens: check.mustIncludeAny,
  };
}

function toMarkdownReport({ results, generatedAt }) {
  const failures = results.filter((item) => !item.pass);
  const lines = [];
  lines.push("# Role Workflow Verification (Planning API)");
  lines.push("");
  lines.push(`Generated at: ${generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Total checks: ${results.length}`);
  lines.push(`- Pass: ${results.length - failures.length}`);
  lines.push(`- Fail: ${failures.length}`);
  lines.push("");
  lines.push("## Results");
  lines.push("| Route | File | Guard | Matched tokens | Status |");
  lines.push("|---|---|---|---|---|");
  results.forEach((item) => {
    const guard = item.hasGuard ? "yes" : "no";
    const matched = item.matchedTokens.length
      ? normalizeWhitespace(item.matchedTokens.join(", "))
      : "-";
    lines.push(`| ${item.label} | \`${item.file}\` | ${guard} | ${matched} | ${item.pass ? "PASS" : "FAIL"} |`);
  });
  lines.push("");
  if (failures.length > 0) {
    lines.push("## Failures");
    failures.forEach((item) => {
      lines.push(`- ${item.label} (\`${item.file}\`)`);
      lines.push(`  - expected any of: ${item.expectedTokens.join(", ")}`);
      lines.push(`  - found: ${item.matchedTokens.join(", ") || "-"}`);
    });
  } else {
    lines.push("## Failures");
    lines.push("- None");
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("- This is a static guard check on API source files.");
  lines.push("- End-to-end user-role verification (manager/editor/viewer) must still be executed in UAT.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const results = [];
  for (const check of CRITICAL_ROUTE_CHECKS) {
    const { content } = await readFileSafe(check.file);
    results.push(evaluateCheck(content, check));
  }

  const generatedAt = new Date().toISOString();
  const markdown = toMarkdownReport({ results, generatedAt });
  const outputFile = path.join(ROOT, "docs/ROLE_WORKFLOW_VERIFICATION_2026-02-13.md");
  await fs.writeFile(outputFile, markdown, "utf8");

  const failCount = results.filter((item) => !item.pass).length;
  process.stdout.write(
    JSON.stringify(
      {
        ok: failCount === 0,
        total: results.length,
        failCount,
        outputFile: "docs/ROLE_WORKFLOW_VERIFICATION_2026-02-13.md",
      },
      null,
      2
    )
  );

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
