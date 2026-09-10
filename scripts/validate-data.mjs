import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyProvenance, BRIDGE_KEYS, PROVENANCE_RULE } from './lib/provenance.mjs';
import { applyNarrative, movementStructure } from './lib/narrative.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const datasetFiles = {
  works: 'works.json',
  motifs: 'motifs.json',
  debates: 'debates.json',
  characters: 'characters.json',
  structures: 'structures.json',
  grammars: 'grammars.json',
  cultures: 'cultures.json',
  persons: 'persons.json',
  receptionEvents: 'reception-events.json',
  evidence: 'evidence.json',
  relations: 'relations.json',
  timelinePhases: 'timeline-phases.json',
  image2Rules: 'image2-rules.json',
  narrative: 'narrative.json'
};

const nodeCollections = ['works', 'motifs', 'debates', 'characters', 'structures', 'grammars', 'cultures', 'persons', 'receptionEvents'];
const confidenceValues = new Set(['low', 'medium', 'high']);
const quoteTypes = new Set(['direct', 'direct_excerpt', 'paraphrase', 'interpretive']);
const verificationValues = new Set(['verified_location', 'needs_edition', 'needs_page']);
const locatorTypes = new Set(['chapter-or-scene', 'motif-location', 'work-section', 'poem-line']);

function fail(problems, message) {
  problems.push(message);
}

async function readJson(file) {
  return JSON.parse(await readFile(join(root, 'data', file), 'utf8'));
}

const data = {};
for (const [key, file] of Object.entries(datasetFiles)) {
  data[key] = await readJson(file);
  // narrative.json 是对象（叙事层），其余数据集均为数组
  if (key !== 'narrative' && !Array.isArray(data[key])) {
    throw new Error(`data/${file} must contain an array`);
  }
}

// 与 build-data.mjs 共用同一派生模块（单一真相源）
applyProvenance(data);
applyNarrative(data);

const problems = [];
const nodeIds = new Set();
const evidenceIds = new Set();
const evidenceById = new Map();
// 提前建索引：关系校验要先于证据逐条校验运行（projection 需查 anchor claim）
for (const ev of data.evidence) evidenceById.set(ev.id, ev);

for (const key of nodeCollections) {
  for (const item of data[key]) {
    if (!item.id) fail(problems, `${key}: item missing id`);
    if (nodeIds.has(item.id)) fail(problems, `duplicate node id: ${item.id}`);
    nodeIds.add(item.id);
  }
}

const workIds = new Set(data.works.map(item => item.id));
const motifIds = new Set(data.motifs.map(item => item.id));
const phaseIds = new Set(data.timelinePhases.map(item => item.id));

for (const work of data.works) {
  if (!phaseIds.has(work.phase)) fail(problems, `work ${work.id} references missing phase ${work.phase}`);
}

for (const motif of data.motifs) {
  for (const workId of motif.works || []) {
    if (!workIds.has(workId)) fail(problems, `motif ${motif.id} references missing work ${workId}`);
  }
}

for (const debate of data.debates) {
  if (!motifIds.has(debate.motif)) fail(problems, `debate ${debate.id} references missing motif ${debate.motif}`);
}

for (const relation of data.relations) {
  if (!nodeIds.has(relation.s)) fail(problems, `relation source missing: ${relation.s}`);
  if (!nodeIds.has(relation.t)) fail(problems, `relation target missing: ${relation.t}`);
  if (!relation.rel || !relation.label) fail(problems, `relation ${relation.s}->${relation.t} missing rel or label`);

  // 叙事投影（projection）必须锚定到真实 claim，且该 claim 属于同一边的另一个作品节点。
  // 防的是「叙事冒充证据」：投影边不得无锚点存在，不得借别的作品的 claim 充数。
  if (relation.rel === 'projection') {
    const anchor = relation.anchorClaim;
    if (!anchor) {
      fail(problems, `projection ${relation.s}->${relation.t} missing anchorClaim`);
    } else {
      const claim = evidenceById.get(anchor);
      if (!claim) {
        fail(problems, `projection ${relation.s}->${relation.t} anchors missing claim ${anchor}`);
      } else {
        const other = relation.t === 't11' ? relation.s : relation.t;
        if (claim.workId !== other) {
          fail(problems, `projection ${relation.s}->${relation.t} anchor ${anchor} belongs to ${claim.workId}`);
        }
      }
    }
  }
}

