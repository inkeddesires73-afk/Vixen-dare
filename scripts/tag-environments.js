#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const dataPath = path.join(projectRoot, 'data', 'tasks.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const rules = [
  { environments: ['swingers_club'], pattern: /(?<![\p{L}])swingersklubb(?:en)?(?![\p{L}])/iu },
  { environments: ['private_party'], pattern: /(?<![\p{L}])(?:privat fest|hemma|hem|bjud hem)(?![\p{L}])/iu },
  { environments: ['nightclub'], pattern: /(?<![\p{L}])(?:klubb(?:en|ar)?|dansgolv(?:et)?|uteställe(?:t)?|toalett(?:en)?)(?![\p{L}])/iu },
  { environments: ['bar_pub'], pattern: /(?<![\p{L}])(?:bar(?:en|er)?|pub(?:en|ar)?|bardisk(?:en)?|drink(?:en|ar)?)(?![\p{L}])/iu },
  { environments: ['on_the_town'], pattern: /(?<![\p{L}])(?:på stan|stan|gatan|butik(?:en)?|taxi(?:n)?|tåg(?:et)?)(?![\p{L}])/iu }
];

function environmentsFor(text) {
  const environments = new Set();
  for (const rule of rules) {
    if (rule.pattern.test(text)) rule.environments.forEach(environment => environments.add(environment));
  }
  return [...environments];
}

let tagged = 0;
const counts = {};
for (const task of data.tasks) {
  if (Array.isArray(task.environments) && task.environments.length) continue;
  const environments = environmentsFor(task.text);
  if (!environments.length) continue;
  task.environments = environments;
  tagged++;
  environments.forEach(environment => { counts[environment] = (counts[environment] || 0) + 1; });
}

if (process.argv.includes('--write')) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Taggade ${tagged} kort i data/tasks.json.`);
} else {
  console.log(`Hittade ${tagged} kort att tagga. Kör med --write för att spara.`);
}
console.log(JSON.stringify(counts, null, 2));
