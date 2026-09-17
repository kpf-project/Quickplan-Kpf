const fs = require('fs');
const path = require('path');

const scratchDir = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\2a6b9c5b-7556-4f0a-a85f-45fd4df19aac\\scratch\\';
const files = fs.readdirSync(scratchDir);

console.log('Mapping line ranges of view files:');
let ranges = [];

files.forEach((file) => {
  if (!file.endsWith('.txt')) return;
  const filePath = path.join(scratchDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Find "Showing lines X to Y" or "Showing lines X to Y of Z"
  const showMatch = content.match(/Showing lines (\d+) to (\d+)/);
  if (showMatch) {
    const start = parseInt(showMatch[1], 10);
    const end = parseInt(showMatch[2], 10);
    const totalMatch = content.match(/Total Lines: (\d+)/);
    const total = totalMatch ? parseInt(totalMatch[1], 10) : null;
    
    ranges.push({
      file,
      start,
      end,
      total,
      step: parseInt(file.match(/view_step_(\d+)/)[1], 10)
    });
  }
});

// Sort by start line and then by step
ranges.sort((a, b) => {
  if (a.start !== b.start) return a.start - b.start;
  return a.step - b.step;
});

ranges.forEach((r) => {
  console.log(`Lines ${r.start.toString().padStart(4, ' ')} to ${r.end.toString().padStart(4, ' ')}: File=${r.file} (Total: ${r.total}, Step: ${r.step})`);
});
