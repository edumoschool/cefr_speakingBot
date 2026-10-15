import { useEffect, useRef, useState } from 'react';
import { IonButton, IonContent, IonFooter, IonHeader, IonNote, IonPage, IonProgressBar, IonTitle, IonToolbar } from '@ionic/react';
import { beep, speak, startRecording, stopSpeaking, uploads } from '../audio';
import { haptic } from '../telegram';
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
  const [phase, setPhase] = useState<'prep' | 'rec'>('prep');
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
        setPhase('prep');
        if (prefs.readAloud) speak(spoken(step));
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
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = steps[index];
  const secs = Math.ceil(left);
  const rec = phase === 'rec';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle data-testid="part-label">Part {step.part}</IonTitle>
          <IonNote slot="end" className="ion-padding-end">
            {index + 1} / {steps.length}
          </IonNote>
        </IonToolbar>
        <IonProgressBar value={index / steps.length} />
      </IonHeader>
      <IonContent className="ion-padding">
        <StepView step={step} />
        <div className={`timer ${rec ? 'rec' : ''}`}>
          <svg viewBox="0 0 120 120">
            <circle className="bg" cx="60" cy="60" r="52" />
            <circle className="fg" cx="60" cy="60" r="52" style={{ strokeDashoffset: 326.7 * (1 - left / total) }} />
          </svg>
          <div className="phase">{rec ? 'Speak now' : 'Preparation'}</div>
          <div className="time">
            {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
          </div>
        </div>
      </IonContent>
      <IonFooter className="ion-padding">
        <IonButton expand="block" color={rec ? 'danger' : 'primary'} onClick={() => skip.current?.()} data-testid="exam-next">
          {rec ? 'Finish answer' : 'Start speaking now'}
        </IonButton>
        <p className="hint ion-text-center" style={{ minHeight: 18, margin: '6px 0 0' }}>
          {pending > 0 ? 'Saving your answers in the background…' : ''}
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
            <b>FOR</b>
            <ul>{t.for.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div className="col against">
            <b>AGAINST</b>
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
