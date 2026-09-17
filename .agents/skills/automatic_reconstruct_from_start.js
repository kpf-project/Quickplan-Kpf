const fs = require('fs');
const path = require('path');

const scratchDir = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\2a6b9c5b-7556-4f0a-a85f-45fd4df19aac\\scratch\\';
const logPath = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\8bd87935-da4e-4c28-8b2d-836850c723e5\\.system_generated\\logs\\transcript_full.jsonl';

// Helper to parse view step files and strip off line numbers
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
    
    // Line format: "123: original_line_content"
    const match = line.match(/^\s*(\d+):\s(.*)$/);
    if (match) {
      codeLines.push(match[2]);
    } else if (line.match(/^\s*(\d+):$/)) {
      codeLines.push('');
    }
  }
  
  return codeLines;
}

// 1. Stitch original 1,336-line file
console.log('Stitching original 1,336-line file from Step 374 & 376...');
const part1 = parseViewStep('view_step_374.txt'); // 1 to 800
const part2 = parseViewStep('view_step_376.txt'); // 801 to 1336

console.log(`Part sizes: P1=${part1.length}, P2=${part2.length}`);

// Combine parts
let stitchedContent = [
  ...part1,
  ...part2
].join('\n');

console.log(`Stitched baseline size: ${stitchedContent.length} characters.`);

// 2. Load all transcript steps to find replacements in the previous conversation
console.log('Reading transcript log to extract subsequent edit steps...');
const transcriptLines = fs.readFileSync(logPath, 'utf8').split('\n');

let edits = [];
transcriptLines.forEach((line) => {
  if (!line.trim()) return;
  try {
    const data = JSON.parse(line);
    const stepIndex = data.step_index;
    
    const toolCalls = data.tool_calls || [];
    for (const call of toolCalls) {
      if (call.name === 'replace_file_content' || call.name === 'multi_replace_file_content') {
        const args = call.args || {};
        const targetFile = args.TargetFile || args.targetFile || '';
        if (targetFile.toLowerCase().includes('requisitionpreviewgeneratorclient')) {
          edits.push({
            step: stepIndex,
            tool: call.name,
            args: args
          });
        }
      }
    }
  } catch (err) {
    // Ignore invalid JSON lines
  }
});

console.log(`Found ${edits.length} edit steps to apply.`);

// Sort edits by step number to ensure correct chronological application
edits.sort((a, b) => a.step - b.step);

// Helper to normalize newlines and spaces for reliable matching
function normalizeText(str) {
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// 3. Sequentially apply the edits
let currentContent = normalizeText(stitchedContent);

edits.forEach((edit) => {
  console.log(`\nApplying Step ${edit.step} (${edit.tool})...`);
  if (edit.tool === 'replace_file_content') {
    const target = normalizeText(edit.args.TargetContent || edit.args.targetContent || '');
    const replacement = normalizeText(edit.args.ReplacementContent || edit.args.replacementContent || '');
    
    if (!currentContent.includes(target)) {
      console.error(`ERROR: Target content for Step ${edit.step} not found in file!`);
      // Let's print out what is missing to help debug
      fs.writeFileSync(`C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\2a6b9c5b-7556-4f0a-a85f-45fd4df19aac\\scratch\\failed_target_${edit.step}.txt`, target);
      return;
    }
    
    currentContent = currentContent.replace(target, replacement);
    console.log(`Applied replacement for Step ${edit.step}. New size: ${currentContent.length}`);
  } else if (edit.tool === 'multi_replace_file_content') {
    const chunks = edit.args.ReplacementChunks || edit.args.replacementChunks || [];
    console.log(`Step ${edit.step} has ${chunks.length} chunks.`);
    
    chunks.forEach((chunk, chunkIdx) => {
      const target = normalizeText(chunk.TargetContent || chunk.targetContent || '');
      const replacement = normalizeText(chunk.ReplacementContent || chunk.replacementContent || '');
      
      if (!currentContent.includes(target)) {
        console.error(`ERROR: Chunk ${chunkIdx} target in Step ${edit.step} not found in file!`);
        fs.writeFileSync(`C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\2a6b9c5b-7556-4f0a-a85f-45fd4df19aac\\scratch\\failed_chunk_${edit.step}_${chunkIdx}.txt`, target);
        return;
      }
      
      currentContent = currentContent.replace(target, replacement);
      console.log(`Applied chunk ${chunkIdx} for Step ${edit.step}.`);
    });
    console.log(`Finished multi-replacement for Step ${edit.step}. New size: ${currentContent.length}`);
  }
});

// Write reconstructed file to scratch
const finalPath = path.join(scratchDir, 'reconstructed_from_start.js');
fs.writeFileSync(finalPath, currentContent, 'utf8');
console.log(`\nSUCCESS: Final reconstructed file written to: ${finalPath}`);
console.log(`Final file size: ${currentContent.length} characters.`);
