import { useState } from 'react';
import { IonButton, IonContent, IonItem, IonList, IonPage, IonToggle, useIonAlert } from '@ionic/react';

export const prefs = { readAloud: true };

export function Ready({ resuming, onBegin, onBack }: { resuming: boolean; onBegin: (s: MediaStream) => void; onBack: () => void }) {
  const [readAloud, setReadAloud] = useState(prefs.readAloud);
  const [alert] = useIonAlert();

  const begin = async () => {
    prefs.readAloud = readAloud;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      onBegin(stream);
    } catch {
      alert({ header: 'Microphone needed', message: 'Please allow microphone access to take the speaking test.', buttons: ['OK'] });
    }
  };

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div className="center-page">
          <div className="big-emoji">🎙️</div>
          <h1>{resuming ? 'Continue your mock' : 'Ready to start?'}</h1>
          <p className="hint">
            Find a quiet place. Each question has a short preparation time, then recording starts automatically with a beep. Speak until
            the timer ends, or tap “Finish answer”.
          </p>
          <IonList inset style={{ width: '100%' }}>
            <IonItem>
              <IonToggle checked={readAloud} onIonChange={(e) => setReadAloud(e.detail.checked)}>
                Read questions aloud
              </IonToggle>
            </IonItem>
          </IonList>
          <IonButton expand="block" style={{ width: '100%' }} onClick={begin} data-testid="begin">
            Allow microphone &amp; begin
          </IonButton>
          <IonButton fill="clear" onClick={onBack}>
            Back
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
}
