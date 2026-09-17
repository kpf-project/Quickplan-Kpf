import fs from 'fs';
import path from 'path';

const filePath = path.resolve('C:/Users/Riew/Desktop/KPF/Production-Line/Production-Line/src/app/production-line/attendance/piece-rate-scan/PieceRateWorkForm.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.toLowerCase().includes('focus')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
