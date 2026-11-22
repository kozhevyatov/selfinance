import * as SecureStore from 'expo-secure-store';

/**
 * Небольшие значения (адрес сервера, токены, пользователь, выбранный бюджет)
 * хранятся в защищённом хранилище устройства: Keychain на iOS, Keystore на Android.
 */
export async function load<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function save(key: string, value: unknown): Promise<void> {
  try {
    if (value === null || value === undefined) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch {
    /* не критично */
  }
}

export const KEYS = {
  server: 'sf.server',
  auth: 'sf.auth',
  user: 'sf.user',
  budget: 'sf.budget',
  theme: 'sf.theme',
  lastAccount: (budgetId: string) => `sf.lastAccount.${budgetId}`,
};
