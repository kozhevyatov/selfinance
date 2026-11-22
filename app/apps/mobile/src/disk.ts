import { File, Paths } from 'expo-file-system';

/**
 * JSON-файлы в папке приложения: сохранённые данные экранов и очередь неотправленных изменений.
 * Ошибки записи не критичны — приложение просто работает без сохранения.
 */

const file = (name: string) => new File(Paths.document, name);

export async function readJson<T>(name: string): Promise<T | null> {
  try {
    const f = file(name);
    if (!f.exists) return null;
    return JSON.parse(await f.text()) as T;
  } catch {
    return null;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  try {
    const f = file(name);
    if (!f.exists) f.create();
    await f.write(JSON.stringify(value));
  } catch {
    /* не критично */
  }
}

export function removeFile(name: string) {
  try {
    const f = file(name);
    if (f.exists) f.delete();
  } catch {
    /* ignore */
  }
}

/** Короткий хеш строки — для имени файла (адрес сервера + пользователь). */
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
