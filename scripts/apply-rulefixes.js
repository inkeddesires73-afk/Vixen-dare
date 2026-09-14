#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const projectRoot = path.resolve(__dirname, '..');
const dataPath = path.join(projectRoot, 'data', 'tasks.json');
const gamePath = path.join(projectRoot, 'tasks.js');
const chunksDir = path.join(projectRoot, 'scripts', 'rulefix-chunks');

const packed = ['01.txt', '02.txt', '03.txt', '04.txt']
  .map(name => fs.readFileSync(path.join(chunksDir, name), 'utf8').trim())
  .join('');

const source = JSON.parse(zlib.gunzipSync(Buffer.from(packed, 'base64')).toString('utf8'));

if (!source || source.version !== 1 || !Array.isArray(source.tasks) || source.tasks.length !== 900) {
  throw new Error('Den regelverksfixade kortbanken måste innehålla version 1 och exakt 900 kort.');
}

const ids = new Set();
const counts = new Map();
for (const task of source.tasks) {
  if (!task || typeof task.id !== 'string' || !/^vix_n[1-5]_\d+$/.test(task.id)) throw new Error(`Ogiltigt ID: ${task && task.id}`);
  if (ids.has(task.id)) throw new Error(`Dubbelt ID: ${task.id}`);
  ids.add(task.id);
  if (!Number.isInteger(task.level) || task.level < 1 || task.level > 5) throw new Error(`Ogiltig nivå: ${task.id}`);
  if (!Array.isArray(task.environments) || task.environments.length < 1) throw new Error(`Miljö saknas: ${task.id}`);
  if (typeof task.context !== 'string' || !task.context.trim()) throw new Error(`Tom kontext: ${task.id}`);
  if (typeof task.text !== 'string' || !task.text.trim()) throw new Error(`Tom text: ${task.id}`);
  counts.set(task.level, (counts.get(task.level) || 0) + 1);
}

for (let level = 1; level <= 5; level += 1) {
  if (counts.get(level) !== 180) throw new Error(`Nivå ${level} har ${counts.get(level) || 0} kort, inte 180.`);
}

const serialized = JSON.stringify(source);
for (const forbidden of [
  'ser bakåt från framsätet',
  'tittar bakåt från framsätet',
  'sitter i framsätet och ser bakåt',
  'sitter i framsätet och tittar bakåt'
]) {
  if (serialized.includes(forbidden)) throw new Error(`Förbjuden bilfras finns kvar: ${forbidden}`);
}

fs.writeFileSync(dataPath, `${JSON.stringify(source, null, 2)}\n`, 'utf8');
fs.writeFileSync(
  gamePath,
  `// Genererad från data/tasks.json. Ändra inte denna fil direkt.\nconst VIXEN_DATABASE = ${JSON.stringify(source.tasks, null, 2)};\n`,
  'utf8'
);

console.log(`Skrev ${source.tasks.length} regelverksfixade kort till data/tasks.json och tasks.js.`);
console.log('Bilfras-kontroll: OK.');
