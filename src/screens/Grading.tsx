import { useEffect, useRef, useState } from 'react';
import { IonContent, IonPage, IonSpinner } from '@ionic/react';
import { api, ApiError } from '../api';
import { uploads } from '../audio';
import { haptic } from '../telegram';
import { useI18n } from '../i18n';
import type { MockResult } from '../types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Grading({ sessionId, onResult, onError }: { sessionId: string; onResult: (r: MockResult) => void; onError: (e: unknown) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(t('gradingSaving'));
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      await uploads.drain();
      setText(t('gradingText'));
      // Parts are usually graded already in the background; BUSY means one is still running.
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const { result } = await api.finish(sessionId);
          haptic('success');
          return onResult(result);
        } catch (e) {
          if (!(e instanceof ApiError && e.code === 'BUSY')) return onError(e);
          if (attempt === 10) setText(t('gradingSlow'));
          await sleep(3000);
        }
      }
      onError(new ApiError(t('gradingSlow'), 'BUSY'));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div className="center-page">
          <IonSpinner name="crescent" />
          <h2>{t('gradingTitle')}</h2>
          <p className="hint">{text}</p>
        </div>
      </IonContent>
    </IonPage>
  );
}
