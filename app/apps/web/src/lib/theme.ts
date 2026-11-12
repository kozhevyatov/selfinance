export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function syncThemeColor() {
  const color = getTheme() === 'dark' ? '#0F1115' : '#F2F3F5';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  syncThemeColor();
  try {
    localStorage.setItem('sf.theme', t);
  } catch {
    /* ignore */
  }
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}
