import { useState } from 'react';
import { IonButton, IonContent, IonItem, IonList, IonPage, IonToggle, useIonAlert } from '@ionic/react';
import { openTelegramLink, tg } from '../telegram';
import { unlockAudio } from '../audio';

export const prefs = { readAloud: true };

export function Ready({ resuming, drill, botUsername, onBegin, onBack }: { resuming: boolean; drill?: string; botUsername: string; onBegin: (s: MediaStream) => void; onBack: () => void }) {
  const [readAloud, setReadAloud] = useState(prefs.readAloud);
  const [alert] = useIonAlert();

  const begin = async () => {
    prefs.readAloud = readAloud;
    if (readAloud) unlockAudio(); // must happen inside this tap
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      onBegin(stream);
    } catch {
      alert({
        header: 'Microphone not available',
        message: 'Allow microphone access and try again — or take the mock in the bot chat by sending voice messages.',
        buttons: [{ text: 'Try again', role: 'cancel' }, { text: 'Use voice messages', handler: voiceInChat }],
      });
    }
  };

  // Same mock, answered with voice messages in the bot chat (tgcloud/lib/chatmode.js).
  const voiceInChat = () => {
    openTelegramLink(`https://t.me/${botUsername}?start=voice`);
    setTimeout(() => tg?.close?.(), 300);
  };

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div className="center-page">
          <div className="big-emoji">🎙️</div>
          <h1>{resuming ? 'Continue where you left off' : drill ? `Part ${drill} drill` : 'Ready to start?'}</h1>
          <p className="hint">
            Find a quiet place. The examiner reads each question, then you get a short preparation time and recording starts automatically with a beep. Speak until
            the timer ends, or tap “Finish answer”.
          </p>
          <IonList inset style={{ width: '100%' }}>
            <IonItem>
              <IonToggle checked={readAloud} onIonChange={(e) => setReadAloud(e.detail.checked)}>
                Examiner reads the questions aloud
              </IonToggle>
            </IonItem>
          </IonList>
          <IonButton expand="block" style={{ width: '100%' }} onClick={begin} data-testid="begin">
            Allow microphone &amp; begin
          </IonButton>
          <IonButton fill="clear" size="small" onClick={voiceInChat}>
            No microphone here? Answer with voice messages in chat
          </IonButton>
          <IonButton fill="clear" onClick={onBack}>
            Back
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
}
