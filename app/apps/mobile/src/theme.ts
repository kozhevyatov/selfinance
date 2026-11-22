import { createContext, useContext } from 'react';

/** Цвета из спецификации (раздел 9 «Дизайн»), те же, что в веб-версии. */
export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  income: string;
  expense: string;
  frozen: string;
  frozenSoft: string;
  frozenHatch: string;
  credit: string;
  creditSoft: string;
  creditHatch: string;
  transfer: string;
  danger: string;
  input: string;
}

export const light: Theme = {
  dark: false,
  bg: '#F2F3F5',
  card: '#FFFFFF',
  border: '#E4E6EB',
  text: '#1C1F26',
  muted: '#6B7180',
  faint: '#A2A7B3',
  accent: '#4338CA',
  accentText: '#FFFFFF',
  accentSoft: '#EEF0FF',
  income: '#15803D',
  expense: '#D9434A',
  frozen: '#0E9AD6',
  frozenSoft: '#E3F4FC',
  frozenHatch: 'rgba(14,154,214,0.22)',
  credit: '#B7791F',
  creditSoft: '#FDF3DC',
  creditHatch: 'rgba(183,121,31,0.22)',
  transfer: '#7A808C',
  danger: '#D9434A',
  input: '#F2F3F5',
};

export const dark: Theme = {
  dark: true,
  bg: '#0F1115',
  card: '#181B21',
  border: '#262A33',
  text: '#F2F3F5',
  muted: '#9AA0AD',
  faint: '#5F6572',
  accent: '#8B8CF8',
  accentText: '#0F1115',
  accentSoft: '#23243F',
  income: '#3FBF6B',
  expense: '#F0646A',
  frozen: '#38BDF8',
  frozenSoft: '#132A36',
  frozenHatch: 'rgba(56,189,248,0.28)',
  credit: '#F2C14E',
  creditSoft: '#33290F',
  creditHatch: 'rgba(242,193,78,0.22)',
  transfer: '#9AA0AD',
  danger: '#F0646A',
  input: '#21252D',
};

export const ThemeCtx = createContext<Theme>(light);
export const useTheme = () => useContext(ThemeCtx);

/** Выбор оформления: светлая, тёмная или как в системе. */
export type ThemePref = 'light' | 'dark' | 'system';
export const ThemePrefCtx = createContext<{ pref: ThemePref; setPref: (p: ThemePref) => void }>({ pref: 'system', setPref: () => undefined });
export const useThemePref = () => useContext(ThemePrefCtx);

export const radius = { panel: 22, item: 14 };

/** Смешать цвет с другим: p — доля первого (как color-mix в веб-версии). */
export function mix(a: string, b: string, p: number): string {
  const h = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = h(a);
  const [r2, g2, b2] = h(b);
  const m = (x: number, y: number) => Math.round(x * p + y * (1 - p)).toString(16).padStart(2, '0');
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}
