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

// The same idea as a local examiner marking one candidate: the five criteria
// describe one speaker, so they rarely sit far apart. Pronunciation is inferred
// from ASR (the model never hears the audio), so it stays closest to the rest.
const SPREAD = 2; // sub-levels a criterion may sit above/below the part's median
const PRON_SPREAD = 1;
// Off-topic or memorised answers: a weak task response caps everything else.
const WEAK_TASK = idx('B1-');
const WEAK_TASK_CAP = 'B1';

const clamp = (l, lo, hi) => LEVELS[Math.min(Math.max(idx(l), lo), hi)];

/**
 * Applies guardrails to one part's raw LLM labels, in this order:
 *  1. an outlier criterion is pulled back towards the part's median, so one
 *     harsh grammar label can't sink a good answer and one generous vocabulary
 *     label can't lift a weak one (task response is only ever lowered);
 *  2. fluency and task response are capped by how much was actually said;
 *  3. a part that misses the task (task_response below B1-, off-topic or far too
 *     short) caps the other criteria at B1.
 * @param {Record<string,string>|null} raw  labels from the model (null = not graded)
 * @param {number} words      content words spoken in the part
 * @param {number} allowedSec speaking time allowed for the answered questions
 */
export function scorePart(raw, words, allowedSec) {
  const given = Object.fromEntries(CRITERIA.map((c) => [c, raw && LEVELS.includes(raw[c]) ? raw[c] : 'none']));
  const median = CRITERIA.map((c) => idx(given[c])).sort((a, b) => a - b)[Math.floor(CRITERIA.length / 2)];
  const empty = words === 0 || median === 0;
  const cap = lengthCap(words, allowedSec);
  const criteria = {};
  for (const c of CRITERIA) {
    let l = given[c];
    if (empty) l = 'none';
    else {
      const spread = c === 'pronunciation' ? PRON_SPREAD : SPREAD;
      l = clamp(l, Math.max(1, median - spread), median + spread);
      if (c === 'task_response') l = minLevel(l, given[c]); // never lifted: it is the anchor against overgrading
      if (c === 'fluency_coherence' || c === 'task_response') l = minLevel(l, cap);
    }
    criteria[c] = l;
  }
  if (!empty && idx(criteria.task_response) < WEAK_TASK) {
    for (const c of CRITERIA) if (c !== 'task_response') criteria[c] = minLevel(criteria[c], WEAK_TASK_CAP);
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

/** A drill is scored on its one part alone (same 0–75 scale and bands). */
export function drillScore(part) {
  const score = Math.round(part.points);
  const criteria = {};
  for (const c of CRITERIA) criteria[c] = LEVEL_POINTS[part.criteria[c]];
  return { score, level: cefrFromScore(score), criteria };
}
