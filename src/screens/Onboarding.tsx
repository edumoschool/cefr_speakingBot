import { useState } from 'react';
import { IonButton, IonContent, IonFooter, IonIcon, IonLabel, IonPage, IonSegment, IonSegmentButton } from '@ionic/react';
import { giftOutline, micOutline, speedometerOutline } from 'ionicons/icons';
import { LANG_NAMES, useI18n, type Lang } from '../i18n';

const KEY = 'onboarded.v1';

export function onboardingSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true; // storage blocked: don't show the intro every time
  }
}

function markSeen() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {}
}

/** Three short slides for first-time users; the first one picks the language. */
export function Onboarding({ referralsPer, onDone }: { referralsPer: number; onDone: () => void }) {
  const { t, lang, setLang } = useI18n();
  const [i, setI] = useState(0);
  const slides = [
    { icon: micOutline, title: t('ob1Title'), text: t('ob1Text') },
    { icon: speedometerOutline, title: t('ob2Title'), text: t('ob2Text') },
    { icon: giftOutline, title: t('ob3Title'), text: t('ob3Text', { n: referralsPer }) },
  ];
  const s = slides[i];
  const last = i === slides.length - 1;

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div className="center-page onboarding">
          <IonIcon icon={s.icon} className="glyph" aria-hidden="true" />
          <h1>{s.title}</h1>
          <p className="lead">{s.text}</p>
          {i === 0 && (
            <div className="ob-lang">
              <p className="hint">{t('obChooseLang')}</p>
              <IonSegment value={lang} onIonChange={(e) => setLang(e.detail.value as Lang)} data-testid="ob-lang">
                {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
                  <IonSegmentButton key={l} value={l}>
                    <IonLabel>{LANG_NAMES[l]}</IonLabel>
                  </IonSegmentButton>
                ))}
              </IonSegment>
            </div>
          )}
          <div className="ob-dots">
            {slides.map((_, k) => (
              <span key={k} className={k === i ? 'on' : ''} />
            ))}
          </div>
        </div>
      </IonContent>
      <IonFooter className="ion-padding ion-no-border">
        <IonButton
          expand="block"
          size="large"
          data-testid="ob-next"
          onClick={() => {
            if (!last) return setI(i + 1);
            markSeen();
            onDone();
          }}
        >
          {last ? t('obStart') : t('next')}
        </IonButton>
      </IonFooter>
    </IonPage>
  );
}
