import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { Delete, Fingerprint, ScanFace } from 'lucide-react-native';
import { KEYS, load, save } from './storage';
import { useTheme } from './theme';
import { T } from './ui';

/**
 * Вход в приложение по Face ID / Touch ID / отпечатку и ПИН-коду из 4 цифр.
 * ПИН хранится в Keychain / Keystore (expo-secure-store). Биометрия — по желанию,
 * ПИН — всегда запасной вариант. После MAX_TRIES неверных ПИН — выход из аккаунта.
 */
export interface LockSettings {
  enabled: boolean;
  biometric: boolean;
  /** через сколько минут в фоне снова спрашивать (0 — сразу) */
  timeoutMin: number;
}

export const PIN_LENGTH = 4;
const MAX_TRIES = 5;
export const LOCK_TIMEOUTS = [
  { value: 0, label: 'Сразу' },
  { value: 1, label: 'Через 1 минуту' },
  { value: 5, label: 'Через 5 минут' },
  { value: 15, label: 'Через 15 минут' },
  { value: 60, label: 'Через час' },
];
const DEFAULTS: LockSettings = { enabled: false, biometric: false, timeoutMin: 1 };

export type BioKind = 'face' | 'finger' | null;

/** Что умеет телефон: Face ID / отпечаток, и настроена ли биометрия. */
export async function biometricKind(): Promise<BioKind> {
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return null;
    if (!(await LocalAuthentication.isEnrolledAsync())) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    return types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ? 'face' : 'finger';
  } catch {
    return null;
  }
}

export const bioLabel = (k: BioKind) => (k === 'face' ? 'Face ID' : 'отпечаток пальца');

async function askBiometric(): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Вход в Selfinance',
      cancelLabel: 'Ввести ПИН-код',
      disableDeviceFallback: true, // запасной вариант — наш ПИН, а не код телефона
    });
    return r.success;
  } catch {
    return false;
  }
}

/** Удалить ПИН и настройки (выход из аккаунта, смена сервера). */
export async function clearLock() {
  await save(KEYS.lock, null);
  await save(KEYS.pin, null);
}

interface LockCtxValue {
  settings: LockSettings;
  locked: boolean;
  /** включить защиту с новым ПИН или сменить ПИН */
  setPin: (pin: string) => Promise<void>;
  update: (patch: Partial<LockSettings>) => Promise<void>;
  disable: () => Promise<void>;
}

const LockCtx = createContext<LockCtxValue | null>(null);

export function useLock() {
  const v = useContext(LockCtx);
  if (!v) throw new Error('useLock вне LockProvider');
  return v;
}

/**
 * Оборачивает приложение после входа. Экран блокировки — отдельное окно поверх всего,
 * поэтому открытые экраны и формы под ним не теряются.
 */
export function LockProvider({ children, onTooManyTries }: { children: ReactNode; onTooManyTries: () => void }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<LockSettings>(DEFAULTS);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false); // прячем данные в списке открытых приложений
  const bgAt = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    (async () => {
      const s = { ...DEFAULTS, ...(await load<LockSettings>(KEYS.lock)) };
      const pin = await load<string>(KEYS.pin);
      const enabled = s.enabled && !!pin;
      setSettings({ ...s, enabled });
      setLocked(enabled);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      const s = settingsRef.current;
      if (!s.enabled) return;
      if (st === 'background') {
        if (bgAt.current === null) bgAt.current = Date.now();
        setCovered(true);
      } else if (st === 'inactive') {
        setCovered(true);
      } else if (st === 'active') {
        setCovered(false);
        if (bgAt.current !== null && Date.now() - bgAt.current >= s.timeoutMin * 60_000) setLocked(true);
        bgAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  const update = useCallback(async (patch: Partial<LockSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    setSettings(next);
    await save(KEYS.lock, next);
  }, []);

  const value = useMemo<LockCtxValue>(
    () => ({
      settings,
      locked,
      setPin: async (pin) => {
        await save(KEYS.pin, pin);
        await update({ enabled: true });
      },
      update,
      disable: async () => {
        await save(KEYS.pin, null);
        await update({ enabled: false, biometric: false });
      },
    }),
    [settings, locked, update],
  );

  if (!ready) return null;
  return (
    <LockCtx.Provider value={value}>
      {children}
      <Modal visible={locked || covered} animationType="none" transparent={false} statusBarTranslucent onRequestClose={() => undefined}>
        {locked ? (
          <LockScreen
            biometric={settings.biometric}
            onUnlock={() => setLocked(false)}
            onTooManyTries={() => {
              setLocked(false);
              void clearLock().then(onTooManyTries);
            }}
          />
        ) : (
          <Cover />
        )}
      </Modal>
    </LockCtx.Provider>
  );
}

function Cover() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <T size={22} weight="700" tone="accent">Selfinance</T>
    </View>
  );
}

