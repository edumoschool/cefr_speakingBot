import { useState } from 'react';
import {
  IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonFooter,
  IonHeader, IonIcon, IonItem, IonLabel, IonList, IonNote, IonPage, IonSegment, IonSegmentButton, IonTitle, IonToolbar,
  useIonToast,
} from '@ionic/react';
import {
  bookOutline, chatbubbleEllipsesOutline, copyOutline, helpCircleOutline, micOutline, peopleOutline, playOutline,
  settingsOutline, shareSocialOutline, starOutline, trendingUpOutline,
} from 'ionicons/icons';
import { api } from '../api';
import { errorText, LANG_NAMES, PART_INFO, PART_NAME, useI18n, type Lang } from '../i18n';
import { levelColor, levelLabel } from '../levels';
import { haptic, openTelegramLink, tg } from '../telegram';
import type { Me, PartId } from '../types';
import { ProgressCard } from './Progress';

export type TabId = 'practice' | 'progress' | 'friends' | 'settings';

interface Props {
  me: Me;
  tab: TabId;
  onTab: (t: TabId) => void;
  onStart: (drill?: PartId) => void;
  onOpenResult: (id: string) => void;
  onRefresh: () => Promise<Me | undefined>;
  onShowIntro: () => void;
  onOpenLibrary: () => void;
}

const PARTS: PartId[] = ['1.1', '1.2', '2', '3'];

/** The app's main screen: four tabs with a bottom bar, like a normal phone app. */
export function Tabs(props: Props) {
  const { t } = useI18n();
  const { tab, onTab } = props;
  const tabs: { id: TabId; icon: string; label: string }[] = [
    { id: 'practice', icon: micOutline, label: t('tabPractice') },
    { id: 'progress', icon: trendingUpOutline, label: t('tabProgress') },
    { id: 'friends', icon: peopleOutline, label: t('tabFriends') },
    { id: 'settings', icon: settingsOutline, label: t('tabSettings') },
  ];
  const title = tabs.find((x) => x.id === tab)!.label;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{tab === 'practice' ? 'Speaking Mock' : title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {tab === 'practice' && <PracticeTab {...props} />}
        {tab === 'progress' && <ProgressTab {...props} />}
        {tab === 'friends' && <FriendsTab {...props} />}
        {tab === 'settings' && <SettingsTab {...props} />}
      </IonContent>
      <IonFooter className="tabbar">
        {tabs.map((x) => (
          <button key={x.id} className={x.id === tab ? 'on' : ''} onClick={() => onTab(x.id)} data-testid={`tab-${x.id}`}>
            <IonIcon icon={x.icon} />
            <span>{x.label}</span>
          </button>
        ))}
      </IonFooter>
    </IonPage>
  );
}

