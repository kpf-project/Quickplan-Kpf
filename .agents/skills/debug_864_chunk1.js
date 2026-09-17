const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\8bd87935-da4e-4c28-8b2d-836850c723e5\\.system_generated\\logs\\transcript_full.jsonl';
const scratchDir = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\2a6b9c5b-7556-4f0a-a85f-45fd4df19aac\\scratch\\';

const lines = fs.readFileSync(logPath, 'utf8').split('\n');

let step864 = null;
lines.forEach((line) => {
  if (!line.trim()) return;
  try {
    const data = JSON.parse(line);
    if (data.step_index === 864) step864 = data;
  } catch(e) {}
});

function parseViewStep(fileName) {
  const filePath = path.join(scratchDir, fileName);
  const content = fs.readFileSync(filePath, 'utf8');
  const rawLines = content.split('\n');
  let started = false;
  let codeLines = [];
  for (const line of rawLines) {
    if (line.includes('The following code has been modified to include a line number before every line')) {
      started = true;
      continue;
    }
    if (!started) continue;
    const match = line.match(/^\s*(\d+):\s(.*)$/);
    if (match) {
      codeLines.push(match[2]);
    } else if (line.match(/^\s*(\d+):$/)) {
      codeLines.push('');
    }
  }
  return codeLines;
}

const part1 = parseViewStep('view_step_374.txt');
const part2 = parseViewStep('view_step_376.txt');
let currentContent = [ ...part1, ...part2 ].join('\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// Load edits and apply strictly before 864
let edits = [];
lines.forEach((line) => {
  if (!line.trim()) return;
  try {
    const data = JSON.parse(line);
    const toolCalls = data.tool_calls || [];
    for (const call of toolCalls) {
      if (call.name === 'replace_file_content' || call.name === 'multi_replace_file_content') {
        const args = call.args || {};
        if ((args.TargetFile || args.targetFile || '').toLowerCase().includes('requisitionpreviewgeneratorclient')) {
          edits.push({ step: data.step_index, tool: call.name, args });
        }
      }
    }
  } catch(e) {}
});
edits.sort((a, b) => a.step - b.step);

for (const edit of edits) {
  if (edit.step >= 864) break;
  if (edit.tool === 'replace_file_content') {
    const target = (edit.args.TargetContent || edit.args.targetContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const replacement = (edit.args.ReplacementContent || edit.args.replacementContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    currentContent = currentContent.replace(target, replacement);
  } else if (edit.tool === 'multi_replace_file_content') {
    const chunks = edit.args.ReplacementChunks || edit.args.replacementChunks || [];
    chunks.forEach((chunk) => {
      const target = (chunk.TargetContent || chunk.targetContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const replacement = (chunk.ReplacementContent || chunk.replacementContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      currentContent = currentContent.replace(target, replacement);
    });
  }
}

// Now analyze Step 864 Chunk 1
const chunks = step864.tool_calls[0].args.ReplacementChunks || step864.tool_calls[0].args.replacementChunks || [];
const target = chunks[1].TargetContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

console.log(`Step 864 Chunk 1 TargetContent length: ${target.length}`);
const targetLines = target.split('\n');
console.log(`Target has ${targetLines.length} lines.`);

let matchPrefix = '';
let breakIndex = -1;

for (let i = 0; i < targetLines.length; i++) {
  const testPrefix = matchPrefix + (i > 0 ? '\n' : '') + targetLines[i];
  if (currentContent.includes(testPrefix)) {
    matchPrefix = testPrefix;
  } else {
    breakIndex = i;
    break;
  }
}

if (breakIndex !== -1) {
  console.log(`\nMatch broke at line index ${breakIndex}!`);
  console.log('--- LINE THAT BROKE MATCH ---');
  console.log(JSON.stringify(targetLines[breakIndex]));
  
  console.log('\n--- EXPECTED AROUND THAT AREA IN FILE ---');
  const index = currentContent.indexOf(matchPrefix);
  if (index !== -1) {
    const endOfMatch = index + matchPrefix.length;
    console.log(currentContent.substring(endOfMatch - 100, endOfMatch + 300));
  }
} else {
  console.log('Step 864 Chunk 1 fully matched!');
}
