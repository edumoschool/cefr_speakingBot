import { useEffect, useRef, useState } from 'react';
import { IonContent, IonPage, IonSpinner } from '@ionic/react';
import { api, ApiError } from '../api';
import { uploads } from '../audio';
import { haptic } from '../telegram';
import type { MockResult } from '../types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Grading({ sessionId, onResult, onError }: { sessionId: string; onResult: (r: MockResult) => void; onError: (e: unknown) => void }) {
  const [text, setText] = useState('Saving your last answers…');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      await uploads.drain();
      setText('Our AI examiner is checking fluency, vocabulary, grammar, pronunciation and task response…');
      // Parts are usually graded already in the background; BUSY means one is still running.
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const { result } = await api.finish(sessionId);
          haptic('success');
          return onResult(result);
        } catch (e) {
          if (!(e instanceof ApiError && e.code === 'BUSY')) return onError(e);
          await sleep(3000);
        }
      }
      onError(new Error('Assessment is taking longer than usual. Please check your result in a minute.'));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div className="center-page">
          <IonSpinner name="crescent" />
          <h2>Assessing your speaking…</h2>
          <p className="hint">{text}</p>
        </div>
      </IonContent>
    </IonPage>
  );
}