for (const phase of data.timelinePhases) {
  if (typeof phase.from !== 'number' || typeof phase.to !== 'number') fail(problems, `phase ${phase.id} missing numeric year range`);
  if (phase.from > phase.to) fail(problems, `phase ${phase.id} has inverted range`);
  for (const workId of phase.workIds || []) {
    if (!workIds.has(workId)) fail(problems, `phase ${phase.id} references missing work ${workId}`);
  }
  for (const motifId of phase.motifIds || []) {
    if (!motifIds.has(motifId)) fail(problems, `phase ${phase.id} references missing motif ${motifId}`);
  }
}

for (const rule of data.image2Rules) {
  if (!motifIds.has(rule.id)) fail(problems, `image2 rule references missing motif ${rule.id}`);
  if (!Array.isArray(rule.features) || !rule.features.length) fail(problems, `image2 rule ${rule.id} must list features`);
  if (!rule.explain) fail(problems, `image2 rule ${rule.id} missing explain`);
}

for (const ev of data.evidence) {
  if (!ev.id) fail(problems, 'evidence item missing id');
  if (evidenceIds.has(ev.id)) fail(problems, `duplicate evidence id: ${ev.id}`);
  evidenceIds.add(ev.id);
  evidenceById.set(ev.id, ev);
  if (!nodeIds.has(ev.nodeId)) fail(problems, `evidence ${ev.id} references missing node ${ev.nodeId}`);
  if (!workIds.has(ev.workId)) fail(problems, `evidence ${ev.id} references missing work ${ev.workId}`);
  if (!ev.source || !ev.location || !ev.quote || !ev.claim) fail(problems, `evidence ${ev.id} missing source/location/quote/claim`);
  if (!confidenceValues.has(ev.confidence)) fail(problems, `evidence ${ev.id} has invalid confidence ${ev.confidence}`);
  if (!Array.isArray(ev.tags)) fail(problems, `evidence ${ev.id} tags must be an array`);
  const ref = ev.sourceRef;
  if (!ref) {
    fail(problems, `evidence ${ev.id} missing sourceRef`);
    continue;
  }
  const isExternal = ev.workId === 'w12';
  if (!isExternal && ref.author !== 'Hermann Hesse') fail(problems, `evidence ${ev.id} sourceRef.author must be Hermann Hesse`);
  if (!ref.title || !ref.workId || ref.workId !== ev.workId) fail(problems, `evidence ${ev.id} sourceRef title/workId mismatch`);
  const extLocatorTypes = new Set([...locatorTypes, 'doi', 'url']);
  const extQuoteTypes = new Set([...quoteTypes, 'metadata']);
  const extVerificationValues = new Set([...verificationValues, 'needs_verification']);
  if (!(isExternal ? extLocatorTypes : locatorTypes).has(ref.locatorType)) fail(problems, `evidence ${ev.id} invalid locatorType ${ref.locatorType}`);
  if (!(isExternal ? extQuoteTypes : quoteTypes).has(ref.quoteType)) fail(problems, `evidence ${ev.id} invalid quoteType ${ref.quoteType}`);
  if (!(isExternal ? extVerificationValues : verificationValues).has(ref.verificationStatus)) fail(problems, `evidence ${ev.id} invalid verificationStatus ${ref.verificationStatus}`);
  if (!ref.locator || !ref.quoteLanguage || !ref.bibliographicNote) fail(problems, `evidence ${ev.id} sourceRef missing locator/language/note`);
}

const expectedBridge = `window.HESSE_DATA = ${JSON.stringify(
  Object.fromEntries(BRIDGE_KEYS.map((k) => [k, data[k]])),
  null,
  2
)};\n`;
const bridge = await readFile(join(root, 'data', 'hesse-data.js'), 'utf8');
if (bridge !== expectedBridge) fail(problems, 'data/hesse-data.js is stale; run npm run build:data');

