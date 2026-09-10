/**
 * Claim Provenance 派生层（单一真相源）
 * 供 build-data.mjs 与 validate-data.mjs 共用 —— 避免两边规则漂移。
 *
 * 三层定义（对应 README「Evidence 契约」已存在的字段，不新增人工标注）：
 *   T — TEXT        黑塞原始文本事实（文学部次 w01–w11，且 quoteType 为
 *                   direct / direct_excerpt / paraphrase）
 *   S — SCHOLARSHIP 外部学术文献（w12 External Scholarship；或 metadata / doi 定位）
 *   E — EDITORIAL   本项目跨文本归纳（quoteType = interpretive）
 *
 * 为什么不把 provenance 写进 data/*.json：
 *   证据层为只读层（红线 6）。派生字段在 build 时计算，规则可审计、可重算，
 *   不需要人工给 124 条 claim 逐条打标（也避免人工打标引入不一致）。
 */

export function provenanceOf(item) {
  const sr = item.sourceRef || {};
  const quoteType = sr.quoteType;
  const locatorType = sr.locatorType;
  if (quoteType === 'interpretive') return 'E';
  if (item.workId === 'w12' || quoteType === 'metadata' || locatorType === 'doi') return 'S';
  return 'T';
}

export const PROVENANCE_RULE =
  'E=quoteType:interpretive ; S=workId:w12|quoteType:metadata|locatorType:doi ; T=其余（文学部次 textual）';

/**
 * 就地派生：给每条 evidence 附 provenance，并生成索引与动态计数。
 * 幂等：重复调用结果一致。
 */
export function applyProvenance(data) {
  const totals = { T: 0, S: 0, E: 0 };
  const byNode = {};
  const byWork = {};
  const claimCountByNode = {};
  const claimCountByWork = {};

  for (const item of data.evidence) {
    const p = provenanceOf(item);
    item.provenance = p;
    totals[p] += 1;

    const n = item.nodeId || 'unknown';
    byNode[n] = byNode[n] || { T: 0, S: 0, E: 0 };
    byNode[n][p] += 1;
    claimCountByNode[n] = (claimCountByNode[n] || 0) + 1;

    const w = item.workId || 'unknown';
    byWork[w] = byWork[w] || { T: 0, S: 0, E: 0 };
    byWork[w][p] += 1;
    claimCountByWork[w] = (claimCountByWork[w] || 0) + 1;
  }

  data.provenanceIndex = { totals, byNode, byWork };
  data.claimCountByNode = claimCountByNode;
  data.claimCountByWork = claimCountByWork;
  // 注意：meta 内不放时间戳 —— 否则 validate 的桥接文件全等比对必然失败
  data.meta = { evidenceTotal: data.evidence.length, provenanceRule: PROVENANCE_RULE };
  return data;
}

export const BRIDGE_KEYS = [
  'works',
  'motifs',
  'debates',
  'characters',
  'structures',
  'grammars',
  'cultures',
  'persons',
  'receptionEvents',
  'evidence',
  'relations',
  'timelinePhases',
  'image2Rules',
  'provenanceIndex',
  'claimCountByNode',
  'claimCountByWork',
  'meta'
];
