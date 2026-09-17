const fs = require('fs');

const logPath = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\8bd87935-da4e-4c28-8b2d-836850c723e5\\.system_generated\\logs\\transcript_full.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

let step864 = null;
lines.forEach((line) => {
  if (!line.trim()) return;
  try {
    const data = JSON.parse(line);
    if (data.step_index === 864) step864 = data;
  } catch(e) {}
});

if (step864) {
  const chunks = step864.tool_calls[0].args.ReplacementChunks || step864.tool_calls[0].args.replacementChunks || [];
  console.log('Step 864 Chunks count:', chunks.length);
  
  chunks.forEach((chunk, idx) => {
    console.log(`\n--- Chunk ${idx} ---`);
    console.log('TargetContent:');
    console.log(JSON.stringify(chunk.TargetContent));
    console.log('ReplacementContent:');
    console.log(JSON.stringify(chunk.ReplacementContent));
  });
} else {
  console.log('Step 864 not found!');
}