// 叙事层（E）强制约束：防「叙事冒充事实」
{
  const nar = data.narrative;
  const claimIds = new Set(data.evidence.map((e) => e.id));
  const motifIds = new Set(data.motifs.map((m) => m.id));

  if (!nar) {
    fail(problems, 'narrative.json missing');
  } else {
    const checkClaims = (ids, where) => {
      for (const id of ids || []) {
        if (!claimIds.has(id)) fail(problems, `${where} references missing claim ${id}`);
      }
    };

    // 1. 编者结论必须锚定到真实 claim
    checkClaims(nar.thesis?.supportingClaims, 'thesis');
    if (nar.thesis && nar.thesis.type !== 'editorial') {
      fail(problems, `thesis.type must be editorial, got ${nar.thesis.type}`);
    }

    // 1b. 结尾自反（coda）：同为编者综合，且必须锚在「不可传达」(t11) 主轴上
    if (!nar.coda) {
      fail(problems, 'narrative.json missing coda (结尾自反)');
    } else {
      if (nar.coda.type !== 'editorial') fail(problems, `coda.type must be editorial, got ${nar.coda.type}`);
      const cc = nar.coda.supportingClaims || [];
      if (!cc.length) fail(problems, 'coda has no supportingClaims');
      checkClaims(cc, 'coda');
      const codaT11 = cc.some((id) => (data.evidence.find((e) => e.id === id) || {}).nodeId === 't11');
      if (!codaT11) fail(problems, 'coda must anchor at least one claim on t11 (不可传达主轴)');
    }
    for (const m of nar.movements || []) {
      if (!(m.coreConclusions || []).length) fail(problems, `${m.id} has no coreConclusions`);
      for (const c of m.coreConclusions || []) checkClaims(c.supportingClaims, `${m.id}/${c.id}`);
    }
    for (const q of nar.fourQuestions || []) checkClaims(q.supportingClaims, q.id);

    // 2. 证伪测试 2（Evidence Concentration）：核心结论锚定率 <50% → 不得作为一级结构
    for (const [mid, idx] of Object.entries(data.narrativeIndex?.movements || {})) {
      if (idx.concentrationPass === false) {
        fail(problems, `${mid} core-conclusion concentration <50% (${idx.coresWithEvidence}/${idx.coreCount})`);
      }
      if (!idx.coreCount) fail(problems, `${mid} has zero coreConclusions`);
    }

    // 3. 十一个叙事作品必须恰好各归一个 Movement（不重不漏）
    const { byWork, ranges } = movementStructure(nar);
    const literary = data.works.filter((w) => w.id !== 'w12').map((w) => w.id);
    for (const w of literary) {
      const ms = byWork[w] || [];
      if (ms.length !== 1) fail(problems, `work ${w} must belong to exactly one movement, got ${ms.length}`);
    }
    for (const [w, ms] of Object.entries(byWork)) {
      if (!literary.includes(w)) fail(problems, `movement references non-literary work ${w}`);
      if (ms.length > 1) fail(problems, `work ${w} appears in multiple movements: ${ms.join(',')}`);
    }

    // 4. 证伪测试 3（Scale Confusion）：Movement 年份区间必须单调递增不重叠
    const sorted = [...ranges].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].from <= sorted[i - 1].to) {
        fail(problems, `movements ${sorted[i - 1].id}/${sorted[i].id} overlap in years (scale confusion risk)`);
      }
    }

    // 5. 镜像对子：作品存在 + 母题合法 + 必须有 claim 交集（否则 UI 必须写成“无 claim 交集”，此处先旗标）
    for (const p of nar.mirrorPairs || []) {
      for (const w of [p.a, p.b]) {
        if (!literary.includes(w)) fail(problems, `mirrorPair ${p.id} references invalid work ${w}`);
      }
      for (const mt of p.sharedMotifs || []) {
        if (!motifIds.has(mt)) fail(problems, `mirrorPair ${p.id} references missing motif ${mt}`);
      }
    }
  }
}

// Provenance 派生层健全性：T/S/E 合计必须等于证据总数，且不得出现第四层
const provTotals = data.provenanceIndex?.totals || {};
const provSum = (provTotals.T || 0) + (provTotals.S || 0) + (provTotals.E || 0);
if (provSum !== data.evidence.length) {
  fail(problems, `provenance totals ${provSum} != evidence ${data.evidence.length}`);
}
for (const ev of data.evidence) {
  if (!['T', 'S', 'E'].includes(ev.provenance)) fail(problems, `evidence ${ev.id} invalid provenance ${ev.provenance}`);
}
if (data.meta?.provenanceRule !== PROVENANCE_RULE) {
  fail(problems, 'meta.provenanceRule mismatch with shared module');
}

if (problems.length) {
  console.error('Data validation failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'ok',
  nodes: nodeIds.size,
  evidence: data.evidence.length,
  relations: data.relations.length,
  timelinePhases: data.timelinePhases.length,
  image2Rules: data.image2Rules.length
}, null, 2));
