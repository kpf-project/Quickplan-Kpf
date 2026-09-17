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
    } else {
      // Just in case there are other lines or blank lines after start
      if (line.trim() !== '' && !line.includes('Total Lines:') && !line.includes('Total Bytes:')) {
        // console.log(`Unmatched line in ${fileName}:`, line);
      }
    }
  }
  
  return codeLines;
}

// 1. Stitch files 1824, 1826, 1828, 1830, 1832
console.log('Stitching step view files to build Step 1832 baseline...');
const part1 = parseViewStep('view_step_1824.txt'); // 1 to 800
const part2 = parseViewStep('view_step_1826.txt'); // 801 to 1100
const part3 = parseViewStep('view_step_1828.txt'); // 1101 to 1350
const part4 = parseViewStep('view_step_1830.txt'); // 1351 to 1800
const part5 = parseViewStep('view_step_1832.txt'); // 1801 to 1918

console.log(`Part sizes: P1=${part1.length}, P2=${part2.length}, P3=${part3.length}, P4=${part4.length}, P5=${part5.length}`);

// Combine parts
let stitchedContent = [
  ...part1,
  ...part2,
  ...part3,
  ...part4,
  ...part5
].join('\n');

console.log(`Stitched baseline size: ${stitchedContent.length} characters.`);

// 2. Load all transcript steps to find replacements after step 1832
console.log('Reading transcript log to extract subsequent edit steps...');
const transcriptLines = fs.readFileSync(logPath, 'utf8').split('\n');

let edits = [];
transcriptLines.forEach((line) => {
  if (!line.trim()) return;
  try {
    const data = JSON.parse(line);
    const stepIndex = data.step_index;
    if (stepIndex <= 1832) return; // Only interested in edits after baseline
    
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

console.log(`Found ${edits.length} edit steps to apply after Step 1832.`);

// Sort edits by step number to ensure correct chronological application
edits.sort((a, b) => a.step - b.step);

// Helper to normalize newlines for reliable matching
function normalizeNewlines(str) {
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// 3. Sequentially apply the edits
let currentContent = normalizeNewlines(stitchedContent);

edits.forEach((edit) => {
  console.log(`\nApplying Step ${edit.step} (${edit.tool})...`);
  if (edit.tool === 'replace_file_content') {
    const target = normalizeNewlines(edit.args.TargetContent || edit.args.targetContent || '');
    const replacement = normalizeNewlines(edit.args.ReplacementContent || edit.args.replacementContent || '');
    
    if (!currentContent.includes(target)) {
      console.error(`WARNING: Target content for Step ${edit.step} not found in file!`);
      // Try with trimmed version or simple spaces replace as backup
      const trimmedTarget = target.trim();
      const index = currentContent.indexOf(trimmedTarget);
      if (index !== -1) {
        console.log(`Found trimmed match for Step ${edit.step}.`);
      }
      return;
    }
    
    currentContent = currentContent.replace(target, replacement);
    console.log(`Applied single replacement for Step ${edit.step}. New size: ${currentContent.length}`);
  } else if (edit.tool === 'multi_replace_file_content') {
    const chunks = edit.args.ReplacementChunks || edit.args.replacementChunks || [];
    console.log(`Step ${edit.step} has ${chunks.length} chunks.`);
    
    chunks.forEach((chunk, chunkIdx) => {
      const target = normalizeNewlines(chunk.TargetContent || chunk.targetContent || '');
      const replacement = normalizeNewlines(chunk.ReplacementContent || chunk.replacementContent || '');
      
      if (!currentContent.includes(target)) {
        console.error(`WARNING: Chunk ${chunkIdx} target in Step ${edit.step} not found in file!`);
        return;
      }
      
      currentContent = currentContent.replace(target, replacement);
      console.log(`Applied chunk ${chunkIdx} for Step ${edit.step}.`);
    });
    console.log(`Finished multi-replacement for Step ${edit.step}. New size: ${currentContent.length}`);
  }
});

// Write reconstructed file to scratch
const finalPath = path.join(scratchDir, 'reconstructed_final.js');
fs.writeFileSync(finalPath, currentContent, 'utf8');
console.log(`\nSUCCESS: Final reconstructed file written to: ${finalPath}`);
console.log(`Final file size: ${currentContent.length} characters.`);
