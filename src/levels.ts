import type { T, TKey } from './i18n';

export const CRITERIA = ['fluency_coherence', 'lexical_resource', 'grammar', 'pronunciation', 'task_response'] as const;

export const critName = (t: T, key: string) => t(`c_${key}` as TKey);

/** Colour family of a level ('B2+' → 'b2'); matches the .lvl-* classes in theme.css. */
export function levelKey(level: string): 'below' | 'b1' | 'b2' | 'c1' {
  if (level.startsWith('C1')) return 'c1';
  if (level.startsWith('B2')) return 'b2';
  if (level.startsWith('B1')) return 'b1';
  return 'below';
}

/** CEFR band of a 0–75 score (same thresholds as the server's cefrFromScore). */
export function bandOf(score: number): string {
  if (score >= 65) return 'C1';
  if (score >= 51) return 'B2';
  if (score >= 38) return 'B1';
  return 'Below B1';
}

/** Plain-language meaning of a level, and how far the next one is. */
export function levelInfo(t: T, score: number) {
  const bands: { at: number; level: string; text: TKey }[] = [
    { at: 65, level: 'C1', text: 'levelC1' },
    { at: 51, level: 'B2', text: 'levelB2' },
    { at: 38, level: 'B1', text: 'levelB1' },
  ];
  const current = bands.find((b) => score >= b.at);
  const next = [...bands].reverse().find((b) => score < b.at);
  return {
    text: t(current ? current.text : 'levelBelowB1'),
    next: next ? t('toNext', { n: next.at - score, level: next.level }) : null,
  };
}

/** Level label for display ("Below B1" is translated; CEFR codes stay as they are). */
export const levelLabel = (t: T, level: string) => (level === 'Below B1' ? t('belowB1') : level);
