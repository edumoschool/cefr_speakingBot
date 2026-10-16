export interface Me {
  user: { id: number; firstName: string | null; attempts: number };
  isMember: boolean;
  channelUrl: string;
  botUsername: string;
  referral: { link: string; qualified: number; per: number; progress: number };
  active: { id: string; status: 'in_progress' | 'grading'; testTitle?: string; answered: string[] } | null;
  history: { id: string; title: string; score: number; level: string; date: number }[];
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
}

export interface TestView {
  id: string;
  title: string;
  topics: string;
  steps: Step[];
}

export interface StartResponse {
  session: { id: string; status: string };
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

export interface VocabPart {
  part: number;
  title: string;
  words: { en: string; uz: string; ru: string }[];
}
