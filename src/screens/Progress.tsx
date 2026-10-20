import { useState } from 'react';
import { bandOf, critName } from '../levels';
import { useI18n } from '../i18n';
import type { Me } from '../types';
import { BandScale, LevelBadge, Section } from '../ui';

const W = 320;
const H = 150;
const PAD = { l: 28, r: 16, t: 14, b: 20 };
const BANDS = [
  { at: 38, label: 'B1' },
  { at: 51, label: 'B2' },
  { at: 65, label: 'C1' },
];

/** Score trend across finished mocks (oldest → newest) and per-skill change. */
export function ProgressCard({ history }: { history: Me['history'] }) {
  const { t } = useI18n();
  const points = [...history].reverse(); // API returns newest first
  const [active, setActive] = useState(points.length - 1);
  if (!points.length) {
    return (
      <Section title={t('myProgress')}>
        <p className="pad hint" style={{ margin: 0 }}>{t('progressEmpty')}</p>
      </Section>
    );
  }

  const latest = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const best = Math.max(...points.map((p) => p.score));
  const x = (i: number) => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (points.length - 1));
  const y = (v: number) => PAD.t + (1 - v / 75) * (H - PAD.t - PAD.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const sel = points[Math.min(active, points.length - 1)];

  return (
    <>
      <Section title={t('myProgress')}>
        <div className="pad">
          <div className="stat-row">
            <div>
              <b>{latest.score}</b>
              <span>{t('statLatest')}</span>
            </div>
            <div>
              <b>{best}</b>
              <span>{t('statBest')}</span>
            </div>
            {prev && (
              <div>
                <b><Delta d={latest.score - prev.score} /></b>
                <span>{t('statChange')}</span>
              </div>
            )}
          </div>
          {points.length > 1 ? (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} className="trend" role="img" aria-label={`Scores: ${points.map((p) => p.score).join(', ')} out of 75`}>
                {BANDS.map((b) => (
                  <g key={b.label} className="band">
                    <line x1={PAD.l} x2={W - PAD.r} y1={y(b.at)} y2={y(b.at)} />
                    <text x={PAD.l - 6} y={y(b.at) + 4} textAnchor="end">{b.label}</text>
                  </g>
                ))}
                <path d={line} className="trend-line" />
                {points.map((p, i) => (
                  <g key={p.id} onClick={() => setActive(i)} className="trend-hit">
                    <circle cx={x(i)} cy={y(p.score)} r={14} fill="transparent" />
                    <circle cx={x(i)} cy={y(p.score)} r={i === active ? 5.5 : 4} className="trend-dot" />
                  </g>
                ))}
                <text x={x(active)} y={Math.max(10, y(sel.score) - 10)} textAnchor="middle" className="trend-label">
                  {sel.score}
                </text>
              </svg>
              <p className="hint row-between" style={{ margin: 0 }}>
                <span>{new Date(sel.date * 1000).toLocaleDateString()}</span>
                <LevelBadge level={sel.level} />
              </p>
            </>
          ) : (
            <BandScale score={latest.score} />
          )}
        </div>
      </Section>

      {latest.criteria && (
        <Section title={t('skillScores')}>
          <div className="pad" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {Object.entries(latest.criteria).map(([k, v]) => {
              const before = prev?.criteria?.[k];
              return (
                <div key={k} className="skill">
                  <div className="row-between">
                    <span>{critName(t, k)}</span>
                    <span>
                      {before !== undefined && <Delta d={v - before} />}
                      <LevelBadge level={bandOf(v)} />
                    </span>
                  </div>
                  <BandScale score={v} compact />
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}

function Delta({ d }: { d: number }) {
  const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
  return <span className={`delta ${cls}`}>{d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0'}</span>;
}
