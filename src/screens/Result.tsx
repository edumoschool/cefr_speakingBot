import type { ReactNode } from 'react';
import {
  IonAccordion, IonAccordionGroup, IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonLabel, IonPage,
  IonTitle, IonToolbar,
} from '@ionic/react';
import {
  barChartOutline, chatbubblesOutline, createOutline, headsetOutline, layersOutline, megaphoneOutline, shareSocialOutline,
} from 'ionicons/icons';
import { PART_NAME, useI18n } from '../i18n';
import { bandOf, critName, levelInfo, levelLabel } from '../levels';
import { openTelegramLink } from '../telegram';
import type { MockResult } from '../types';
import { BandScale, LevelBadge, Section } from '../ui';

/** Most important first: level in plain words, what to improve, then details on tap. */
export function Result({ result: r, onHome, shareLink }: { result: MockResult; onHome: () => void; shareLink?: string }) {
  const { t } = useI18n();
  const info = levelInfo(t, r.score);
  const drill = r.kind === 'drill';

  // Growth loop: the shared post carries the student's own referral link.
  const share = () =>
    openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(shareLink ?? '')}&text=${encodeURIComponent(t('shareText', { score: r.score, level: levelLabel(t, r.level) }))}`,
    );

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{drill ? t('practiceResult') : t('yourResult')}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <Section>
          <div className="score-hero">
            {drill && r.drillPart && <p className="hint" style={{ margin: '0 0 10px' }}>{t('part', { p: r.drillPart })}: {t(PART_NAME[r.drillPart])}</p>}
            <LevelBadge level={r.level} large />
            <div className="score" data-testid="score">
              {r.score}
              <small> {t('outOf')}</small>
            </div>
            <BandScale score={r.score} />
            <p className="level-text">{info.text}</p>
            {info.next && <p className="goal">{info.next}</p>}
            {shareLink && (
              <IonButton fill="outline" size="small" className="share-btn" onClick={share} data-testid="share-result">
                <IonIcon slot="start" icon={shareSocialOutline} /> {t('shareResult')}
              </IonButton>
            )}
          </div>
        </Section>

        {r.priorities.length > 0 && (
          <Section title={t('improveFirst')}>
            <ol className="tips-list pad" style={{ paddingLeft: 36 }}>
              {r.priorities.slice(0, 3).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          </Section>
        )}

        {r.strengths.length > 0 && (
          <Section title={t('didWell')}>
            <ul className="tips-list pad" style={{ paddingLeft: 36 }}>
              {r.strengths.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </Section>
        )}

        {r.overall && (
          <Section title={t('examinerSays')}>
            <p className="body-text pad">{r.overall}</p>
          </Section>
        )}

        <Section>
          <IonAccordionGroup value="skills">
            <Panel value="skills" icon={barChartOutline} title={t('skillScores')}>
              {Object.entries(r.criteria).map(([k, v]) => (
                <div key={k} className="skill">
                  <div className="row-between">
                    <span>{critName(t, k)}</span>
                    <span>
                      <span className="hint num">{v}/75</span>
                      <LevelBadge level={bandOf(v)} />
                    </span>
                  </div>
                  <BandScale score={v} compact />
                </div>
              ))}
            </Panel>

            {!drill && (
              <Panel value="parts" icon={layersOutline} title={t('byPart')}>
                {r.parts.map((p) => (
                  <div key={p.part} className="part-score">
                    <div className="row-between">
                      <b>{t('part', { p: p.part })}: {t(PART_NAME[p.part])}</b>
                      <span className="num">{Math.round(p.points)}/75</span>
                    </div>
                    <div className="crit-tags">
                      {Object.entries(p.criteria).map(([k, v]) => (
                        <span key={k}>
                          {critName(t, k)} <b>{v}</b>
                        </span>
                      ))}
                    </div>
                    {p.feedback && <p className="hint" style={{ margin: 0 }}>{p.feedback}</p>}
                  </div>
                ))}
              </Panel>
            )}

            {r.corrections.length > 0 && (
              <Panel value="grammar" icon={createOutline} title={`${t('grammarFixes')} (${r.corrections.length})`}>
                {r.corrections.map((c, i) => (
                  <div key={i} className="fix">
                    <div className="orig">{c.original}</div>
                    <div className="corr">{c.corrected}</div>
                    <div className="hint">{c.explanation}</div>
                  </div>
                ))}
              </Panel>
            )}

            {r.vocabulary.length > 0 && (
              <Panel value="words" icon={chatbubblesOutline} title={`${t('betterWords')} (${r.vocabulary.length})`}>
                {r.vocabulary.map((v, i) => (
                  <div key={i} className="word">
                    <span className="hint">{v.basic}</span> → <b>{v.better}</b>
                    <div className="hint">{v.example}</div>
                  </div>
                ))}
              </Panel>
            )}

            {r.pronunciation.length > 0 && (
              <Panel value="pron" icon={megaphoneOutline} title={t('pronunciation')}>
                <ul className="tips-list">
                  {r.pronunciation.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </Panel>
            )}

            <IonAccordion value="answers">
              <IonItem slot="header">
                <IonIcon slot="start" icon={headsetOutline} />
                <IonLabel>{t('yourAnswers')}</IonLabel>
              </IonItem>
              <div slot="content">
                {r.answers.map((a) => (
                  <div key={a.key} className="answer-block">
                    <p className="hint" style={{ margin: 0 }}>{t('part', { p: a.part })}</p>
                    <h3>{a.question}</h3>
                    {a.transcript === null ? (
                      <p className="hint">{t('notRecorded')}</p>
                    ) : (
                      <div className="transcript">{a.transcript || t('noSpeech')}</div>
                    )}
                    {a.metrics && (
                      <div className="metric-row">
                        <span>{t('words', { n: a.metrics.wordCount })}</span>
                        <span>{t('wpm', { n: a.metrics.wpm })}</span>
                        <span>{t('pauses', { n: a.metrics.pauses })}</span>
                      </div>
                    )}
                    {a.comment && <p className="body-text">{a.comment}</p>}
                    {a.modelAnswer && (
                      <>
                        <p className="hint" style={{ margin: '12px 0 0' }}>{t('modelAnswer')}</p>
                        <div className="transcript model">{a.modelAnswer}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </IonAccordion>
          </IonAccordionGroup>
        </Section>

        <p className="group-note" style={{ marginBottom: 24 }}>
          {t('markingNote')} {t('disclaimer')}
        </p>
      </IonContent>
      <IonFooter className="ion-padding ion-no-border">
        <IonButton expand="block" size="large" onClick={onHome} data-testid="home">
          {t('backHome')}
        </IonButton>
      </IonFooter>
    </IonPage>
  );
}

function Panel({ value, icon, title, children }: { value: string; icon: string; title: string; children: ReactNode }) {
  return (
    <IonAccordion value={value}>
      <IonItem slot="header">
        <IonIcon slot="start" icon={icon} />
        <IonLabel>{title}</IonLabel>
      </IonItem>
      <div slot="content" className="pad-x">
        {children}
      </div>
    </IonAccordion>
  );
}
