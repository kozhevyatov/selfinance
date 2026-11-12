/** Вход по email или телефону. */

export type LoginKind = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

export function normalizeEmail(input: string): string | null {
  const v = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** Приводит телефон к E.164. Российские номера: 8XXXXXXXXXX и XXXXXXXXXX → +7XXXXXXXXXX. */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
  else if (digits.length === 10 && digits.startsWith('9')) digits = '7' + digits;
  if (digits.length < 10 || digits.length > 15) return null;
  return '+' + digits;
}

export function parseLogin(input: string): LoginKind | null {
  if (input.includes('@')) {
    const v = normalizeEmail(input);
    return v ? { kind: 'email', value: v } : null;
  }
  const p = normalizePhone(input);
  return p ? { kind: 'phone', value: p } : null;
}

/** +79991234567 → +7 999 123-45-67 */
export function formatPhone(e164: string): string {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : e164;
}
