import {
  IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader,
  IonIcon, IonItem, IonLabel, IonList, IonNote, IonPage, IonTitle, IonToolbar, useIonToast,
} from '@ionic/react';
import { bookOutline, copyOutline, micOutline, shareSocialOutline } from 'ionicons/icons';
import { levelColor } from '../levels';
import { haptic, openTelegramLink } from '../telegram';
import type { Me } from '../types';

const SHARE_TEXT = '🎤 Practise the Multilevel speaking exam with instant AI scoring — your first mock is free!';

export function Home({ me, onStart, onOpenResult, onVocab }: { me: Me; onStart: () => void; onOpenResult: (id: string) => void; onVocab: () => void }) {
  const [toast] = useIonToast();
  const r = me.referral;
  const canStart = !!me.active || me.user.attempts > 0;

  const share = () =>
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent(SHARE_TEXT)}`);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.link);
      haptic('success');
      toast({ message: 'Link copied', duration: 1500, position: 'top' });
    } catch {
      toast({ message: r.link, duration: 4000, position: 'top' });
    }
  };

  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar>
          <IonTitle>Speaking Mock</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">Speaking Mock</IonTitle>
          </IonToolbar>
        </IonHeader>
        <p className="ion-padding-horizontal hint">
          Hi, {me.user.firstName || 'there'}! Multilevel (CEFR) speaking practice with real exam questions and an instant score out of 75.
        </p>

        <IonCard>
          <IonCardContent>
            <div className="ion-display-flex ion-align-items-center ion-justify-content-between">
              <div>
                <IonNote>Mock attempts</IonNote>
                <div className="attempts-num" data-testid="attempts">{me.user.attempts}</div>
              </div>
              <IonButton size="large" disabled={!canStart} onClick={onStart} data-testid="start">
                <IonIcon slot="start" icon={micOutline} />
                {me.active ? (me.active.status === 'grading' ? 'See result' : 'Continue') : 'Start mock'}
              </IonButton>
            </div>
            {me.active && <p className="hint">Unfinished: {me.active.testTitle} · {me.active.answered.length} answers recorded</p>}
            {!canStart && <p className="hint">No attempts left — invite friends below to earn more.</p>}
          </IonCardContent>
        </IonCard>

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>👥 Invite friends, get free mocks</IonCardTitle>
            <IonCardSubtitle>Every {r.per} friends who join the channel through your link = +1 mock</IonCardSubtitle>
          </IonCardHeader>
          <IonCardContent>
            <div className="dots">
              {Array.from({ length: r.per }, (_, i) => (
                <div key={i} className={`dot ${i < r.progress ? 'on' : ''}`} />
              ))}
            </div>
            <p className="hint">
              {r.progress}/{r.per} towards your next mock · {r.qualified} friend(s) joined in total
            </p>
            <div className="ion-display-flex" style={{ gap: 8 }}>
              <IonButton expand="block" style={{ flex: 1 }} onClick={share}>
                <IonIcon slot="start" icon={shareSocialOutline} /> Share
              </IonButton>
              <IonButton expand="block" fill="outline" style={{ flex: 1 }} onClick={copy}>
                <IonIcon slot="start" icon={copyOutline} /> Copy
              </IonButton>
            </div>
            <code className="ref-link">{r.link}</code>
          </IonCardContent>
        </IonCard>

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>📚 Exam format</IonCardTitle>
          </IonCardHeader>
          <IonList lines="none">
            <IonItem><IonLabel><b>Part 1.1</b> · 3 personal questions · 30 s each</IonLabel></IonItem>
            <IonItem><IonLabel className="ion-text-wrap"><b>Part 1.2</b> · compare 2 pictures (45 s) + 2 questions (30 s)</IonLabel></IonItem>
            <IonItem><IonLabel><b>Part 2</b> · cue card · 1 min prep · 2 min talk</IonLabel></IonItem>
            <IonItem><IonLabel><b>Part 3</b> · for/against · 1 min prep · 2 min talk</IonLabel></IonItem>
            <IonItem button detail onClick={onVocab}>
              <IonIcon slot="start" icon={bookOutline} color="primary" />
              <IonLabel color="primary">Topic vocabulary (EN · UZ · RU)</IonLabel>
            </IonItem>
          </IonList>
        </IonCard>

        {me.history.length > 0 && (
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>🗂 My results</IonCardTitle>
            </IonCardHeader>
            <IonList>
              {me.history.map((h) => (
                <IonItem key={h.id} button detail onClick={() => onOpenResult(h.id)}>
                  <IonLabel>
                    <h3>{h.title}</h3>
                    <p>{new Date(h.date * 1000).toLocaleDateString()}</p>
                  </IonLabel>
                  <IonNote slot="end">
                    <b>{h.score}</b>/75 <IonBadge color={levelColor(h.level)}>{h.level}</IonBadge>
                  </IonNote>
                </IonItem>
              ))}
            </IonList>
          </IonCard>
        )}
      </IonContent>
    </IonPage>
  );
}
