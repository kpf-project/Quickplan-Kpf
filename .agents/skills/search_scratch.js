const fs = require('fs');
const path = require('path');

const scratchDir = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\2a6b9c5b-7556-4f0a-a85f-45fd4df19aac\\scratch\\';
const files = fs.readdirSync(scratchDir);

console.log(`Searching through ${files.length} scratch files...`);

files.forEach((file) => {
  if (!file.endsWith('.txt')) return;
  const filePath = path.join(scratchDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  if (content.toLowerCase().includes('excel') || content.toLowerCase().includes('xlsx') || content.toLowerCase().includes('isconsoleopen')) {
    console.log(`\n======================================`);
    console.log(`Matched File: ${file} (Size: ${content.length} bytes)`);
    // Print a few matching lines
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes('excel') || line.toLowerCase().includes('xlsx') || line.toLowerCase().includes('isconsoleopen') || line.toLowerCase().includes('checkeddeptsdaily')) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
      }
    });
  }
});
