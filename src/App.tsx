import { useCallback, useEffect, useState } from 'react';
import { IonApp, useIonAlert } from '@ionic/react';
import { api, ApiError } from './api';
import { tg } from './telegram';
import type { Me, MockResult, StartResponse } from './types';
import { Exam } from './screens/Exam';
import { Gate } from './screens/Gate';
import { Grading } from './screens/Grading';
import { Home } from './screens/Home';
import { Ready } from './screens/Ready';
import { Result } from './screens/Result';
import { Vocab } from './screens/Vocab';
import { Message } from './screens/Message';

type Screen =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'gate' }
  | { name: 'home' }
  | { name: 'ready' }
  | { name: 'exam'; start: StartResponse; stream: MediaStream; startIndex: number }
  | { name: 'grading'; sessionId: string }
  | { name: 'result'; result: MockResult }
  | { name: 'vocab' };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [me, setMe] = useState<Me | null>(null);
  const [alert] = useIonAlert();

  const showError = useCallback((e: unknown) => alert({ header: 'Oops', message: e instanceof Error ? e.message : String(e), buttons: ['OK'] }), [alert]);

  const loadHome = useCallback(async () => {
    setScreen({ name: 'loading' });
    try {
      const data = await api.me();
      setMe(data);
      if (!data.isMember) return setScreen({ name: 'gate' });
      const m = /result=([0-9a-f]{32})/.exec(location.hash);
      if (m) {
        history.replaceState(null, '', location.pathname + location.search);
        const r = await api.result(m[1]);
        return setScreen({ name: 'result', result: r.result });
      }
      setScreen({ name: 'home' });
    } catch (e) {
      setScreen({ name: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  // Telegram's native back button on secondary screens.
  useEffect(() => {
    if (!tg) return;
    const back = ['result', 'vocab', 'ready'].includes(screen.name);
    const onBack = () => setScreen({ name: 'home' });
    if (back) {
      tg.BackButton.show();
      tg.BackButton.onClick(onBack);
    } else tg.BackButton.hide();
    return () => tg?.BackButton.offClick(onBack);
  }, [screen.name]);

  const refreshMe = () =>
    api.me().then((m) => {
      setMe(m);
      return m;
    }).catch(() => undefined);

  const begin = async (stream: MediaStream) => {
    setScreen({ name: 'loading' });
    try {
      const start = await api.startMock();
      const answered = new Set(start.answered);
      const startIndex = start.test.steps.findIndex((s) => !answered.has(s.key));
      if (startIndex === -1 || start.expired) {
        stream.getTracks().forEach((t) => t.stop());
        return setScreen({ name: 'grading', sessionId: start.session.id });
      }
      tg?.enableClosingConfirmation?.();
      setScreen({ name: 'exam', start, stream, startIndex });
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      if (e instanceof ApiError && e.code === 'NOT_MEMBER') return setScreen({ name: 'gate' });
      showError(e);
      loadHome();
    }
  };

  const onStart = () => {
    if (me?.active?.status === 'grading') setScreen({ name: 'grading', sessionId: me.active.id });
    else setScreen({ name: 'ready' });
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

  const content = (() => {
    switch (screen.name) {
      case 'loading':
        return <Message spinner text="Loading…" />;
      case 'error':
        return <Message emoji="⚠️" text={screen.message} action="Try again" onAction={loadHome} />;
      case 'gate':
        return <Gate channelUrl={me?.channelUrl ?? ''} onCheck={loadHome} />;
      case 'home':
        return me && <Home me={me} onStart={onStart} onOpenResult={openResult} onVocab={() => setScreen({ name: 'vocab' })} onRefresh={refreshMe} />;
      case 'ready':
        return <Ready resuming={!!me?.active} botUsername={me?.botUsername ?? ''} onBegin={begin} onBack={() => setScreen({ name: 'home' })} />;
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
        return <Result result={screen.result} onHome={() => setScreen({ name: 'home' })} />;
      case 'vocab':
        return <Vocab onBack={() => setScreen({ name: 'home' })} />;
    }
  })();

  return <IonApp>{content}</IonApp>;
}
