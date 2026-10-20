// Thin, typed wrapper around window.Telegram.WebApp.

type Callback = (err: { message: string; type: string; status?: number; parameters?: Record<string, any> } | null, result?: any) => void;

export interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; language_code?: string }; start_param?: string };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string | undefined>;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  openTelegramLink(url: string): void;
  close?(): void;
  openInvoice?(url: string, cb?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void): void;
  openLink(url: string): void;
  showAlert?(text: string): void;
  onEvent(event: string, cb: () => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { notificationOccurred(t: 'success' | 'warning' | 'error'): void; impactOccurred(s: string): void };
  Serverless?: { call(name: string, input: unknown, cb: Callback): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
    webkitAudioContext?: typeof AudioContext;
  }
}

export const tg: TgWebApp | undefined = window.Telegram?.WebApp;

export function haptic(type: 'success' | 'warning' | 'error') {
  try {
    tg?.HapticFeedback?.notificationOccurred(type);
  } catch {}
}

export function openTelegramLink(url: string) {
  if (tg && /^https:\/\/t\.me\//.test(url)) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

/** Maps Telegram's surfaces and text onto Ionic's CSS variables and dark palette. */
export function applyTheme() {
  const root = document.documentElement;
  const p = tg?.themeParams ?? {};
  const dark = tg ? tg.colorScheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.classList.toggle('ion-palette-dark', dark);
  const set = (name: string, value?: string) => value && root.style.setProperty(name, value);
  set('--ion-background-color', p.secondary_bg_color);
  set('--ion-text-color', p.text_color);
  set('--ion-card-background', p.bg_color);
  set('--ion-item-background', p.bg_color);
  set('--ion-toolbar-background', p.header_bg_color ?? p.bg_color);
  set('--app-hint', p.hint_color);
  // The accent stays the app's own soft blue (theme.css), not Telegram's button colour.
}
