import fs from "node:fs";

const file = "src/features/production-planning/components/QaSubplanWorkbenchClient.js";
if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (line.includes("useSWR") || line.includes("fetcher") || line.includes("api/")) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  });
} else {
  console.log("File not found");
}
