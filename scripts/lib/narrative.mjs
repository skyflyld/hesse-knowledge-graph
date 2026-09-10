/**
 * 叙事层派生（E · Editorial Model）
 *
 * 职责：把 narrative.json 里的编者结论与真实 evidence 对接，并在 build 时算出
 *       「每一条编者结论有多少真实 claim 撑着」——这是 GPT 提的证伪测试里
 *       可机械化的那一部分（Evidence Concentration）。
 *
 * 不做的事：不做「独立编码一致性」判断——那需要两名独立编码者，属人力环节，
 *          本项目不把不可自动化的检查伪装成自动化。
 */

export const MOVEMENT_ORDER = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07'];

/** 取所有编者结论里引用的 claim id（去重、保持出现顺序） */
function collectClaims(shape, key) {
  const ids = [];
  const seen = new Set();
  const walk = (arr) => {
    for (const item of arr || []) {
      for (const cid of item.supportingClaims || []) {
        if (!seen.has(cid)) {
          seen.add(cid);
          ids.push(cid);
        }
      }
    }
  };
  walk(shape);
  return ids;
}

export function applyNarrative(data) {
  const narrative = data.narrative;
  if (!narrative) return data;

  const claimsByWork = {};
  const claimById = {};
  for (const e of data.evidence) {
    (claimsByWork[e.workId] = claimsByWork[e.workId] || []).push(e);
    claimById[e.id] = e;
  }

  const movements = {};
  for (const m of narrative.movements || []) {
    const memberClaims = (m.works || []).flatMap((w) => claimsByWork[w] || []);
    const anchored = collectClaims(m.coreConclusions, 'movement');
    const anchoredReal = anchored.filter((id) => claimById[id]);
    const cores = m.coreConclusions || [];
    const coresWithEvidence = cores.filter((c) =>
      (c.supportingClaims || []).some((id) => claimById[id])
    );
    movements[m.id] = {
      workCount: (m.works || []).length,
      claimsAvailable: memberClaims.length,
      coreCount: cores.length,
      coresWithEvidence: coresWithEvidence.length,
      anchoredClaimCount: anchoredReal.length,
      // 证据密度：本段的编者结论用掉了本段可用 claim 的多少
      evidenceDensity: memberClaims.length
        ? Number((anchoredReal.length / memberClaims.length).toFixed(3))
        : null,
      // 证伪测试 2（Evidence Concentration）：核心结论锚定率 <50% 视为不达标
      concentrationPass: cores.length
        ? coresWithEvidence.length / cores.length >= 0.5
        : null
    };
  }

  const mirrorPairs = {};
  for (const p of narrative.mirrorPairs || []) {
    const aClaims = (claimsByWork[p.a] || []).filter((c) => (p.sharedMotifs || []).includes(c.nodeId));
    const bClaims = (claimsByWork[p.b] || []).filter((c) => (p.sharedMotifs || []).includes(c.nodeId));
    mirrorPairs[p.id] = {
      sharedMotifs: p.sharedMotifs || [],
      aClaims: aClaims.map((c) => c.id),
      bClaims: bClaims.map((c) => c.id),
      // 两个作品在同一母题下都各有真实 claim 才叫「有交集」
      hasOverlap: aClaims.length > 0 && bClaims.length > 0
    };
  }

  const fourQuestions = {};
  for (const q of narrative.fourQuestions || []) {
    const ids = (q.supportingClaims || []).filter((id) => claimById[id]);
    fourQuestions[q.id] = {
      claimCount: ids.length,
      claims: ids,
      works: [...new Set(ids.map((id) => claimById[id].workId))]
    };
  }

  const thesisClaims = (narrative.thesis?.supportingClaims || []).filter((id) => claimById[id]);

  data.narrativeIndex = {
    movements,
    mirrorPairs,
    fourQuestions,
    thesis: { claimCount: thesisClaims.length, claims: thesisClaims }
  };

  return data;
}

/**
 * 结构性断言用的派生事实（供 validate 使用）：
 * 每个作品的归属、每个 Movement 的年份区间。
 */
export function movementStructure(narrative) {
  const byWork = {};
  for (const m of narrative.movements || []) {
    for (const w of m.works || []) {
      byWork[w] = (byWork[w] || []).concat(m.id);
    }
  }
  const ranges = (narrative.movements || []).map((m) => {
    const years = String(m.years || '').split(/[^0-9]+/).filter(Boolean).map(Number);
    return { id: m.id, from: Math.min(...years), to: Math.max(...years) };
  });
  return { byWork, ranges };
}
