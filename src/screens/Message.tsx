import { IonButton, IonContent, IonPage, IonSpinner } from '@ionic/react';

export function Message(props: { text: string; emoji?: string; spinner?: boolean; action?: string; onAction?: () => void }) {
  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div className="center-page">
          {props.spinner && <IonSpinner name="crescent" />}
          {props.emoji && <div className="big-emoji">{props.emoji}</div>}
          <p>{props.text}</p>
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