function LockScreen({ biometric, onUnlock, onTooManyTries }: { biometric: boolean; onUnlock: () => void; onTooManyTries: () => void }) {
  const t = useTheme();
  const [kind, setKind] = useState<BioKind>(null);
  const [tries, setTries] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const tryBio = useCallback(async () => {
    if (await askBiometric()) onUnlock();
  }, [onUnlock]);

  useEffect(() => {
    if (!biometric) return;
    void biometricKind().then((k) => {
      setKind(k);
      if (k) void tryBio();
    });
  }, [biometric, tryBio]);

  const check = async (pin: string) => {
    const saved = await load<string>(KEYS.pin);
    if (pin === saved) return onUnlock();
    const n = tries + 1;
    setTries(n);
    if (n >= MAX_TRIES) return onTooManyTries();
    const left = MAX_TRIES - n;
    setError(`Неверный ПИН-код. Осталось попыток: ${left}`);
    return 'reset' as const;
  };

  return (
    <PinPad
      title="Введите ПИН-код"
      error={error}
      onDone={check}
      extra={
        kind ? (
          <Pressable onPress={() => void tryBio()} hitSlop={10} accessibilityLabel={`Войти по ${bioLabel(kind)}`}>
            {kind === 'face' ? <ScanFace size={30} color={t.accent} /> : <Fingerprint size={30} color={t.accent} />}
          </Pressable>
        ) : undefined
      }
    />
  );
}

/**
 * Клавиатура ПИН-кода. onDone вызывается, когда введены все цифры;
 * если он вернул 'reset' — поле очищается для новой попытки.
 */
export function PinPad({
  title,
  hint,
  error,
  onDone,
  extra,
  onCancel,
}: {
  title: string;
  hint?: string;
  error?: string | null;
  onDone: (pin: string) => unknown | Promise<unknown>;
  extra?: ReactNode;
  onCancel?: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');

  const press = (d: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(async () => {
        const r = await onDone(next);
        if (r === 'reset') setPin('');
      }, 120);
    }
  };

  const key = (child: ReactNode, onPress?: () => void, label?: string) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 76,
        height: 76,
        borderRadius: 38,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: onPress && typeof child === 'string' ? (pressed ? t.border : t.input) : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {typeof child === 'string' ? <T size={28} weight="500">{child}</T> : child}
    </Pressable>
  );

  const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', gap: 18, paddingHorizontal: 24 }}>
        <T size={14} weight="700" tone="accent">Selfinance</T>
        <T size={22} weight="700" style={{ textAlign: 'center' }}>{title}</T>
        {hint && <T tone="muted" style={{ textAlign: 'center' }}>{hint}</T>}
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <View
              key={i}
              style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: error ? t.danger : t.accent, backgroundColor: i < pin.length ? (error ? t.danger : t.accent) : 'transparent' }}
            />
          ))}
        </View>
        <T tone="danger" size={14} style={{ minHeight: 20, textAlign: 'center' }}>{error ?? ''}</T>
      </View>

      <View style={{ gap: 14 }}>
        {rows.map((r) => (
          <View key={r[0]} style={{ flexDirection: 'row', gap: 22 }}>
            {r.map((d) => <View key={d}>{key(d, () => press(d))}</View>)}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 22 }}>
          {key(extra ?? (onCancel ? <T tone="accent" weight="600">Отмена</T> : <View />), extra ? undefined : onCancel)}
          {key('0', () => press('0'))}
          {key(<Delete size={26} color={t.text} />, pin ? () => setPin(pin.slice(0, -1)) : undefined, 'Стереть')}
        </View>
      </View>
    </View>
  );
}
