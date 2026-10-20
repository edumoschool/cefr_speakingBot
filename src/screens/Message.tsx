import { IonButton, IonContent, IonIcon, IonPage, IonSpinner } from '@ionic/react';
import { alertCircleOutline } from 'ionicons/icons';

export function Message(props: { text: string; error?: boolean; spinner?: boolean; action?: string; onAction?: () => void }) {
  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div className="center-page">
          {props.spinner && <IonSpinner name="crescent" />}
          {props.error && <IonIcon icon={alertCircleOutline} className="glyph bad" aria-hidden="true" />}
          <p className="lead">{props.text}</p>
          {props.action && (
            <IonButton expand="block" onClick={props.onAction}>
              {props.action}
            </IonButton>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
