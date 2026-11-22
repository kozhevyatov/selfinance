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
  credit: string;
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
  credit: '#B7791F',
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
  frozen: '#3DB5EA',
  credit: '#F2C14E',
  transfer: '#9AA0AD',
  danger: '#F0646A',
  input: '#21252D',
};

export const ThemeCtx = createContext<Theme>(light);
export const useTheme = () => useContext(ThemeCtx);

export const radius = { panel: 22, item: 14 };
