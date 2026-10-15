import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface TestDef {
  id: string;
  title: string;
  topics: string;
  source: string;
  part1_1: string[];
  part1_2: string[];
  part1_2_images: string[];
  part2: string[];
  part2_image?: string;
  part3: { statement: string; for: string[]; against: string[] };
  model?: { part1_1: string[]; part1_2: string[]; part2: string; part3: string };
}

export type PartId = '1.1' | '1.2' | '2' | '3';

export interface Step {
  key: string;
  part: PartId;
  /** Question shown and read to the candidate. For parts 2/3 this is the task. */
  question: string;
  prepSec: number;
  speakSec: number;
  images?: string[];
  bullets?: string[];
  table?: { statement: string; for: string[]; against: string[] };
}

/** Official Multilevel timings. */
export const TIMING = {
  p11: { prep: 5, speak: 30 },
  p12first: { prep: 10, speak: 45 },
  p12: { prep: 5, speak: 30 },
  p2: { prep: 60, speak: 120 },
  p3: { prep: 60, speak: 120 },
} as const;

let cache: TestDef[] | undefined;

export function allTests(): TestDef[] {
  if (!cache) {
    const file = path.join(process.cwd(), 'data', 'tests.json');
    cache = JSON.parse(readFileSync(file, 'utf8')) as TestDef[];
  }
  return cache;
}

export function getTest(id: string): TestDef | undefined {
  return allTests().find((t) => t.id === id);
}

export function buildSteps(t: TestDef): Step[] {
  const img = (f: string) => `/img/${f}`;
  const steps: Step[] = [];
  t.part1_1.forEach((q, i) =>
    steps.push({ key: `p1_1_${i + 1}`, part: '1.1', question: q, prepSec: TIMING.p11.prep, speakSec: TIMING.p11.speak }),
  );
  t.part1_2.forEach((q, i) => {
    const timing = i === 0 ? TIMING.p12first : TIMING.p12;
    steps.push({
      key: `p1_2_${i + 1}`,
      part: '1.2',
      question: q,
      prepSec: timing.prep,
      speakSec: timing.speak,
      images: t.part1_2_images.map(img),
    });
  });
  steps.push({
    key: 'p2',
    part: '2',
    question: t.part2[0],
    bullets: t.part2,
    images: t.part2_image ? [img(t.part2_image)] : undefined,
    prepSec: TIMING.p2.prep,
    speakSec: TIMING.p2.speak,
  });
  steps.push({
    key: 'p3',
    part: '3',
    question: t.part3.statement,
    table: t.part3,
    prepSec: TIMING.p3.prep,
    speakSec: TIMING.p3.speak,
  });
  return steps;
}

/** Picks a test the user has not taken yet; once all are used, the least-taken one. */
export function pickTest(taken: string[], rand = Math.random): TestDef {
  const tests = allTests();
  const counts = new Map<string, number>();
  for (const id of taken) counts.set(id, (counts.get(id) ?? 0) + 1);
  const min = Math.min(...tests.map((t) => counts.get(t.id) ?? 0));
  const pool = tests.filter((t) => (counts.get(t.id) ?? 0) === min);
  return pool[Math.floor(rand() * pool.length)];
}

/** Model answer for a step, if the source book had one. */
export function modelAnswer(t: TestDef, key: string): string | undefined {
  if (!t.model) return undefined;
  const m = /^p1_(1|2)_(\d+)$/.exec(key);
  if (m) return (m[1] === '1' ? t.model.part1_1 : t.model.part1_2)[Number(m[2]) - 1] || undefined;
  if (key === 'p2') return t.model.part2 || undefined;
  if (key === 'p3') return t.model.part3 || undefined;
  return undefined;
}
