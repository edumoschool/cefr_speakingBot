// Turns the examiner model's CEFR labels into a 0–75 Multilevel score. Pure module.
//
// The LLM rates each part on five criteria as a CEFR sub-level (it is far more
// consistent at "solid B2" than at inventing numbers). Each label maps to points
// on the 0–75 scale, calibrated so a uniform label lands in the matching official
// band (B1 38–50, B2 51–64, C1 65–75); parts are then weighted.

export const LEVELS = ['none', 'A1', 'A2', 'B1-', 'B1', 'B1+', 'B2-', 'B2', 'B2+', 'C1-', 'C1', 'C1+'];

export const LEVEL_POINTS = {
  none: 0, A1: 14, A2: 27, 'B1-': 38, B1: 44, 'B1+': 49, 'B2-': 52, B2: 58, 'B2+': 63, 'C1-': 66, C1: 71, 'C1+': 75,
};

export const CRITERIA = ['fluency_coherence', 'lexical_resource', 'grammar', 'pronunciation', 'task_response'];

export const PART_WEIGHTS = { '1.1': 0.2, '1.2': 0.25, 2: 0.25, 3: 0.3 };

export function cefrFromScore(score) {
  if (score >= 65) return 'C1';
  if (score >= 51) return 'B2';
  if (score >= 38) return 'B1';
  return 'Below B1';
}

const idx = (l) => LEVELS.indexOf(l);
const minLevel = (a, b) => (idx(a) <= idx(b) ? a : b);

/**
 * Deterministic guardrail: cap fluency and task response by how much was
 * actually said relative to the time allowed (~100 wpm = a slow but full answer).
 */
export function lengthCap(words, allowedSec) {
  if (words === 0) return 'none';
  const ratio = words / ((allowedSec / 60) * 100);
  if (ratio < 0.15) return 'A1';
  if (ratio < 0.3) return 'A2';
  if (ratio < 0.5) return 'B1';
  if (ratio < 0.7) return 'B2';
  return 'C1+';
}

/**
 * Applies guardrails to one part's raw LLM labels.
 * @param {Record<string,string>|null} raw  labels from the model (null = not graded)
 * @param {number} words      content words spoken in the part
 * @param {number} allowedSec speaking time allowed for the answered questions
 */
export function scorePart(raw, words, allowedSec) {
  const criteria = {};
  for (const c of CRITERIA) {
    let l = raw && LEVELS.includes(raw[c]) ? raw[c] : 'none';
    if (words === 0) l = 'none';
    else if (c === 'fluency_coherence' || c === 'task_response') l = minLevel(l, lengthCap(words, allowedSec));
    criteria[c] = l;
  }
  const points = CRITERIA.reduce((s, c) => s + LEVEL_POINTS[criteria[c]], 0) / CRITERIA.length;
  return { criteria, points: Math.round(points * 10) / 10 };
}

/** @param {{part:string, criteria:Record<string,string>, points:number}[]} parts all four parts */
export function totalScore(parts) {
  const score = Math.round(parts.reduce((s, p) => s + p.points * PART_WEIGHTS[p.part], 0));
  const criteria = {};
  for (const c of CRITERIA) {
    criteria[c] = Math.round(parts.reduce((s, p) => s + LEVEL_POINTS[p.criteria[c]] * PART_WEIGHTS[p.part], 0));
  }
  return { score, level: cefrFromScore(score), criteria };
}
