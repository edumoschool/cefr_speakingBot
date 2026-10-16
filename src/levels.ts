import type { T, TKey } from './i18n';

export const CRITERIA = ['fluency_coherence', 'lexical_resource', 'grammar', 'pronunciation', 'task_response'] as const;

export const critName = (t: T, key: string) => t(`c_${key}` as TKey);

export function levelColor(level: string): string {
  if (level.startsWith('C1')) return 'success';
  if (level.startsWith('B2')) return 'primary';
  if (level.startsWith('B1')) return 'warning';
  return 'danger';
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
