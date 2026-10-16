import { useState } from 'react';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle } from '@ionic/react';
import { critName, levelLabel } from '../levels';
import { useI18n } from '../i18n';
import type { Me } from '../types';

const W = 320;
const H = 150;
const PAD = { l: 28, r: 16, t: 12, b: 20 };
const BANDS = [
  { at: 38, label: 'B1' },
  { at: 51, label: 'B2' },
  { at: 65, label: 'C1' },
];

/** Score trend across finished mocks (oldest → newest) and per-criterion change. */
export function ProgressCard({ history }: { history: Me['history'] }) {
  const { t } = useI18n();
  const points = [...history].reverse(); // API returns newest first
  const [active, setActive] = useState(points.length - 1);
  if (!points.length) {
    return (
      <IonCard>
        <IonCardHeader>
          <IonCardTitle>📈 {t('myProgress')}</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <p className="hint">{t('progressEmpty')}</p>
        </IonCardContent>
      </IonCard>
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
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>📈 {t('myProgress')}</IonCardTitle>
        <IonCardSubtitle>
          {t('latestBest', { latest: `${latest.score}/75`, best: `${best}/75` })}
          {prev ? ` · ${t('sinceLast', { d: delta(latest.score - prev.score) })}` : ''}
        </IonCardSubtitle>
      </IonCardHeader>
      <IonCardContent>
        {points.length > 1 && (
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
                <circle cx={x(i)} cy={y(p.score)} r={i === active ? 5 : 4} className={`trend-dot ${i === active ? 'on' : ''}`} />
              </g>
            ))}
            <text x={x(active)} y={Math.max(10, y(sel.score) - 10)} textAnchor="middle" className="trend-label">
              {sel.score}
            </text>
          </svg>
        )}
        <p className="hint" style={{ marginTop: 4 }}>
          {new Date(sel.date * 1000).toLocaleDateString()} · {levelLabel(t, sel.level)}
        </p>
        {latest.criteria && (
          <table className="crit-table">
            <tbody>
              {Object.entries(latest.criteria).map(([k, v]) => {
                const before = prev?.criteria?.[k];
                return (
                  <tr key={k}>
                    <td>{critName(t, k)}</td>
                    <td className="num">{v}/75</td>
                    <td className="num hint">{before === undefined ? '' : delta(v - before)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </IonCardContent>
    </IonCard>
  );
}

function delta(d: number) {
  if (d > 0) return `▲ ${d}`;
  if (d < 0) return `▼ ${-d}`;
  return '±0';
}
