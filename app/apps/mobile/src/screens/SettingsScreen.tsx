import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Coins, KeyRound, LogOut, Palette, Shield, Smartphone, User as UserIcon, X } from 'lucide-react-native';
import { formatPhone, type User, type WeekStart } from '@selfinance/shared';
import { ApiError, patch } from '../api';
import { budgetsApi, revokeSession, useSessions } from '../data';
import { pendingNote } from '../offline';
import { CurrencySelect } from '../currency';
import { fmtDateLong } from '../format';
import { Divider, Hint, MenuRow, PageHeader, Select } from '../kit';
import { useNav, type SettingsKey } from '../nav';
import { useBudget, useSession } from '../session';
import { useTheme, useThemePref } from '../theme';
import { Button, Card, Field, Segmented, T } from '../ui';

const SECTIONS: { key: SettingsKey; label: string; hint: string; icon: typeof UserIcon }[] = [
  { key: 'profile', label: 'Профиль', hint: 'Имя, email, телефон, часовой пояс, начало недели', icon: UserIcon },
  { key: 'password', label: 'Пароль', hint: 'Сменить пароль входа', icon: KeyRound },
  { key: 'currency', label: 'Валюта', hint: 'Валюта текущего бюджета', icon: Coins },
  { key: 'theme', label: 'Оформление', hint: 'Светлая, тёмная или как в системе', icon: Palette },
  { key: 'devices', label: 'Устройства', hint: 'Где выполнен вход, завершить сеансы', icon: Smartphone },
];

export function SettingsScreen() {
  const t = useTheme();
  const nav = useNav();
  const { user, signOut } = useSession();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PageHeader title="Настройки" onBack={nav.pop} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Card style={{ paddingVertical: 6 }}>
          {SECTIONS.map(({ key, label, hint, icon: I }, i) => (
            <View key={key}>
              {i > 0 && <Divider />}
              <MenuRow icon={<I size={19} color={t.text} />} title={label} hint={hint} onPress={() => nav.push({ name: 'settings-section', key })} />
            </View>
          ))}
          {user?.isAdmin && (
            <>
              <Divider />
              <MenuRow
                icon={<Shield size={19} color={t.text} />}
                title="Администрирование"
                hint="Пользователи, регистрация, приглашения"
                onPress={() => nav.push({ name: 'admin' })}
              />
            </>
          )}
          <Divider />
          <MenuRow
            icon={<LogOut size={19} color={t.danger} />}
            title="Выйти"
            danger
            onPress={() =>
              Alert.alert('Выйти из аккаунта?', pendingNote(), [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Выйти', style: 'destructive', onPress: () => void signOut() },
              ])
            }
          />
        </Card>
      </ScrollView>
    </View>
  );
}

export function SettingsSectionScreen({ section }: { section: SettingsKey }) {
  const t = useTheme();
  const nav = useNav();
  const item = SECTIONS.find((s) => s.key === section)!;
  const body = {
    profile: <ProfileSection />,
    password: <PasswordSection />,
    currency: <CurrencySection />,
    theme: <ThemeSection />,
    devices: <SessionsSection />,
  }[section];
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PageHeader title={item.label} onBack={nav.pop} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 14 }}>{body}</Card>
      </ScrollView>
    </View>
  );
}

const COMMON_ZONES = [
  'Europe/Kaliningrad',
  'Europe/Moscow',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Omsk',
  'Asia/Novosibirsk',
  'Asia/Krasnoyarsk',
  'Asia/Irkutsk',
  'Asia/Yakutsk',
  'Asia/Vladivostok',
  'Asia/Magadan',
  'Asia/Kamchatka',
  'Europe/Minsk',
  'Europe/Kyiv',
  'Asia/Almaty',
  'Asia/Tashkent',
  'Asia/Bishkek',
  'Asia/Tbilisi',
  'Asia/Yerevan',
  'Asia/Baku',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
  'UTC',
];

