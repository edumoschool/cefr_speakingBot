import {
  IonAccordion, IonAccordionGroup, IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip,
  IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonLabel, IonPage, IonProgressBar, IonTitle, IonToolbar,
} from '@ionic/react';
import { shareSocialOutline } from 'ionicons/icons';
import { PART_NAME, useI18n } from '../i18n';
import { critName, levelColor, levelInfo, levelLabel } from '../levels';
import { openTelegramLink } from '../telegram';
import type { MockResult } from '../types';

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
        <IonCard className="ion-text-center score-hero">
          <IonCardContent>
            {drill && r.drillPart && <p className="hint">{t('part', { p: r.drillPart })} · {t(PART_NAME[r.drillPart])}</p>}
            <IonBadge color={levelColor(r.level)} className="level-badge">{levelLabel(t, r.level)}</IonBadge>
            <div className="score" data-testid="score">
              {r.score}
              <small> {t('outOf')}</small>
            </div>
            <p className="level-text">{info.text}</p>
            {info.next && <p className="hint">🎯 {info.next}</p>}
            {shareLink && (
              <IonButton fill="outline" size="small" onClick={share} data-testid="share-result">
                <IonIcon slot="start" icon={shareSocialOutline} /> {t('shareResult')}
              </IonButton>
            )}
          </IonCardContent>
        </IonCard>

        {r.priorities.length > 0 && (
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>🎯 {t('improveFirst')}</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <ol className="tips-list">
                {r.priorities.slice(0, 3).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ol>
            </IonCardContent>
          </IonCard>
        )}

        {r.strengths.length > 0 && (
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>✅ {t('didWell')}</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <ul className="tips-list">
                {r.strengths.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </IonCardContent>
          </IonCard>
        )}

        {r.overall && (
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>💬 {t('examinerSays')}</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <p>{r.overall}</p>
            </IonCardContent>
          </IonCard>
        )}

        <IonCard>
          <IonAccordionGroup>
            <IonAccordion value="skills">
              <IonItem slot="header">
                <IonLabel>📊 {t('skillScores')}</IonLabel>
              </IonItem>
              <div className="ion-padding" slot="content">
                {Object.entries(r.criteria).map(([k, v]) => (
                  <div key={k} style={{ margin: '10px 0' }}>
                    <div className="ion-display-flex ion-justify-content-between">
                      <span>{critName(t, k)}</span>
                      <b>{v}/75</b>
                    </div>
                    <IonProgressBar value={v / 75} />
                  </div>
                ))}
              </div>
            </IonAccordion>

            {!drill && (
              <IonAccordion value="parts">
                <IonItem slot="header">
                  <IonLabel>🧩 {t('byPart')}</IonLabel>
                </IonItem>
                <div className="ion-padding" slot="content">
                  {r.parts.map((p) => (
                    <div key={p.part} className="part-score">
                      <div className="ion-display-flex ion-justify-content-between">
                        <b>{t('part', { p: p.part })} · {t(PART_NAME[p.part])}</b>
                        <b>{Math.round(p.points)}/75</b>
                      </div>
                      <div>
                        {Object.entries(p.criteria).map(([k, v]) => (
                          <IonChip key={k} outline>
                            {critName(t, k)}: {v}
                          </IonChip>
                        ))}
                      </div>
                      <p className="hint">{p.feedback}</p>
                    </div>
                  ))}
                </div>
              </IonAccordion>
            )}

            {r.corrections.length > 0 && (
              <IonAccordion value="grammar">
                <IonItem slot="header">
                  <IonLabel>✍️ {t('grammarFixes')} ({r.corrections.length})</IonLabel>
                </IonItem>
                <div className="ion-padding" slot="content">
                  {r.corrections.map((c, i) => (
                    <div key={i} className="fix">
                      <div className="orig">{c.original}</div>
                      <div className="corr">{c.corrected}</div>
                      <div className="hint">{c.explanation}</div>
                    </div>
                  ))}
                </div>
              </IonAccordion>
            )}

            {r.vocabulary.length > 0 && (
              <IonAccordion value="words">
                <IonItem slot="header">
                  <IonLabel>📈 {t('betterWords')} ({r.vocabulary.length})</IonLabel>
                </IonItem>
                <div className="ion-padding" slot="content">
                  {r.vocabulary.map((v, i) => (
                    <p key={i}>
                      <span className="hint">{v.basic} →</span> <b>{v.better}</b>
                      <br />
                      <span className="hint">{v.example}</span>
                    </p>
                  ))}
                </div>
              </IonAccordion>
            )}

            {r.pronunciation.length > 0 && (
              <IonAccordion value="pron">
                <IonItem slot="header">
                  <IonLabel>🗣 {t('pronunciation')}</IonLabel>
                </IonItem>
                <div className="ion-padding" slot="content">
                  <ul className="tips-list">
                    {r.pronunciation.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              </IonAccordion>
            )}

            <IonAccordion value="answers">
              <IonItem slot="header">
                <IonLabel>🎧 {t('yourAnswers')}</IonLabel>
              </IonItem>
              <div slot="content">
                {r.answers.map((a) => (
                  <div key={a.key} className="ion-padding answer-block">
                    <p className="hint">{t('part', { p: a.part })}</p>
                    <h3>{a.question}</h3>
                    {a.transcript === null ? (
                      <p className="hint">{t('notRecorded')}</p>
                    ) : (
                      <div className="transcript">{a.transcript || t('noSpeech')}</div>
                    )}
                    {a.metrics && (
                      <div>
                        <IonChip outline>{t('words', { n: a.metrics.wordCount })}</IonChip>
                        <IonChip outline>{t('wpm', { n: a.metrics.wpm })}</IonChip>
                        <IonChip outline>{t('pauses', { n: a.metrics.pauses })}</IonChip>
                      </div>
                    )}
                    {a.comment && <p>{a.comment}</p>}
                    {a.modelAnswer && (
                      <>
                        <p className="hint">{t('modelAnswer')}</p>
                        <div className="transcript model">{a.modelAnswer}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </IonAccordion>
          </IonAccordionGroup>
        </IonCard>

        <p className="hint ion-text-center ion-padding-horizontal">{t('disclaimer')}</p>
      </IonContent>
      <IonFooter className="ion-padding ion-no-border">
        <IonButton expand="block" onClick={onHome} data-testid="home">
          {t('backHome')}
        </IonButton>
      </IonFooter>
    </IonPage>
  );
}
