import { UPDATE_BRANCH, UPDATE_CHECK, UPDATE_REPO, VERSION } from '../config';
import type { VersionInfo } from '@selfinance/shared';

/**
 * Проверка обновлений: версия в app/package.json ветки main на GitHub сравнивается с версией сервера.
 * Что нового — из CHANGELOG.md (разделы «## 1.2.3» новее текущей версии).
 * Результат кешируется на 6 часов, чтобы не дёргать GitHub при каждом открытии приложения.
 */
const TTL = 6 * 60 * 60 * 1000;
const MIN_FORCE = 60 * 1000;
const RAW = `https://raw.githubusercontent.com/${UPDATE_REPO}/${UPDATE_BRANCH}`;

let cache: VersionInfo | null = null;
let cachedAt = 0;
let pending: Promise<VersionInfo> | null = null;

/** Сравнение семантических версий: 1.0.10 > 1.0.9. Суффиксы (-beta) отбрасываются. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split(/[-+]/)[0].split('.').map((x) => Number(x) || 0);
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': `selfinance/${VERSION}` } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Разделы CHANGELOG.md новее текущей версии: [{ version, items }]. */
function parseChangelog(md: string, current: string, latest: string) {
  const out: { version: string; items: string[] }[] = [];
  let cur: { version: string; items: string[] } | null = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+\[?v?(\d+\.\d+\.\d+[^\]\s]*)\]?/);
    if (h) {
      const v = h[1];
      cur = compareVersions(v, current) > 0 && compareVersions(v, latest) <= 0 ? { version: v, items: [] } : null;
      if (cur) out.push(cur);
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.+)/);
    if (cur && item && cur.items.length < 15) cur.items.push(item[1].trim());
  }
  return out.slice(0, 10);
}

async function check(): Promise<VersionInfo> {
  const base: VersionInfo = {
    current: VERSION,
    latest: null,
    updateAvailable: false,
    checkedAt: new Date().toISOString(),
    enabled: UPDATE_CHECK,
    repo: UPDATE_REPO,
    notes: [],
    error: null,
  };
  if (!UPDATE_CHECK) return base;

  const pkg = await fetchText(`${RAW}/app/package.json`);
  let latest: string | null = null;
  try {
    latest = pkg ? (JSON.parse(pkg) as { version?: string }).version ?? null : null;
  } catch {
    latest = null;
  }
  if (!latest) return { ...base, error: 'Не удалось связаться с GitHub' };

  const updateAvailable = compareVersions(latest, VERSION) > 0;
  let notes: VersionInfo['notes'] = [];
  if (updateAvailable) {
    const md = await fetchText(`${RAW}/CHANGELOG.md`);
    if (md) notes = parseChangelog(md, VERSION, latest);
  }
  return { ...base, latest, updateAvailable, notes };
}

export async function getVersionInfo(force = false): Promise<VersionInfo> {
  const age = Date.now() - cachedAt;
  // при ошибке перепроверяем чаще — через 10 минут
  const ttl = cache?.error ? 10 * 60 * 1000 : TTL;
  if (cache && age < ttl && !(force && age > MIN_FORCE)) return cache;
  if (!pending) {
    pending = check()
      .then((info) => {
        cache = info;
        cachedAt = Date.now();
        return info;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
