const fs = require('fs');
const path = require('path');

const filePath = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\2a6b9c5b-7556-4f0a-a85f-45fd4df19aac\\scratch\\view_step_1824.txt';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log(`Total lines in file: ${lines.length}`);
console.log('First 20 lines:');
lines.slice(0, 20).forEach((line, idx) => {
  console.log(`${idx + 1}: ${JSON.stringify(line)}`);
});

console.log('\nLines 300 to 320:');
lines.slice(300, 320).forEach((line, idx) => {
  console.log(`${idx + 301}: ${JSON.stringify(line)}`);
});
