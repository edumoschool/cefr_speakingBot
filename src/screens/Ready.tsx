import { useEffect, useRef, useState } from 'react';
import { IonButton, IonContent, IonFooter, IonIcon, IonItem, IonLabel, IonList, IonPage, IonToggle } from '@ionic/react';
import { checkmarkCircle, chatbubbleEllipsesOutline, micOutline, phonePortraitOutline, volumeMediumOutline } from 'ionicons/icons';
import { startRecording, unlockAudio } from '../audio';
import { PART_NAME, useI18n } from '../i18n';
import { openTelegramLink, tg } from '../telegram';

const PREF = 'readAloud';
const readPref = () => {
  try {
    return localStorage.getItem(PREF) !== '0';
  } catch {
    return true;
  }
};

export const prefs = { readAloud: readPref() };

type Mic = 'idle' | 'recording' | 'playing' | 'ok' | 'blocked';

interface Props {
  resuming: boolean;
  drill?: string;
  botUsername: string;
  onBegin: (s: MediaStream) => void;
  onBack: () => void;
}

/** Tips, a microphone check with playback, then start. */
export function Ready({ resuming, drill, botUsername, onBegin, onBack }: Props) {
  const { t } = useI18n();
  const [readAloud, setReadAloud] = useState(prefs.readAloud);
  const [mic, setMic] = useState<Mic>('idle');
  const [count, setCount] = useState(3);
  const [level, setLevel] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const started = useRef(false);

  // Release the microphone if the user leaves without starting.
  useEffect(() => () => {
    if (!started.current) stream.current?.getTracks().forEach((tr) => tr.stop());
  }, []);

  const getStream = async () => {
    if (stream.current) return stream.current;
    stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    return stream.current;
  };

  const checkMic = async () => {
    let s: MediaStream;
    try {
      s = await getStream();
    } catch {
      return setMic('blocked');
    }
    setMic('recording');
    const stopMeter = meter(s, setLevel);
    const rec = startRecording(s);
    for (let i = 3; i > 0; i--) {
      setCount(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    stopMeter();
    const blob = await rec.stop();
    setMic('playing');
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
    setMic('ok');
  };

  const begin = async () => {
    prefs.readAloud = readAloud;
    try {
      localStorage.setItem(PREF, readAloud ? '1' : '0');
    } catch {}
    if (readAloud) unlockAudio(); // must happen inside this tap
    try {
      const s = await getStream();
      started.current = true;
      onBegin(s);
    } catch {
      setMic('blocked');
    }
  };

  const voiceInChat = () => {
    openTelegramLink(`https://t.me/${botUsername}?start=voice`);
    setTimeout(() => tg?.close?.(), 300);
  };

  const title = resuming ? t('readyResume') : drill ? t('readyPart', { name: t(PART_NAME[drill]) }) : t('readyTitle');

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <h1>{title}</h1>
        <IonList lines="none" className="tips">
          <IonItem>
            <IonIcon slot="start" icon={volumeMediumOutline} color="primary" />
            <IonLabel className="ion-text-wrap">{t('tipQuiet')}</IonLabel>
          </IonItem>
          <IonItem>
            <IonIcon slot="start" icon={micOutline} color="primary" />
            <IonLabel className="ion-text-wrap">{t('tipSpeak')}</IonLabel>
          </IonItem>
          <IonItem>
            <IonIcon slot="start" icon={phonePortraitOutline} color="primary" />
            <IonLabel className="ion-text-wrap">{t('tipStay')}</IonLabel>
          </IonItem>
        </IonList>

        <div className="surface">
        <div className="mic-box">
          {mic === 'idle' && (
            <IonButton expand="block" fill="outline" onClick={checkMic} data-testid="mic-check">
              <IonIcon slot="start" icon={micOutline} /> {t('micCheck')}
            </IonButton>
          )}
          {mic === 'recording' && (
            <>
              <p>{t('micChecking', { s: count })}</p>
              <div className="meter">
                <div style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
            </>
          )}
          {mic === 'playing' && <p>{t('micPlaying')}</p>}
          {mic === 'ok' && (
            <p className="ok-line">
              <IonIcon icon={checkmarkCircle} color="success" /> {t('micOk')}
            </p>
          )}
          {mic === 'blocked' && (
            <>
              <p className="err-line">{t('micBlocked')}</p>
              <IonButton expand="block" fill="outline" onClick={voiceInChat}>
                <IonIcon slot="start" icon={chatbubbleEllipsesOutline} /> {t('answerInChat')}
              </IonButton>
            </>
          )}
        </div>

        <IonList lines="none" className="surface-row">
          <IonItem>
            <IonIcon slot="start" icon={volumeMediumOutline} />
            <IonLabel className="ion-text-wrap">{t('readAloud')}</IonLabel>
            <IonToggle slot="end" checked={readAloud} onIonChange={(e) => setReadAloud(e.detail.checked)} aria-label={t('readAloud')} />
          </IonItem>
        </IonList>
        </div>
      </IonContent>
      <IonFooter className="ion-padding ion-no-border">
        <IonButton expand="block" size="large" onClick={begin} disabled={mic === 'recording' || mic === 'playing'} data-testid="begin">
          {t('begin')}
        </IonButton>
        <IonButton expand="block" fill="clear" onClick={onBack}>
          {t('back')}
        </IonButton>
      </IonFooter>
    </IonPage>
  );
}

/** Live input level (0..1) while checking the microphone. */
function meter(stream: MediaStream, onLevel: (v: number) => void) {
  let raf = 0;
  let ctx: AudioContext | null = null;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext!;
    ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      onLevel(Math.min(1, peak / 64));
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch {}
  return () => {
    cancelAnimationFrame(raf);
    ctx?.close().catch(() => undefined);
  };
}
