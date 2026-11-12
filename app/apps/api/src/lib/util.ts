import crypto from 'node:crypto';

/** UUID v7: первые 48 бит — время в мс, поэтому id сортируются по времени создания. */
export function uuidv7(): string {
  const b = crypto.randomBytes(16);
  const ts = Date.now();
  b[0] = Math.floor(ts / 2 ** 40) & 0xff;
  b[1] = Math.floor(ts / 2 ** 32) & 0xff;
  b[2] = (ts >>> 24) & 0xff;
  b[3] = (ts >>> 16) & 0xff;
  b[4] = (ts >>> 8) & 0xff;
  b[5] = ts & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const nowIso = () => new Date().toISOString();

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** Ошибка, которую API отдаёт клиенту как есть. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) => new AppError(400, 'BAD_REQUEST', message, fields);
export const notFound = (what = 'Не найдено') => new AppError(404, 'NOT_FOUND', what);
export const forbidden = (message = 'Нет доступа') => new AppError(403, 'FORBIDDEN', message);
export const unauthorized = (message = 'Нужно войти') => new AppError(401, 'UNAUTHORIZED', message);

export const bool = (v: number | boolean | null | undefined) => !!v;
export const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
