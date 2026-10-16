import { useCallback, useEffect, useMemo, useState } from 'react';
import { IonApp, useIonAlert } from '@ionic/react';
import { api, ApiError } from './api';
import { detectLang, errorText, I18n, makeT, type Lang } from './i18n';
import { tg } from './telegram';
import type { Me, MockResult, PartId, StartResponse } from './types';
import { Exam } from './screens/Exam';
import { Gate } from './screens/Gate';
import { Grading } from './screens/Grading';
import { Library } from './screens/Library';
import { Message } from './screens/Message';
import { Onboarding, onboardingSeen } from './screens/Onboarding';
import { Ready } from './screens/Ready';
import { Result } from './screens/Result';
import { Tabs, type TabId } from './screens/Tabs';

type Screen =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'onboarding' }
  | { name: 'gate' }
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'ready'; drill?: PartId }
  | { name: 'exam'; start: StartResponse; stream: MediaStream; startIndex: number }
  | { name: 'grading'; sessionId: string }
  | { name: 'result'; result: MockResult };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [tab, setTab] = useState<TabId>('practice');
  const [me, setMe] = useState<Me | null>(null);
  const [lang, setLangState] = useState<Lang>(detectLang());
  const t = useMemo(() => makeT(lang), [lang]);
  const [alert] = useIonAlert();

  const showError = useCallback(
    (e: unknown) => alert({ header: t('errTitle'), message: errorText(t, e), buttons: [t('ok')] }),
    [alert, t],
  );

  // Language is one setting for the app and the examiner's feedback; it's saved on the server.
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    api.setPrefs(l).catch(() => undefined);
  }, []);

  const loadHome = useCallback(async () => {
    setScreen({ name: 'loading' });
    try {
      const data = await api.me();
      setMe(data);
      setLangState(data.feedbackLang);
      if (!onboardingSeen()) return setScreen({ name: 'onboarding' });
      if (!data.isMember) return setScreen({ name: 'gate' });
      // Opened from the bot's "Questions & sample answers" button.
      if (location.hash === '#library') {
        history.replaceState(null, '', location.pathname + location.search);
        return setScreen({ name: 'library' });
      }
      const m = /result=([0-9a-f]{32})/.exec(location.hash);
      if (m) {
        history.replaceState(null, '', location.pathname + location.search);
        const r = await api.result(m[1]);
        return setScreen({ name: 'result', result: r.result });
      }
      setScreen({ name: 'home' });
    } catch (e) {
      setScreen({ name: 'error', message: errorText(makeT(detectLang()), e) });
    }
  }, []);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  // Telegram's own back button on secondary screens.
  useEffect(() => {
    if (!tg) return;
    const back = ['result', 'ready', 'library'].includes(screen.name);
    const onBack = () => setScreen({ name: 'home' });
    if (back) {
      tg.BackButton.show();
      tg.BackButton.onClick(onBack);
    } else tg.BackButton.hide();
    return () => tg?.BackButton.offClick(onBack);
  }, [screen.name]);

  const refreshMe = () =>
    api
      .me()
      .then((m) => {
        setMe(m);
        return m;
      })
      .catch(() => undefined);

  const begin = async (stream: MediaStream, drill?: PartId) => {
    setScreen({ name: 'loading' });
    try {
      // An open test or practice is resumed by either call.
      const start = drill && !me?.active ? await api.startDrill(drill) : await api.startMock();
      const answered = new Set(start.answered);
      const startIndex = start.test.steps.findIndex((s) => !answered.has(s.key));
      if (startIndex === -1 || start.expired) {
        stream.getTracks().forEach((tr) => tr.stop());
        return setScreen({ name: 'grading', sessionId: start.session.id });
      }
      tg?.enableClosingConfirmation?.();
      setScreen({ name: 'exam', start, stream, startIndex });
    } catch (e) {
      stream.getTracks().forEach((tr) => tr.stop());
      if (e instanceof ApiError && e.code === 'NOT_MEMBER') return setScreen({ name: 'gate' });
      showError(e);
      loadHome();
    }
  };

  const onStart = (drill?: PartId) => {
    if (me?.active?.status === 'grading') setScreen({ name: 'grading', sessionId: me.active.id });
    else setScreen({ name: 'ready', drill: me?.active ? undefined : drill });
  };

  const openResult = async (id: string) => {
    setScreen({ name: 'loading' });
    try {
      setScreen({ name: 'result', result: (await api.result(id)).result });
    } catch (e) {
      showError(e);
      setScreen({ name: 'home' });
    }
  };

  const goHome = (to: TabId = tab) => {
    setTab(to);
    setScreen({ name: 'home' });
  };

  const content = (() => {
    switch (screen.name) {
      case 'loading':
        return <Message spinner text={t('loading')} />;
      case 'error':
        return <Message emoji="⚠️" text={screen.message} action={t('tryAgain')} onAction={loadHome} />;
      case 'onboarding':
        return <Onboarding referralsPer={me?.referral.per ?? 3} onDone={() => (me && !me.isMember ? setScreen({ name: 'gate' }) : goHome('practice'))} />;
      case 'gate':
        return <Gate channelUrl={me?.channelUrl ?? ''} onCheck={loadHome} />;
      case 'home':
        return (
          me && (
            <Tabs
              me={me}
              tab={tab}
              onTab={setTab}
              onStart={onStart}
              onOpenResult={openResult}
              onRefresh={refreshMe}
              onShowIntro={() => setScreen({ name: 'onboarding' })}
              onOpenLibrary={() => setScreen({ name: 'library' })}
            />
          )
        );
      case 'library':
        return <Library onBack={() => goHome('practice')} onNotMember={() => setScreen({ name: 'gate' })} />;
      case 'ready':
        return (
          <Ready
            resuming={!!me?.active}
            drill={screen.drill}
            botUsername={me?.botUsername ?? ''}
            onBegin={(stream) => begin(stream, screen.drill)}
            onBack={() => goHome()}
          />
        );
      case 'exam':
        return (
          <Exam
            sessionId={screen.start.session.id}
            test={screen.start.test}
            stream={screen.stream}
            startIndex={screen.startIndex}
            onDone={() => setScreen({ name: 'grading', sessionId: screen.start.session.id })}
          />
        );
      case 'grading':
        return (
          <Grading
            sessionId={screen.sessionId}
            onResult={(result) => {
              tg?.disableClosingConfirmation?.();
              setScreen({ name: 'result', result });
              refreshMe();
            }}
            onError={(e) => {
              tg?.disableClosingConfirmation?.();
              showError(e);
              loadHome();
            }}
          />
        );
      case 'result':
        return <Result result={screen.result} shareLink={me?.referral.link} onHome={() => goHome()} />;
    }
  })();

  return (
    <I18n.Provider value={{ lang, t, setLang }}>
      <IonApp>{content}</IonApp>
    </I18n.Provider>
  );
}
