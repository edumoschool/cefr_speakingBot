import { IonButton, IonContent, IonPage } from '@ionic/react';
import { useI18n } from '../i18n';
import { openTelegramLink } from '../telegram';

export function Gate({ channelUrl, onCheck }: { channelUrl: string; onCheck: () => void }) {
  const { t } = useI18n();
  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div className="center-page">
          <div className="big-emoji">📢</div>
          <h1>{t('gateTitle')}</h1>
          <p className="lead">{t('gateText')}</p>
          <IonButton expand="block" size="large" onClick={() => openTelegramLink(channelUrl)} style={{ width: '100%' }}>
            {t('gateJoin')}
          </IonButton>
          <IonButton expand="block" fill="outline" onClick={onCheck} style={{ width: '100%' }}>
            {t('gateJoined')}
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
}
