import { IonButton, IonContent, IonPage } from '@ionic/react';
import { openTelegramLink } from '../telegram';

export function Gate({ channelUrl, onCheck }: { channelUrl: string; onCheck: () => void }) {
  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div className="center-page">
          <div className="big-emoji">📢</div>
          <h1>Join our channel</h1>
          <p className="hint">The speaking mock is free for members of our Telegram channel. Join, then come back and tap “I’ve joined”.</p>
          <IonButton expand="block" onClick={() => openTelegramLink(channelUrl)} style={{ width: '100%' }}>
            Join the channel
          </IonButton>
          <IonButton expand="block" fill="outline" onClick={onCheck} style={{ width: '100%' }}>
            I’ve joined
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
}
