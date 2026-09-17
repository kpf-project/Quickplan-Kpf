import fs from "node:fs";

const file = "src/features/production-planning/components/QaSubplanWorkbenchClient.js";
if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (line.includes("emptyLine") || line.includes("empty_line")) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  });
} else {
  console.log("File not found");
}
