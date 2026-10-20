import { useEffect, useMemo, useState } from 'react';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
  IonPage, IonSearchbar, IonSegment, IonSegmentButton, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/react';
import { arrowBack, chevronBack, chevronForward, eyeOffOutline, eyeOutline, stopCircleOutline, volumeHighOutline } from 'ionicons/icons';
import { api } from '../api';
import { playClip, stopClip, unlockAudio } from '../audio';
import { errorText, PART_NAME, useI18n, type T } from '../i18n';
import type { LibraryItem, LibraryTest, PartId, Step } from '../types';

const PARTS: PartId[] = ['1.1', '1.2', '2', '3'];
const PICK_KEY = 'library.v1'; // remembers the last test and part on this phone

function remembered(): { id?: string; part?: PartId } {
  try {
    return JSON.parse(localStorage.getItem(PICK_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function remember(v: { id?: string; part?: PartId }) {
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify(v));
  } catch {}
}

const dur = (t: T, sec: number) => (sec < 60 ? `${sec} ${t('sec')}` : `${sec / 60} ${t('min')}`);

/**
 * "Questions & sample answers": every test, part by part, to study before taking
 * one. Nothing is recorded and no attempt is used.
 */
export function Library({ onBack, onNotMember }: { onBack: () => void; onNotMember: () => void }) {
  const { t } = useI18n();
  const [tests, setTests] = useState<LibraryItem[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.library().then(
      (r) => setTests(r.tests),
      (e) => (e?.code === 'NOT_MEMBER' ? onNotMember() : setError(errorText(t, e))),
    );
    return () => stopClip();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tests ?? []).filter((x) => !q || `${x.title} ${x.topics}`.toLowerCase().includes(q));
  }, [tests, query]);

  if (openId && tests) {
    const i = tests.findIndex((x) => x.id === openId);
    return (
      <TestView
        id={openId}
        prev={i > 0 ? tests[i - 1].id : null}
        next={i < tests.length - 1 ? tests[i + 1].id : null}
        onOpen={setOpenId}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={onBack} data-testid="library-back">
              <IonIcon slot="icon-only" icon={arrowBack} />
            </IonButton>
          </IonButtons>
          <IonTitle>{t('libraryTitle')}</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} placeholder={t('librarySearch')} />
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {error && <p className="ion-padding hint">{error}</p>}
        {!tests && !error && (
          <div className="ion-padding ion-text-center">
            <IonSpinner />
          </div>
        )}
        {tests && (
          <>
            <p className="ion-padding-horizontal hint">{t('librarySub')}</p>
            <p className="ion-padding-horizontal hint">{t('libraryCount', { n: shown.length })}</p>
            <IonList lines="full">
              {shown.map((x) => (
                <IonItem key={x.id} button detail onClick={() => setOpenId(x.id)} data-testid={`lib-${x.id}`}>
                  <IonLabel className="ion-text-wrap">
                    <h3>{x.title}</h3>
                    <p>{x.topics}</p>
                  </IonLabel>
                </IonItem>
              ))}
            </IonList>
            {!shown.length && <p className="ion-padding hint ion-text-center">{t('libraryEmpty')}</p>}
          </>
        )}
      </IonContent>
    </IonPage>
  );
}

