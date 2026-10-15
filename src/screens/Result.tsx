import {
  IonAccordion, IonAccordionGroup, IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip,
  IonContent, IonHeader, IonItem, IonLabel, IonPage, IonProgressBar, IonTitle, IonToolbar,
} from '@ionic/react';
import { CRITERIA_NAMES, levelColor } from '../levels';
import type { MockResult } from '../types';

export function Result({ result: r, onHome }: { result: MockResult; onHome: () => void }) {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Your result</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonCard className="ion-text-center">
          <IonCardContent>
            <p className="hint">{r.testTitle}</p>
            <div className="score" data-testid="score">
              {r.score}
              <small>/75</small>
            </div>
            <p>
              Level <IonBadge color={levelColor(r.level)}>{r.level}</IonBadge>
            </p>
            <p className="hint">B1 38–50 · B2 51–64 · C1 65–75</p>
          </IonCardContent>
        </IonCard>

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>Criteria</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            {Object.entries(r.criteria).map(([k, v]) => (
              <div key={k} style={{ margin: '10px 0' }}>
                <div className="ion-display-flex ion-justify-content-between">
                  <span>{CRITERIA_NAMES[k] ?? k}</span>
                  <b>{v}/75</b>
                </div>
                <IonProgressBar value={v / 75} />
              </div>
            ))}
          </IonCardContent>
        </IonCard>

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>Examiner feedback</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <p>{r.overall}</p>
            {r.strengths.length > 0 && <List title="✅ Strengths" items={r.strengths} />}
            {r.priorities.length > 0 && <List title="🎯 Focus next" items={r.priorities} />}
          </IonCardContent>
        </IonCard>

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>By part</IonCardTitle>
          </IonCardHeader>
          <IonAccordionGroup>
            {r.parts.map((p) => (
              <IonAccordion key={p.part} value={p.part}>
                <IonItem slot="header">
                  <IonLabel>Part {p.part}</IonLabel>
                  <IonBadge slot="end" color="light">{Math.round(p.points)}/75</IonBadge>
                </IonItem>
                <div className="ion-padding" slot="content">
                  <div>
                    {Object.entries(p.criteria).map(([k, v]) => (
                      <IonChip key={k} outline>
                        {CRITERIA_NAMES[k] ?? k}: {v}
                      </IonChip>
                    ))}
                  </div>
                  <p>{p.feedback}</p>
                </div>
              </IonAccordion>
            ))}
          </IonAccordionGroup>
        </IonCard>

        {r.corrections.length > 0 && (
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>✍️ Grammar fixes</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              {r.corrections.map((c, i) => (
                <div key={i} className="fix">
                  <div className="orig">{c.original}</div>
                  <div className="corr">{c.corrected}</div>
                  <div className="hint">{c.explanation}</div>
                </div>
              ))}
            </IonCardContent>
          </IonCard>
        )}

        {r.vocabulary.length > 0 && (
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>📈 Vocabulary upgrades</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              {r.vocabulary.map((v, i) => (
                <p key={i}>
                  <span className="hint">{v.basic} →</span> <b>{v.better}</b>
                  <br />
                  <span className="hint">{v.example}</span>
                </p>
              ))}
            </IonCardContent>
          </IonCard>
        )}

        {r.pronunciation.length > 0 && (
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>🗣 Pronunciation</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <List items={r.pronunciation} />
            </IonCardContent>
          </IonCard>
        )}

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>Your answers</IonCardTitle>
          </IonCardHeader>
          <IonAccordionGroup>
            {r.answers.map((a) => (
              <IonAccordion key={a.key} value={a.key}>
                <IonItem slot="header">
                  <IonLabel className="ion-text-wrap">
                    <p>Part {a.part}</p>
                    <h3>{a.question}</h3>
                  </IonLabel>
                </IonItem>
                <div className="ion-padding" slot="content">
                  {a.transcript === null ? (
                    <p className="hint">Not recorded.</p>
                  ) : (
                    <div className="transcript">{a.transcript || '(no speech detected)'}</div>
                  )}
                  {a.metrics && (
                    <div>
                      <IonChip outline>{a.metrics.wordCount} words</IonChip>
                      <IonChip outline>{a.metrics.wpm} wpm</IonChip>
                      <IonChip outline>{a.metrics.pauses} pauses</IonChip>
                      <IonChip outline>{a.metrics.fillers} fillers</IonChip>
                    </div>
                  )}
                  {a.comment && <p>{a.comment}</p>}
                  {a.modelAnswer && (
                    <>
                      <p className="hint">Model answer</p>
                      <div className="transcript model">{a.modelAnswer}</div>
                    </>
                  )}
                </div>
              </IonAccordion>
            ))}
          </IonAccordionGroup>
        </IonCard>

        <p className="hint ion-text-center">Scores are an AI estimate for practice, not an official result.</p>
        <div className="ion-padding">
          <IonButton expand="block" onClick={onHome} data-testid="home">
            Back to home
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
}

function List({ title, items }: { title?: string; items: string[] }) {
  return (
    <>
      {title && <b>{title}</b>}
      <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </>
  );
}