// ---------------------------------------------------------------- Practice
function PracticeTab({ me, onStart, onTab, onOpenLibrary }: Props) {
  const { t } = useI18n();
  const a = me.active;
  const canStart = !!a || me.user.attempts > 0;

  return (
    <>
      <div className="ion-padding-horizontal greeting">
        <h2>{t('hello', { name: me.user.firstName || '👋' })}</h2>
        <p className="hint">{t('helloSub')}</p>
      </div>

      <IonCard className="hero-card">
        <IonCardContent>
          <div className="hero-top">
            <div>
              <div className="hero-title">🎤 {t('fullTest')}</div>
              <div className="hint">{t('fullTestSub')}</div>
            </div>
            <div className="tests-left">
              <div className="attempts-num" data-testid="attempts">{me.user.attempts}</div>
              <div className="hint">{t('testsLeft')}</div>
            </div>
          </div>
          {a && (
            <p className="notice">
              {t('unfinished', { what: t(a.kind === 'drill' ? 'unfinishedPart' : 'unfinishedTest'), done: a.answered.length, total: a.total })}
            </p>
          )}
          <IonButton expand="block" size="large" disabled={!canStart} onClick={() => onStart()} data-testid="start">
            <IonIcon slot="start" icon={playOutline} />
            {a ? (a.status === 'grading' ? t('seeResult') : t('continueTest')) : t('startTest')}
          </IonButton>
          {!canStart && (
            <>
              <p className="hint ion-text-center">{t('noTestsLeft')}</p>
              <IonButton expand="block" fill="outline" onClick={() => onTab('friends')}>
                <IonIcon slot="start" icon={peopleOutline} /> {t('inviteForTest')}
              </IonButton>
            </>
          )}
        </IonCardContent>
      </IonCard>

      <IonCard>
        <IonCardHeader>
          <IonCardTitle>🎯 {t('practiseOne')}</IonCardTitle>
          <IonCardSubtitle>{t('practiseOneSub', { left: me.drills.left, per: me.drills.perDay })}</IonCardSubtitle>
        </IonCardHeader>
        <IonList lines="full" className="part-list">
          {PARTS.map((p) => (
            <IonItem
              key={p}
              button
              detail
              disabled={!!a || me.drills.left < 1}
              onClick={() => onStart(p)}
              data-testid={`drill-${p}`}
            >
              <IonLabel className="ion-text-wrap">
                <h3>{t('part', { p })} · {t(PART_NAME[p])}</h3>
                <p>{t(PART_INFO[p])}</p>
              </IonLabel>
            </IonItem>
          ))}
        </IonList>
        {(a || me.drills.left < 1) && (
          <IonCardContent>
            <p className="hint">{a ? t('finishOpenFirst') : t('practiseNoneLeft')}</p>
          </IonCardContent>
        )}
      </IonCard>

      <IonCard button onClick={onOpenLibrary} data-testid="open-library">
        <IonCardHeader>
          <IonCardTitle>{t('library')}</IonCardTitle>
          <IonCardSubtitle>{t('librarySub')}</IonCardSubtitle>
        </IonCardHeader>
        <IonCardContent>
          <IonButton expand="block" fill="outline">
            <IonIcon slot="start" icon={bookOutline} />
            {t('libraryAll')}
          </IonButton>
        </IonCardContent>
      </IonCard>

      <div className="ion-padding">
        <IonButton fill="clear" expand="block" size="small" onClick={() => openTelegramLink(`https://t.me/${me.botUsername}?start=voice`)}>
          <IonIcon slot="start" icon={chatbubbleEllipsesOutline} />
          <span className="ion-text-wrap">{t('answerInChat')}</span>
        </IonButton>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Progress
function ProgressTab({ me, onOpenResult }: Props) {
  const { t } = useI18n();
  const board = me.leaderboard;
  return (
    <>
      <ProgressCard history={me.history.filter((h) => h.kind !== 'drill')} />

      {me.history.length > 0 && (
        <IonCard>
          <IonCardHeader>
            <IonCardTitle>🗂 {t('myResults')}</IonCardTitle>
          </IonCardHeader>
          <IonList>
            {me.history.map((h) => (
              <IonItem key={h.id} button detail onClick={() => onOpenResult(h.id)}>
                <IonLabel>
                  <h3>{h.kind === 'drill' && h.drillPart ? `${t('part', { p: h.drillPart })} · ${t(PART_NAME[h.drillPart])}` : t('fullTest')}</h3>
                  <p>{new Date(h.date * 1000).toLocaleDateString()}</p>
                </IonLabel>
                <IonNote slot="end">
                  <b>{h.score}</b>/75 <IonBadge color={levelColor(h.level)}>{levelLabel(t, h.level)}</IonBadge>
                </IonNote>
              </IonItem>
            ))}
          </IonList>
        </IonCard>
      )}

      <IonCard>
        <IonCardHeader>
          <IonCardTitle>🏆 {t('topWeek')}</IonCardTitle>
          <IonCardSubtitle>{board.mine ? t('myRank', { rank: board.mine.rank, score: board.mine.score }) : t('joinBoard')}</IonCardSubtitle>
        </IonCardHeader>
        {board.top.length === 0 ? (
          <IonCardContent>
            <p className="hint">{t('boardEmpty')}</p>
          </IonCardContent>
        ) : (
          <IonList lines="none">
            {board.top.map((x) => (
              <IonItem key={x.rank} className={x.me ? 'board-me' : ''}>
                <span slot="start" className="board-rank">{['🥇', '🥈', '🥉'][x.rank - 1] ?? x.rank}</span>
                <IonLabel>
                  {x.name}
                  {x.me ? ` (${t('you')})` : ''}
                </IonLabel>
                <IonNote slot="end">
                  <b>{x.score}</b>/75 <IonBadge color={levelColor(x.level)}>{levelLabel(t, x.level)}</IonBadge>
                </IonNote>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonCard>
    </>
  );
}

// ---------------------------------------------------------------- Friends
function FriendsTab({ me, onRefresh }: Props) {
  const { t } = useI18n();
  const [toast] = useIonToast();
  const [buying, setBuying] = useState<string | null>(null);
  const r = me.referral;

  const share = () =>
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent(t('inviteShareText'))}`);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.link);
      haptic('success');
      toast({ message: t('copied'), duration: 1500, position: 'top' });
    } catch {
      toast({ message: r.link, duration: 4000, position: 'top' });
    }
  };

  // Stars purchase: the credit arrives via the bot's successful_payment update, so check a few times.
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
          await new Promise((res) => setTimeout(res, 1500));
        }
        setBuying(null);
        toast({ message: t('thanksPaid'), duration: 2500, position: 'top', color: 'success' });
      });
    } catch (e) {
      setBuying(null);
      toast({ message: errorText(t, e), duration: 3000, position: 'top', color: 'danger' });
    }
  };

  return (
    <>
      <IonCard>
        <IonCardHeader>
          <IonCardTitle>🎁 {t('inviteTitle')}</IonCardTitle>
          <IonCardSubtitle>{t('inviteText', { n: r.per })}</IonCardSubtitle>
        </IonCardHeader>
        <IonCardContent>
          <div className="dots">
            {Array.from({ length: r.per }, (_, i) => (
              <div key={i} className={`dot ${i < r.progress ? 'on' : ''}`} />
            ))}
          </div>
          <p className="hint">{t('inviteProgress', { p: r.progress, n: r.per })}</p>
          {r.qualified > 0 && <p className="hint">{t('inviteTotal', { n: r.qualified })}</p>}
          <IonButton expand="block" size="large" onClick={share} data-testid="invite-share">
            <IonIcon slot="start" icon={shareSocialOutline} /> {t('share')}
          </IonButton>
          <IonButton expand="block" fill="outline" onClick={copy}>
            <IonIcon slot="start" icon={copyOutline} /> {t('copy')}
          </IonButton>
        </IonCardContent>
      </IonCard>

      {me.shop && (
        <IonCard>
          <IonCardHeader>
            <IonCardTitle>⭐ {t('buyTitle')}</IonCardTitle>
            <IonCardSubtitle>{t('buySub')}</IonCardSubtitle>
          </IonCardHeader>
          <IonList lines="none">
            {me.shop.map((p) => (
              <IonItem key={p.id}>
                <IonLabel>{p.attempts === 1 ? t('test1') : t('tests', { n: p.attempts })}</IonLabel>
                <IonButton slot="end" fill="outline" disabled={!!buying} onClick={() => buy(p.id)} data-testid={`buy-${p.id}`}>
                  <IonIcon slot="start" icon={starOutline} />
                  {buying === p.id ? '…' : p.stars}
                </IonButton>
              </IonItem>
            ))}
          </IonList>
        </IonCard>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Settings
function SettingsTab({ me, onShowIntro }: Props) {
  const { t, lang, setLang } = useI18n();
  const [toast] = useIonToast();
  return (
    <>
      <IonCard>
        <IonCardHeader>
          <IonCardTitle>🌐 {t('language')}</IonCardTitle>
          <IonCardSubtitle>{t('languageSub')}</IonCardSubtitle>
        </IonCardHeader>
        <IonCardContent>
          <IonSegment
            value={lang}
            data-testid="lang"
            onIonChange={(e) => {
              setLang(e.detail.value as Lang);
              toast({ message: '✓', duration: 800, position: 'top' });
            }}
          >
            {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
              <IonSegmentButton key={l} value={l}>
                <IonLabel>{LANG_NAMES[l]}</IonLabel>
              </IonSegmentButton>
            ))}
          </IonSegment>
        </IonCardContent>
      </IonCard>

      <IonCard>
        <IonCardHeader>
          <IonCardTitle>📚 {t('examFormat')}</IonCardTitle>
        </IonCardHeader>
        <IonList lines="full">
          {PARTS.map((p) => (
            <IonItem key={p}>
              <IonLabel className="ion-text-wrap">
                <h3>{t('part', { p })} · {t(PART_NAME[p])}</h3>
                <p>{t(PART_INFO[p])}</p>
              </IonLabel>
            </IonItem>
          ))}
        </IonList>
      </IonCard>

      <IonCard>
        <IonList lines="full">
          <IonItem button detail onClick={() => openTelegramLink(`https://t.me/${me.botUsername}`)}>
            <IonIcon slot="start" icon={chatbubbleEllipsesOutline} />
            <IonLabel className="ion-text-wrap">
              <h3>{t('help')}</h3>
              <p>{t('helpText')} · ID: {me.user.id}</p>
            </IonLabel>
          </IonItem>
          <IonItem button detail onClick={onShowIntro}>
            <IonIcon slot="start" icon={helpCircleOutline} />
            <IonLabel>{t('showIntro')}</IonLabel>
          </IonItem>
        </IonList>
      </IonCard>
    </>
  );
}
