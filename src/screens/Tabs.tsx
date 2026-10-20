import { useState } from 'react';
import {
  IonButton, IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonSegment, IonSegmentButton,
  IonTitle, IonToolbar, useIonToast,
} from '@ionic/react';
import {
  bookOutline, chatbubbleEllipsesOutline, copyOutline, helpCircleOutline, micOutline, peopleOutline, playOutline,
  settingsOutline, shareSocialOutline, star, trendingUpOutline,
} from 'ionicons/icons';
import { api } from '../api';
import { errorText, LANG_NAMES, PART_INFO, PART_NAME, useI18n, type Lang, type T } from '../i18n';
import { haptic, openTelegramLink, tg } from '../telegram';
import type { Me, PartId } from '../types';
import { BandScale, LevelBadge, Section } from '../ui';
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
          <button key={x.id} className={x.id === tab ? 'on' : ''} onClick={() => onTab(x.id)} data-testid={`tab-${x.id}`} aria-current={x.id === tab ? 'page' : undefined}>
            <IonIcon icon={x.icon} aria-hidden="true" />
            <span>{x.label}</span>
          </button>
        ))}
      </IonFooter>
    </IonPage>
  );
}

/** Part tag + name + what happens: the same row on Practice and Settings. */
function PartRow({ p, onClick, disabled }: { p: PartId; onClick?: () => void; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <IonItem button={!!onClick} detail={!!onClick} disabled={disabled} onClick={onClick} data-testid={onClick ? `drill-${p}` : undefined}>
      <span slot="start" className="part-tag">{p}</span>
      <IonLabel className="ion-text-wrap">
        <h3>{t(PART_NAME[p])}</h3>
        <p>{t(PART_INFO[p])}</p>
      </IonLabel>
    </IonItem>
  );
}

// ---------------------------------------------------------------- Practice
function PracticeTab({ me, onStart, onTab, onOpenLibrary }: Props) {
  const { t } = useI18n();
  const a = me.active;
  const canStart = !!a || me.user.attempts > 0;
  const last = me.history.find((h) => h.kind !== 'drill');
  const drillsBlocked = !!a || me.drills.left < 1;

  return (
    <>
      <div className="greeting">
        <h1>{t('hello', { name: me.user.firstName || '👋' })}</h1>
        <p className="hint">{t('helloSub')}</p>
      </div>

      <Section>
        <div className="hero">
          <div className="row-between">
            <div>
              <h2 className="hero-title">{t('fullTest')}</h2>
              <p className="hint">{t('fullTestSub')}</p>
            </div>
            <div className="tests-left">
              <b data-testid="attempts">{me.user.attempts}</b>
              <span>{t('testsLeft')}</span>
            </div>
          </div>
          {last && !a && (
            <div className="last-score">
              <div className="row-between">
                <span>{t('lastTest')}</span>
                <span>
                  <b>{last.score}</b>/75 <LevelBadge level={last.level} />
                </span>
              </div>
              <BandScale score={last.score} />
            </div>
          )}
          {a && (
            <p className="notice">
              {t('unfinished', { what: t(a.kind === 'drill' ? 'unfinishedPart' : 'unfinishedTest'), done: a.answered.length, total: a.total })}
            </p>
          )}
          {canStart ? (
            <IonButton expand="block" size="large" onClick={() => onStart()} data-testid="start">
              <IonIcon slot="start" icon={playOutline} />
              {a ? (a.status === 'grading' ? t('seeResult') : t('continueTest')) : t('startTest')}
            </IonButton>
          ) : (
            <>
              <p className="notice">{t('noTestsLeft')}</p>
              <IonButton expand="block" size="large" onClick={() => onTab('friends')} data-testid="invite-for-test">
                <IonIcon slot="start" icon={peopleOutline} /> {t('inviteForTest')}
              </IonButton>
            </>
          )}
        </div>
      </Section>

      <Section
        title={t('practiseOne')}
        note={drillsBlocked ? (a ? t('finishOpenFirst') : t('practiseNoneLeft')) : t('practiseOneSub', { left: me.drills.left, per: me.drills.perDay })}
      >
        <IonList>
          {PARTS.map((p) => (
            <PartRow key={p} p={p} disabled={drillsBlocked} onClick={() => onStart(p)} />
          ))}
        </IonList>
      </Section>

      <Section title={t('moreWays')}>
        <IonList>
          <IonItem button detail onClick={onOpenLibrary} data-testid="open-library">
            <IonIcon slot="start" icon={bookOutline} />
            <IonLabel className="ion-text-wrap">
              <h3>{t('library')}</h3>
              <p>{t('librarySub')}</p>
            </IonLabel>
          </IonItem>
          <IonItem button detail onClick={() => openTelegramLink(`https://t.me/${me.botUsername}?start=voice`)}>
            <IonIcon slot="start" icon={chatbubbleEllipsesOutline} />
            <IonLabel className="ion-text-wrap">
              <h3>{t('chatTest')}</h3>
              <p>{t('chatTestSub')}</p>
            </IonLabel>
          </IonItem>
        </IonList>
      </Section>
    </>
  );
}

