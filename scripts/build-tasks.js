#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'data', 'tasks.json');
const outputPath = path.join(projectRoot, 'Appen', 'tasks.js');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

if (!source || source.version !== 1 || !Array.isArray(source.tasks)) {
  throw new Error('data/tasks.json måste innehålla version 1 och en tasks-lista.');
}

const ids = new Set();
for (const task of source.tasks) {
  if (!task || typeof task.id !== 'string' || !/^vix_n[1-5]_\d+$/.test(task.id)) {
    throw new Error(`Ogiltigt uppdrags-ID: ${task && task.id}`);
  }
  if (!Number.isInteger(task.level) || task.level < 1 || task.level > 5) {
    throw new Error(`Ogiltig nivå för ${task.id}.`);
  }
  if (typeof task.text !== 'string' || !task.text.trim()) {
    throw new Error(`Tom uppdragstext för ${task.id}.`);
  }
  if (ids.has(task.id)) throw new Error(`Dubbelt uppdrags-ID: ${task.id}.`);
  ids.add(task.id);
}

const output = `// Genererad från data/tasks.json. Ändra inte denna fil direkt.\nconst VIXEN_DATABASE = ${JSON.stringify(source.tasks, null, 2)};\n`;
fs.writeFileSync(outputPath, output, 'utf8');
console.log(`Byggde ${source.tasks.length} uppdrag till ${path.relative(projectRoot, outputPath)}.`);
