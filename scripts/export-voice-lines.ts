// Writes every fixed character line to scripts/voice-lines.json for scripts/make-voices.py.
// Run: npx tsx scripts/export-voice-lines.ts
import fs from 'node:fs';
import { allCoachVoiceLines } from '../src/engine/coaches';
import { BOTS } from '../src/engine/bots';
import { allBotVoiceLines } from '../src/engine/botTalk';

const lines = allCoachVoiceLines();
lines.push(...allBotVoiceLines(BOTS));
fs.writeFileSync('scripts/voice-lines.json', JSON.stringify(lines, null, 1));
console.log('exported', lines.length, 'lines');
