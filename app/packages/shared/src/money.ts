/** Все суммы — целые копейки. */

const NBSP = ' '; // неразрывный пробел перед ₽
const THIN = ' '; // узкий неразрывный пробел между разрядами

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

export interface MoneyParts {
  sign: '' | '−' | '+';
  rub: string;
  kop: string | null; // ",50" или null, если копеек нет
}

export function moneyParts(kopecks: number, opts: { sign?: 'auto' | 'always' | 'never'; forceKop?: boolean } = {}): MoneyParts {
  const signMode = opts.sign ?? 'auto';
  const abs = Math.abs(Math.round(kopecks));
  const rub = Math.floor(abs / 100);
  const k = abs % 100;
  let sign: MoneyParts['sign'] = '';
  if (signMode !== 'never') {
    if (kopecks < 0) sign = '−';
    else if (signMode === 'always' && kopecks > 0) sign = '+';
  }
  return {
    sign,
    rub: groupThousands(rub),
    kop: k || opts.forceKop ? ',' + String(k).padStart(2, '0') : null,
  };
}

/** «12 345,67 ₽», «−280 ₽», «+142 000 ₽» */
export function formatMoney(kopecks: number, opts: { sign?: 'auto' | 'always' | 'never'; currency?: boolean } = {}): string {
  const p = moneyParts(kopecks, opts);
  return `${p.sign}${p.rub}${p.kop ?? ''}${opts.currency === false ? '' : NBSP + '₽'}`;
}

/**
 * Разбор суммы, введённой пользователем: «1 250,50», «350+120», «1000-15%»… не поддерживаем —
 * только + − * / и скобки. Возвращает копейки или null.
 */
export function parseAmount(input: string): number | null {
  const s = input
    .replace(/[\s  ₽]/g, '')
    .replace(/,/g, '.')
    .replace(/[−–]/g, '-')
    .replace(/[×х]/gi, '*')
    .replace(/÷/g, '/');
  if (!s) return null;
  if (!/^[0-9.+\-*/()]+$/.test(s)) return null;
  try {
    const value = evalExpr(s);
    if (value === null || !isFinite(value)) return null;
    return Math.round(value * 100);
  } catch {
    return null;
  }
}

// Небольшой рекурсивный парсер выражений (без eval).
function evalExpr(src: string): number | null {
  let i = 0;
  const peek = () => src[i];
  function number(): number {
    const start = i;
    while (i < src.length && /[0-9.]/.test(src[i])) i++;
    const t = src.slice(start, i);
    if (!t || t.split('.').length > 2) throw new Error('bad number');
    return parseFloat(t);
  }
  function factor(): number {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') throw new Error('no )');
      i++;
      return v;
    }
    return number();
  }
  function term(): number {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = src[i++];
      const r = factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = src[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const v = expr();
  if (i !== src.length) throw new Error('trailing');
  return v;
}

/** Копейки → строка для поля ввода: 125050 → «1250,50», 100000 → «1000» */
export function amountToInput(kopecks: number): string {
  const abs = Math.abs(kopecks);
  const rub = Math.floor(abs / 100);
  const k = abs % 100;
  return (kopecks < 0 ? '-' : '') + rub + (k ? ',' + String(k).padStart(2, '0') : '');
}
