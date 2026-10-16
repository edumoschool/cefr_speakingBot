export interface Me {
  user: { id: number; firstName: string | null; attempts: number };
  isMember: boolean;
  channelUrl: string;
  botUsername: string;
  /** Stars packs for sale, or null while payments are off. */
  shop: { id: string; attempts: number; stars: number }[] | null;
  referral: { link: string; qualified: number; per: number; progress: number };
  active: { id: string; kind: 'mock' | 'drill'; drillPart: PartId | null; status: 'in_progress' | 'grading'; testTitle?: string; answered: string[] } | null;
  history: { id: string; kind: 'mock' | 'drill'; title: string; score: number; level: string; date: number; criteria: Record<string, number> | null }[];
  feedbackLang: 'en' | 'uz' | 'ru';
  drills: { perDay: number; left: number };
  leaderboard: {
    top: { rank: number; name: string; score: number; level: string; me: boolean }[];
    mine: { rank: number; score: number } | null;
  };
}

export type PartId = '1.1' | '1.2' | '2' | '3';

export interface Step {
  key: string;
  part: PartId;
  question: string;
  prepSec: number;
  speakSec: number;
  images?: string[];
  bullets?: string[];
  table?: { statement: string; for: string[]; against: string[] };
  /** Pre-recorded examiner voice for this question. */
  audio?: string;
}

export interface TestView {
  id: string;
  title: string;
  topics: string;
  steps: Step[];
}

export interface StartResponse {
  session: { id: string; status: string; kind: 'mock' | 'drill' };
  expired: boolean;
  test: TestView;
  answered: string[];
  graded: string[];
}

export interface Metrics {
  wordCount: number;
  wpm: number;
  pauses: number;
  fillers: number;
  avgConfidence: number;
}

export interface MockResult {
  testTitle: string;
  kind?: 'mock' | 'drill';
  drillPart?: PartId | null;
  score: number;
  level: string;
  criteria: Record<string, number>;
  parts: { part: PartId; criteria: Record<string, string>; points: number; words: number; feedback: string }[];
  overall: string;
  strengths: string[];
  priorities: string[];
  corrections: { original: string; corrected: string; explanation: string }[];
  vocabulary: { basic: string; better: string; example: string }[];
  pronunciation: string[];
  answers: {
    key: string;
    part: PartId;
    question: string;
    transcript: string | null;
    metrics: Metrics | null;
    comment: string;
    modelAnswer: string | null;
  }[];
}