function ProfileSection() {
  const { user } = useSession();
  const { updateUser } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ? formatPhone(user.phone) : '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'Europe/Moscow');
  const [weekStart, setWeekStart] = useState<WeekStart>(user?.weekStart ?? 1);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const zones = COMMON_ZONES.includes(timezone) ? COMMON_ZONES : [timezone, ...COMMON_ZONES];

  async function submit() {
    setMsg(null);
    setError(null);
    setFields({});
    setBusy(true);
    try {
      const u = await patch<User>('/auth/me', { name, email: email || null, phone: phone || null, timezone, weekStart });
      updateUser(u);
      setMsg('Сохранено');
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
      } else setError('Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Field label="Имя" value={name} onChangeText={setName} error={fields.name} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" error={fields.email} />
      <Field label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={fields.phone} />
      <Hint>Войти можно по любому из них. Нужен хотя бы один.</Hint>
      <Select label="Часовой пояс" value={timezone} options={zones.map((z) => ({ value: z, label: z }))} onChange={setTimezone} />
      <View style={{ gap: 6 }}>
        <T tone="muted" size={13}>Первый день недели</T>
        <Segmented
          value={String(weekStart) as '0' | '1'}
          onChange={(v) => setWeekStart(Number(v) as WeekStart)}
          options={[
            { value: '1', label: 'Понедельник' },
            { value: '0', label: 'Воскресенье' },
          ]}
        />
      </View>
      {error && <T tone="danger">{error}</T>}
      {msg && <T tone="income">{msg}</T>}
      <Button title="Сохранить" onPress={submit} loading={busy} />
    </>
  );
}

function PasswordSection() {
  const [currentPassword, setCur] = useState('');
  const [newPassword, setNew] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setMsg(null);
    setError(null);
    if (newPassword.length < 6) return setError('Новый пароль — минимум 6 символов');
    setBusy(true);
    try {
      await patch('/auth/me', { currentPassword, newPassword });
      setCur('');
      setNew('');
      setMsg('Пароль изменён');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сменить пароль');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Field label="Текущий пароль" value={currentPassword} onChangeText={setCur} secureTextEntry textContentType="password" autoComplete="current-password" />
      <Field label="Новый пароль" value={newPassword} onChangeText={setNew} secureTextEntry textContentType="newPassword" autoComplete="new-password" />
      {error && <T tone="danger">{error}</T>}
      {msg && <T tone="income">{msg}</T>}
      <Button title="Сменить пароль" onPress={submit} loading={busy} />
    </>
  );
}

function CurrencySection() {
  const { budget, budgets } = useBudget();
  const [currency, setCurrency] = useState(budget.currency ?? 'RUB');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = budget.role === 'owner';

  useEffect(() => {
    setCurrency(budget.currency ?? 'RUB');
    setMsg(null);
    setError(null);
  }, [budget.id, budget.currency]);

  async function submit() {
    setMsg(null);
    setError(null);
    try {
      await budgetsApi.update(budget.id, { currency });
      setMsg('Сохранено');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    }
  }

  return (
    <>
      {budgets.length > 1 && <T weight="600">{budget.name}</T>}
      <CurrencySelect value={currency} onChange={setCurrency} disabled={!isOwner} />
      <Hint>{isOwner ? 'Меняется только обозначение: суммы не пересчитываются по курсу.' : 'Сменить валюту может только владелец бюджета.'}</Hint>
      {error && <T tone="danger">{error}</T>}
      {msg && <T tone="income">{msg}</T>}
      {isOwner && <Button title="Сохранить" onPress={submit} disabled={currency === budget.currency} />}
    </>
  );
}

function ThemeSection() {
  const { pref, setPref } = useThemePref();
  return (
    <Segmented
      value={pref}
      onChange={setPref}
      options={[
        { value: 'light', label: 'Светлая' },
        { value: 'dark', label: 'Тёмная' },
        { value: 'system', label: 'Как в системе' },
      ]}
    />
  );
}

function SessionsSection() {
  const t = useTheme();
  const { signOut } = useSession();
  const { data = [] } = useSessions();
  return (
    <>
      {data.map((s) => (
        <MenuRow
          key={s.id}
          icon={<Smartphone size={18} color={t.text} />}
          title={s.deviceName ?? 'Устройство'}
          hint={`вход ${fmtDateLong(s.createdAt)}`}
          right={<X size={18} color={t.muted} />}
          onPress={() =>
            Alert.alert('Завершить сеанс?', s.deviceName ?? undefined, [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Завершить', style: 'destructive', onPress: () => void revokeSession(s.id).catch(() => undefined) },
            ])
          }
        />
      ))}
      <Button title="Выйти" kind="secondary" icon={<LogOut size={18} color={t.text} />} onPress={() => void signOut()} />
    </>
  );
}
