import { useEffect, useMemo, useState } from 'react';
import {
  IonButton, IonButtons, IonIcon, IonContent, IonHeader, IonItem, IonLabel, IonList, IonPage, IonSearchbar, IonSegment,
  IonSegmentButton, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/react';
import { chevronBack } from 'ionicons/icons';
import type { VocabPart } from '../types';

export function Vocab({ onBack }: { onBack: () => void }) {
  const [parts, setParts] = useState<VocabPart[] | null>(null);
  const [active, setActive] = useState('1');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/data/vocabulary.json')
      .then((r) => r.json())
      .then(setParts)
      .catch(() => setParts([]));
  }, []);

  const words = useMemo(() => {
    if (!parts) return [];
    const q = query.trim().toLowerCase();
    const pool = q ? parts.flatMap((p) => p.words) : parts.find((p) => String(p.part) === active)?.words ?? [];
    return q ? pool.filter((w) => [w.en, w.uz, w.ru].some((s) => s.toLowerCase().includes(q))) : pool;
  }, [parts, active, query]);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={onBack}>
              <IonIcon slot="icon-only" icon={chevronBack} />
            </IonButton>
          </IonButtons>
          <IonTitle>Topic vocabulary</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar placeholder="Search EN · UZ · RU" value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} />
        </IonToolbar>
        {!query && parts && parts.length > 0 && (
          <IonToolbar>
            <IonSegment scrollable value={active} onIonChange={(e) => setActive(String(e.detail.value))}>
              {parts.map((p) => (
                <IonSegmentButton key={p.part} value={String(p.part)}>
                  <IonLabel>{p.title}</IonLabel>
                </IonSegmentButton>
              ))}
            </IonSegment>
          </IonToolbar>
        )}
      </IonHeader>
      <IonContent>
        {!parts ? (
          <div className="center-page"><IonSpinner /></div>
        ) : (
          <IonList>
            {words.map((w, i) => (
              <IonItem key={i}>
                <IonLabel className="ion-text-wrap">
                  <h3>{w.en}</h3>
                  <p>🇺🇿 {w.uz} · 🇷🇺 {w.ru}</p>
                </IonLabel>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  );
}
