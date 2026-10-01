import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import translations from '../src/context/translations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.join(__dirname, '..', 'public', 'locales');

const langMap = {
  English: 'en',
  Hindi: 'hi',
  Kannada: 'kn'
};

for (const [langName, langCode] of Object.entries(langMap)) {
  const targetDir = path.join(localesDir, langCode);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const jsonPath = path.join(targetDir, 'translation.json');
  fs.writeFileSync(jsonPath, JSON.stringify(translations[langName] || {}, null, 2), 'utf-8');
  console.log(`Exported ${langName} -> ${jsonPath}`);
}
