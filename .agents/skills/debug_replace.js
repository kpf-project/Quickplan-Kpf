const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\8bd87935-da4e-4c28-8b2d-836850c723e5\\.system_generated\\logs\\transcript_full.jsonl';
const stitchedPath = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\2a6b9c5b-7556-4f0a-a85f-45fd4df19aac\\scratch\\reconstructed_final.js';

const stitchedContent = fs.readFileSync(stitchedPath, 'utf8');

// Let's read the transcript and check the target content of Step 1851
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

let step1851 = null;
lines.forEach((line) => {
  if (!line.trim()) return;
  try {
    const data = JSON.parse(line);
    if (data.step_index === 1851) {
      step1851 = data;
    }
  } catch(e) {}
});

if (step1851) {
  const toolCall = step1851.tool_calls[0];
  const target = toolCall.args.TargetContent;
  console.log('Step 1851 TargetContent:');
  console.log(JSON.stringify(target));
  
  // Let's search if a normalized version exists
  const targetNorm = target.replace(/\r\n/g, '\n').trim();
  const stitchedNorm = stitchedContent.replace(/\r\n/g, '\n');
  
  console.log(`Stitched contains normalized target? ${stitchedNorm.includes(targetNorm)}`);
  
  // Let's find close matches
  const targetFirstLine = targetNorm.split('\n')[0];
  console.log(`Searching for first line of target: "${targetFirstLine}"`);
  
  let pos = -1;
  while ((pos = stitchedNorm.indexOf(targetFirstLine, pos + 1)) !== -1) {
    console.log(`Found first line at index ${pos}. Context:`);
    console.log(stitchedNorm.substring(pos, pos + 300));
  }
} else {
  console.log('Step 1851 not found in transcript!');
}