function TestView({ id, prev, next, onOpen, onBack }: {
  id: string; prev: string | null; next: string | null; onOpen: (id: string) => void; onBack: () => void;
}) {
  const { t } = useI18n();
  const [test, setTest] = useState<LibraryTest | null>(null);
  const [error, setError] = useState('');
  const [part, setPart] = useState<PartId>(() => (remembered().id === id && remembered().part) || '1.1');

  useEffect(() => {
    setTest(null);
    setError('');
    api.libraryTest(id).then((r) => setTest(r.test), (e) => setError(errorText(t, e)));
    return () => stopClip();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => remember({ id, part }), [id, part]);

  const steps = test?.steps.filter((s) => s.part === part) ?? [];
  const go = (to: string) => {
    setPart('1.1');
    onOpen(to);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={onBack} data-testid="test-back">
              <IonIcon slot="icon-only" icon={arrowBack} />
            </IonButton>
          </IonButtons>
          <IonTitle>{test?.title ?? t('loading')}</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={part} onIonChange={(e) => setPart(e.detail.value as PartId)} scrollable>
            {PARTS.map((p) => (
              <IonSegmentButton key={p} value={p} data-testid={`lib-part-${p}`}>
                <IonLabel>{t('part', { p })}</IonLabel>
              </IonSegmentButton>
            ))}
          </IonSegment>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {error && <p className="ion-padding hint">{error}</p>}
        {!test && !error && (
          <div className="ion-padding ion-text-center">
            <IonSpinner />
          </div>
        )}
        {test && (
          <>
            <div className="ion-padding-horizontal">
              <h3 className="lib-part-title">{t(PART_NAME[part])}</h3>
              <p className="hint">{t('tryFirst')}</p>
            </div>
            {steps.map((s, i) => (
              <QuestionCard key={s.key} step={s} n={i + 1} source={test.samples} />
            ))}
            <div className="lib-nav ion-padding">
              <IonButton fill="outline" disabled={!prev} onClick={() => prev && go(prev)}>
                <IonIcon slot="start" icon={chevronBack} />
                {t('prevTest')}
              </IonButton>
              <IonButton fill="outline" disabled={!next} onClick={() => next && go(next)} data-testid="lib-next">
                {t('nextTest')}
                <IonIcon slot="end" icon={chevronForward} />
              </IonButton>
            </div>
          </>
        )}
      </IonContent>
    </IonPage>
  );
}

function QuestionCard({ step, n, source }: { step: Step & { sample: string | null }; n: number; source: LibraryTest['samples'] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Part 1.2 shows the two pictures once, above the first question.
  const pics = step.images && (step.part !== '1.2' || step.key === 'p1_2_1') ? step.images : null;
  const listen = async () => {
    if (!step.audio) return;
    if (playing) return stopClip();
    unlockAudio();
    setPlaying(true);
    await playClip(step.audio);
    setPlaying(false);
  };

  return (
    <IonCard className="lib-q" data-testid={`q-${step.key}`}>
      <IonCardContent>
        {pics && (
          <div className={`pics ${pics.length === 1 ? 'one' : ''}`}>
            {pics.map((src) => <img key={src} src={src} alt="" loading="lazy" />)}
          </div>
        )}
        {step.part === '3' && step.table ? (
          <>
            <p className="lib-question">{step.table.statement}</p>
            <div className="debate"><div className="cols">
              <div className="col for">
                <b>{t('for')}</b>
                <ul>{step.table.for.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
              <div className="col against">
                <b>{t('against')}</b>
                <ul>{step.table.against.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            </div></div>
          </>
        ) : step.part === '2' && step.bullets ? (
          <ul className="lib-bullets">{step.bullets.map((b) => <li key={b} className="lib-question">{b}</li>)}</ul>
        ) : (
          <p className="lib-question">
            <span className="lib-n">{n}.</span> {step.question}
          </p>
        )}
        <div className="lib-meta">
          <span className="hint">{t('timing', { prep: dur(t, step.prepSec), speak: dur(t, step.speakSec) })}</span>
          {step.audio && (
            <IonButton size="small" fill="clear" onClick={listen}>
              <IonIcon slot="start" icon={playing ? stopCircleOutline : volumeHighOutline} />
              {t('listenQ')}
            </IonButton>
          )}
        </div>
        {step.sample && (
          <>
            <IonButton expand="block" fill={open ? 'clear' : 'outline'} size="small" onClick={() => setOpen(!open)} data-testid={`show-${step.key}`}>
              <IonIcon slot="start" icon={open ? eyeOffOutline : eyeOutline} />
              {open ? t('hideSample') : t('showSample')}
            </IonButton>
            {open && (
              <>
                <p className="hint">
                  {source === 'book' ? t('sampleBook') : t('sampleAi')} · {t('wordsN', { n: step.sample.trim().split(/\s+/).length })}
                </p>
                <div className="transcript model" data-testid={`sample-${step.key}`}>{step.sample}</div>
              </>
            )}
          </>
        )}
      </IonCardContent>
    </IonCard>
  );
}
