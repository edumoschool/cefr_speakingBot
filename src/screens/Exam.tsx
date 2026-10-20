import { useEffect, useRef, useState } from 'react';
import { IonButton, IonContent, IonFooter, IonHeader, IonPage, IonProgressBar, IonTitle, IonToolbar } from '@ionic/react';
import { beep, playClip, speak, startRecording, stopClip, stopSpeaking, uploads } from '../audio';
import { haptic } from '../telegram';
import { PART_INFO, PART_NAME, useI18n } from '../i18n';
import type { Step, TestView } from '../types';
import { prefs } from './Ready';

interface Props {
  sessionId: string;
  test: TestView;
  stream: MediaStream;
  startIndex: number;
  onDone: () => void;
}

/** Runs the timed exam: preparation → beep → recording, step by step. */
export function Exam({ sessionId, test, stream, startIndex, onDone }: Props) {
  const steps = test.steps;
  const [index, setIndex] = useState(startIndex);
  const [phase, setPhase] = useState<'intro' | 'listen' | 'prep' | 'rec'>('intro');
  const { t } = useI18n();
  const [left, setLeft] = useState(steps[startIndex].prepSec);
  const [total, setTotal] = useState(steps[startIndex].prepSec);
  const [pending, setPending] = useState(0);
  const skip = useRef<(() => void) | null>(null);
  const started = useRef(false);

  useEffect(() => {
    uploads.onChange = () => setPending(uploads.pending);
    return () => {
      uploads.onChange = undefined;
    };
  }, []);

  useEffect(() => {
    if (started.current) return; // guard against double effects
    started.current = true;
    let cancelled = false;

    const countdown = (seconds: number) =>
      new Promise<void>((resolve) => {
        const end = performance.now() + seconds * 1000;
        setTotal(seconds);
        const timer = setInterval(tick, 200);
        function finish() {
          clearInterval(timer);
          skip.current = null;
          resolve();
        }
        function tick() {
          const l = Math.max(0, (end - performance.now()) / 1000);
          setLeft(l);
          if (l <= 0 || cancelled) finish();
        }
        skip.current = finish;
        tick();
      });

    (async () => {
      for (let i = startIndex; i < steps.length && !cancelled; i++) {
        const step = steps[i];
        setIndex(i);
        // A short explanation before each part; the student starts it when ready.
        if (i === startIndex || steps[i - 1].part !== step.part) {
          setPhase('intro');
          await new Promise<void>((resolve) => (skip.current = resolve));
          skip.current = null;
          if (cancelled) return;
        }
        // Like the real exam: the examiner reads the question, then preparation starts.
        if (prefs.readAloud && step.audio) {
          setPhase('listen');
          setLeft(step.prepSec);
          setTotal(step.prepSec);
          skip.current = stopClip;
          await playClip(step.audio);
          skip.current = null;
          if (cancelled) return;
        } else if (prefs.readAloud) speak(spoken(step));
        setPhase('prep');
        await countdown(step.prepSec);
        stopSpeaking();
        if (cancelled) return;

        beep();
        haptic('warning');
        setPhase('rec');
        const rec = startRecording(stream);
        await countdown(step.speakSec);
        const blob = await rec.stop();
        const lastOfPart = i === steps.length - 1 || steps[i + 1].part !== step.part;
        uploads.answer(sessionId, step, blob, lastOfPart);
      }
      if (!cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        onDone();
      }
    })();

    return () => {
      cancelled = true;
      skip.current?.();
      stopClip();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = steps[index];
  const secs = Math.ceil(left);
  const rec = phase === 'rec';
  const partTitle = `${t('part', { p: step.part })}: ${t(PART_NAME[step.part])}`;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle data-testid="part-label">{partTitle}</IonTitle>
        </IonToolbar>
        <IonProgressBar value={index / steps.length} />
      </IonHeader>
      <IonContent className="ion-padding">
        {phase === 'intro' ? (
          <div className="center-page part-intro">
            <div className="part-num">{step.part}</div>
            <h1>{t(PART_NAME[step.part])}</h1>
            <p className="lead">{t(PART_INFO[step.part])}</p>
          </div>
        ) : (
          <>
            <p className="hint q-counter">{t('qOf', { n: index + 1, total: steps.length })}</p>
            <StepView step={step} />
            <div className={`timer ${rec ? 'rec' : ''}`}>
              <svg viewBox="0 0 120 120">
                <circle className="bg" cx="60" cy="60" r="52" />
                <circle className="fg" cx="60" cy="60" r="52" style={{ strokeDashoffset: 326.7 * (1 - left / total) }} />
              </svg>
              <div className="phase">{rec ? t('speakNow') : phase === 'listen' ? t('listen') : t('prepare')}</div>
              <div className="time">
                {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
              </div>
            </div>
          </>
        )}
      </IonContent>
      <IonFooter className="ion-padding ion-no-border">
        <IonButton expand="block" size="large" color={rec ? 'danger' : 'primary'} onClick={() => skip.current?.()} data-testid="exam-next">
          {phase === 'intro' ? t('partReady') : rec ? t('finishAnswer') : phase === 'listen' ? t('skipListening') : t('startNow')}
        </IonButton>
        <p className="hint ion-text-center" style={{ minHeight: 18, margin: '6px 0 0' }}>
          {pending > 0 ? t('saving') : ''}
        </p>
      </IonFooter>
    </IonPage>
  );
}

function spoken(step: Step) {
  if (step.part === '2') return (step.bullets ?? []).join('. ');
  if (step.part === '3') return step.table?.statement ?? step.question;
  return step.question;
}

function StepView({ step }: { step: Step }) {
  const { t: tr } = useI18n();
  const pics = step.images?.length ? (
    <div className={`pics ${step.images.length === 1 ? 'one' : ''}`}>
      {step.images.map((src) => (
        <img key={src} src={src} alt="" />
      ))}
    </div>
  ) : null;

  if (step.part === '2') {
    return (
      <>
        {pics}
        <ul className="cue">
          {step.bullets?.map((b) => <li key={b}>{b}</li>)}
        </ul>
      </>
    );
  }
  if (step.part === '3' && step.table) {
    const t = step.table;
    return (
      <div className="debate">
        <h3>{t.statement}</h3>
        <div className="cols">
          <div className="col for">
            <b>{tr('for')}</b>
            <ul>{t.for.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div className="col against">
            <b>{tr('against')}</b>
            <ul>{t.against.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="question">{step.question}</div>
      {pics}
    </>
  );
}
