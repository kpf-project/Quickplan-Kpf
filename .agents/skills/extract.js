const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\8bd87935-da4e-4c28-8b2d-836850c723e5\\.system_generated\\logs\\transcript_full.jsonl';

const lines = fs.readFileSync(logPath, 'utf8').split('\n');
console.log(`Total lines read: ${lines.length}`);

let viewSteps = [];

lines.forEach((line, index) => {
  if (!line.trim()) return;
  try {
    const data = JSON.parse(line);
    
    // Check if this step is a VIEW_FILE step (which is the output containing the file contents)
    if (data.type === 'VIEW_FILE' && data.content && data.content.includes('RequisitionPreviewGeneratorClient.js')) {
      viewSteps.push({
        step_index: data.step_index || index,
        type: data.type,
        contentLength: data.content.length,
        snippet: data.content.substring(0, 300)
      });
      
      // Save each view content to a separate scratch file so we can read it
      fs.writeFileSync(`C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\2a6b9c5b-7556-4f0a-a85f-45fd4df19aac\\scratch\\view_step_${data.step_index || index}.txt`, data.content);
    }
  } catch (err) {
    // Ignore invalid JSON lines
  }
});

console.log(`\nFound ${viewSteps.length} VIEW_FILE steps containing the file content:`);
viewSteps.forEach((s) => {
  console.log(`Step ${s.step_index}: ContentLength=${s.contentLength}`);
  console.log(`Snippet: ${s.snippet}`);
});
