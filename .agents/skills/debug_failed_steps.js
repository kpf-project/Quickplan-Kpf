const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\8bd87935-da4e-4c28-8b2d-836850c723e5\\.system_generated\\logs\\transcript_full.jsonl';
const scratchDir = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\2a6b9c5b-7556-4f0a-a85f-45fd4df19aac\\scratch\\';

const lines = fs.readFileSync(logPath, 'utf8').split('\n');

let step864 = null;
let step1023 = null;

lines.forEach((line) => {
  if (!line.trim()) return;
  try {
    const data = JSON.parse(line);
    if (data.step_index === 864) step864 = data;
    if (data.step_index === 1023) step1023 = data;
  } catch(e) {}
});

if (step864) {
  const chunks = step864.tool_calls[0].args.ReplacementChunks || step864.tool_calls[0].args.replacementChunks || [];
  console.log('--- STEP 864 CHUNK 1 ---');
  console.log('TargetContent:');
  console.log(JSON.stringify(chunks[1].TargetContent));
}

if (step1023) {
  const target = step1023.tool_calls[0].args.TargetContent || step1023.tool_calls[0].args.targetContent || '';
  console.log('\n--- STEP 1023 ---');
  console.log('TargetContent Length:', target.length);
  console.log('TargetContent snippet:');
  console.log(target.substring(0, 300));
}