const resultTitle = (t: T, h: Me['history'][number]) =>
  h.kind === 'drill' && h.drillPart ? `${t('part', { p: h.drillPart })}: ${t(PART_NAME[h.drillPart])}` : t('fullTest');

// ---------------------------------------------------------------- Progress
function ProgressTab({ me, onOpenResult }: Props) {
  const { t } = useI18n();
  const board = me.leaderboard;
  return (
    <>
      <ProgressCard history={me.history.filter((h) => h.kind !== 'drill')} />

      {me.history.length > 0 && (
        <Section title={t('myResults')}>
          <IonList>
            {me.history.map((h) => (
              <IonItem key={h.id} button detail onClick={() => onOpenResult(h.id)}>
                <IonLabel>
                  <h3>{resultTitle(t, h)}</h3>
                  <p>{new Date(h.date * 1000).toLocaleDateString()}</p>
                </IonLabel>
                <span slot="end" className="score-end">
                  <b>{h.score}</b>
                  <LevelBadge level={h.level} />
                </span>
              </IonItem>
            ))}
          </IonList>
        </Section>
      )}

      <Section title={t('topWeek')} note={board.mine ? t('myRank', { rank: board.mine.rank, score: board.mine.score }) : t('joinBoard')}>
        {board.top.length === 0 ? (
          <p className="pad hint" style={{ margin: 0 }}>{t('boardEmpty')}</p>
        ) : (
          <IonList>
            {board.top.map((x) => (
              <IonItem key={x.rank} className={x.me ? 'board-me' : ''}>
                <span slot="start" className="board-rank">{['🥇', '🥈', '🥉'][x.rank - 1] ?? x.rank}</span>
                <IonLabel>
                  {x.name}
                  {x.me ? ` (${t('you')})` : ''}
                </IonLabel>
                <span slot="end" className="score-end">
                  <b>{x.score}</b>
                  <LevelBadge level={x.level} />
                </span>
              </IonItem>
            ))}
          </IonList>
        )}
      </Section>
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
      <Section title={t('inviteTitle')} note={r.qualified > 0 ? t('inviteTotal', { n: r.qualified }) : undefined}>
        <div className="pad stack">
          <p className="body-text">{t('inviteText', { n: r.per })}</p>
          <div>
            <div className="dots">
              {Array.from({ length: r.per }, (_, i) => (
                <div key={i} className={`dot ${i < r.progress ? 'on' : ''}`} />
              ))}
            </div>
            <p className="hint" style={{ margin: 0 }}>{t('inviteProgress', { p: r.progress, n: r.per })}</p>
          </div>
          <IonButton expand="block" size="large" onClick={share} data-testid="invite-share">
            <IonIcon slot="start" icon={shareSocialOutline} /> {t('share')}
          </IonButton>
          <IonButton expand="block" fill="outline" onClick={copy}>
            <IonIcon slot="start" icon={copyOutline} /> {t('copy')}
          </IonButton>
        </div>
      </Section>

      {me.shop && (
        <Section title={t('buyTitle')} note={t('buySub')}>
          <IonList>
            {me.shop.map((p) => (
              <IonItem key={p.id}>
                <IonLabel>{p.attempts === 1 ? t('test1') : t('tests', { n: p.attempts })}</IonLabel>
                <IonButton slot="end" fill="outline" disabled={!!buying} onClick={() => buy(p.id)} data-testid={`buy-${p.id}`}>
                  <IonIcon slot="start" icon={star} />
                  {buying === p.id ? '…' : p.stars}
                </IonButton>
              </IonItem>
            ))}
          </IonList>
        </Section>
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
      <Section title={t('language')} note={t('languageSub')}>
        <div className="pad">
          <IonSegment
            value={lang}
            data-testid="lang"
            onIonChange={(e) => {
              setLang(e.detail.value as Lang);
              toast({ message: t('langSaved'), duration: 1000, position: 'top' });
            }}
          >
            {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
              <IonSegmentButton key={l} value={l}>
                <IonLabel>{LANG_NAMES[l]}</IonLabel>
              </IonSegmentButton>
            ))}
          </IonSegment>
        </div>
      </Section>

      <Section title={t('examFormat')}>
        <IonList>
          {PARTS.map((p) => (
            <PartRow key={p} p={p} />
          ))}
        </IonList>
      </Section>

      <Section note={`ID: ${me.user.id}`}>
        <IonList>
          <IonItem button detail onClick={() => openTelegramLink(`https://t.me/${me.botUsername}`)}>
            <IonIcon slot="start" icon={chatbubbleEllipsesOutline} />
            <IonLabel className="ion-text-wrap">
              <h3>{t('help')}</h3>
              <p>{t('helpText')}</p>
            </IonLabel>
          </IonItem>
          <IonItem button detail onClick={onShowIntro}>
            <IonIcon slot="start" icon={helpCircleOutline} />
            <IonLabel>{t('showIntro')}</IonLabel>
          </IonItem>
        </IonList>
      </Section>
    </>
  );
}
