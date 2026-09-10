import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyProvenance, BRIDGE_KEYS } from './lib/provenance.mjs';

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

// 派生层：T / S / E provenance + 动态计数（规则与 validate 共用同一模块）
applyProvenance(data);

await writeFile(
  join(root, 'data', 'hesse-data.js'),
  `window.HESSE_DATA = ${JSON.stringify(
    Object.fromEntries(BRIDGE_KEYS.map((k) => [k, data[k]])),
    null,
    2
  )};\n`,
  'utf8'
);

console.log(`Built data/hesse-data.js from ${datasets.length} JSON files.`);
console.log(
  `  evidence ${data.evidence.length} → T ${data.provenanceIndex.totals.T} / S ${data.provenanceIndex.totals.S} / E ${data.provenanceIndex.totals.E}`
);
