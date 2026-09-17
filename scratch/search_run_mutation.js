import fs from 'fs';
import path from 'path';

const filePath = path.resolve('C:/Users/Riew/Desktop/KPF/Production-Line/Production-Line/src/features/production-line-settings/components/PalletBarcodeSettingsTab.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('const runMutation') || line.includes('function runMutation')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
