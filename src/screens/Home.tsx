import {
  IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader,
  IonIcon, IonItem, IonLabel, IonList, IonNote, IonPage, IonSegment, IonSegmentButton, IonTitle, IonToolbar, useIonToast,
} from '@ionic/react';
import { copyOutline, micOutline, shareSocialOutline, starOutline } from 'ionicons/icons';
import { useState } from 'react';
import { api } from '../api';
import { ProgressCard } from './Progress';
import { levelColor } from '../levels';
import { haptic, openTelegramLink, tg } from '../telegram';
import type { Me } from '../types';

const SHARE_TEXT = '🎤 Practise the Multilevel speaking exam with instant AI scoring — your first mock is free!';

export function Home({ me, onStart, onOpenResult, onRefresh }: { me: Me; onStart: () => void; onOpenResult: (id: string) => void; onRefresh: () => Promise<Me | undefined> }) {
  const [toast] = useIonToast();
  const r = me.referral;
  const canStart = !!me.active || me.user.attempts > 0;

  const [buying, setBuying] = useState<string | null>(null);
  const [lang, setLang] = useState(me.feedbackLang);
  const changeLang = async (value: string) => {
    const prev = lang;
    setLang(value as Me['feedbackLang']);
    try {
      await api.setPrefs(value);
    } catch {
      setLang(prev);
      toast({ message: 'Could not save the language. Try again.', duration: 2000, position: 'top', color: 'danger' });
    }
  };

  // Stars purchase: the credit arrives via the bot's successful_payment update, so poll briefly.
  const buy = async (packId: string) => {
    if (!tg?.openInvoice) return openTelegramLink(`https://t.me/${me.botUsername}?start=buy`);
    setBuying(packId);
    try {
      const { link } = await api.createInvoice(packId);
      tg.openInvoice(link, async (status) => {
        if (status !== 'paid') return setBuying(null);
        haptic('success');
        const before = me.user.attempts;
        for (let i = 0; i < 8; i++) {
          const fresh = await onRefresh();
          if (fresh && fresh.user.attempts > before) break;
          await new Promise((r) => setTimeout(r, 1500));
        }
        setBuying(null);
        toast({ message: 'Thank you! Your mocks were added.', duration: 2500, position: 'top', color: 'success' });
      });
    } catch (e) {
      setBuying(null);
      toast({ message: e instanceof Error ? e.message : String(e), duration: 3000, position: 'top', color: 'danger' });
    }
  };

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

        <ProgressCard history={me.history} />

        <IonCard>
          <IonCardHeader>
            <IonCardSubtitle>Feedback language · Fikr-mulohaza tili · Язык отзыва</IonCardSubtitle>
          </IonCardHeader>
          <IonCardContent>
            <IonSegment value={lang} onIonChange={(e) => changeLang(String(e.detail.value))} data-testid="lang">
              <IonSegmentButton value="en"><IonLabel>English</IonLabel></IonSegmentButton>
              <IonSegmentButton value="uz"><IonLabel>O'zbekcha</IonLabel></IonSegmentButton>
              <IonSegmentButton value="ru"><IonLabel>Русский</IonLabel></IonSegmentButton>
            </IonSegment>
          </IonCardContent>
        </IonCard>

        {me.shop && (
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>⭐ Get more mocks</IonCardTitle>
              <IonCardSubtitle>Pay with Telegram Stars</IonCardSubtitle>
            </IonCardHeader>
            <IonList lines="none">
              {me.shop.map((p) => (
                <IonItem key={p.id}>
                  <IonLabel>
                    {p.attempts} mock{p.attempts === 1 ? '' : 's'}
                  </IonLabel>
                  <IonButton slot="end" fill="outline" disabled={!!buying} onClick={() => buy(p.id)} data-testid={`buy-${p.id}`}>
                    <IonIcon slot="start" icon={starOutline} />
                    {buying === p.id ? '…' : p.stars}
                  </IonButton>
                </IonItem>
              ))}
            </IonList>
          </IonCard>
        )}

        <IonCard>
          <IonCardHeader>
            <IonCardTitle>📚 Exam format</IonCardTitle>
          </IonCardHeader>
          <IonList lines="none">
            <IonItem><IonLabel><b>Part 1.1</b> · 3 personal questions · 30 s each</IonLabel></IonItem>
            <IonItem><IonLabel className="ion-text-wrap"><b>Part 1.2</b> · compare 2 pictures (45 s) + 2 questions (30 s)</IonLabel></IonItem>
            <IonItem><IonLabel><b>Part 2</b> · cue card · 1 min prep · 2 min talk</IonLabel></IonItem>
            <IonItem><IonLabel><b>Part 3</b> · for/against · 1 min prep · 2 min talk</IonLabel></IonItem>
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
