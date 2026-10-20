// Small shared pieces that keep every screen on the same visual language.
import type { ReactNode } from 'react';
import { IonCard } from '@ionic/react';
import { bandOf, levelKey, levelLabel } from './levels';
import { useI18n } from './i18n';

const MAX = 75;
/** The Multilevel scale: where each band starts on 0–75. */
const BANDS = [
  { from: 0, to: 38, key: 'below' },
  { from: 38, to: 51, key: 'b1', label: 'B1' },
  { from: 51, to: 65, key: 'b2', label: 'B2' },
  { from: 65, to: 75, key: 'c1', label: 'C1' },
] as const;

/** CEFR level as a coloured tag; sub-levels (B1+, C1-) take their band's colour. */
export function LevelBadge({ level, large }: { level: string; large?: boolean }) {
  const { t } = useI18n();
  return <span className={`lvl lvl-${levelKey(level)} ${large ? 'lvl-lg' : ''}`}>{levelLabel(t, level)}</span>;
}

/**
 * The 0–75 Multilevel scale with the B1/B2/C1 thresholds, filled up to `score`.
 * Unreached bands stay as faint tints of their own colour.
 * Used for the total, each skill and the home screen, so it reads the same everywhere.
 */
export function BandScale({ score, compact }: { score: number; compact?: boolean }) {
  const s = Math.max(0, Math.min(MAX, score));
  // The filled part takes the colour of the band reached, so a B1 bar reads amber, not red.
  return (
    <div className={`scale scale-${levelKey(bandOf(s))} ${compact ? 'scale-sm' : ''}`} role="img" aria-label={`${score} / 75, ${bandOf(score)}`}>
      <div className="scale-track">
        {BANDS.map((b) => (
          <div key={b.key} className={`scale-seg lvl-${b.key}`} style={{ flexBasis: `${((b.to - b.from) / MAX) * 100}%` }}>
            <div className="scale-fill" style={{ width: `${Math.max(0, Math.min(1, (s - b.from) / (b.to - b.from))) * 100}%` }} />
          </div>
        ))}
        {!compact && <div className={`scale-pin lvl-${levelKey(bandOf(s))}`} style={{ left: `${(s / MAX) * 100}%` }} />}
      </div>
      {!compact && (
        <div className="scale-ticks" aria-hidden="true">
          {BANDS.filter((b) => b.from > 0).map((b) => (
            <span key={b.key} style={{ left: `${(b.from / MAX) * 100}%` }}>
              {'label' in b ? b.label : ''} <small>{b.from}</small>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** A Telegram-style group: a quiet heading outside, the content on a flat card. */
export function Section({ title, note, children, flush, className = '' }: { title?: ReactNode; note?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`group ${className}`}>
      {title && <h2 className="group-title">{title}</h2>}
      <IonCard className={flush ? 'flush' : ''}>{children}</IonCard>
      {note && <p className="group-note">{note}</p>}
    </section>
  );
}
