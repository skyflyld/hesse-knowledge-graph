import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const datasets = [
  ['works', 'works.json'],
  ['motifs', 'motifs.json'],
  ['debates', 'debates.json'],
  ['characters', 'characters.json'],
  ['structures', 'structures.json'],
  ['grammars', 'grammars.json'],
  ['cultures', 'cultures.json'],
  ['persons', 'persons.json'],
  ['receptionEvents', 'reception-events.json'],
  ['evidence', 'evidence.json'],
  ['relations', 'relations.json'],
  ['timelinePhases', 'timeline-phases.json'],
  ['image2Rules', 'image2-rules.json']
];

async function readJson(file) {
  const raw = await readFile(join(root, 'data', file), 'utf8');
  return JSON.parse(raw);
}

const data = {};
for (const [key, file] of datasets) {
  data[key] = await readJson(file);
}

await writeFile(
  join(root, 'data', 'hesse-data.js'),
  `window.HESSE_DATA = ${JSON.stringify(data, null, 2)};\n`,
  'utf8'
);

console.log(`Built data/hesse-data.js from ${datasets.length} JSON files.`);
