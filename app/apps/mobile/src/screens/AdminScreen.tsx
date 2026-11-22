import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';
import { Plus, Share2, Trash2 } from 'lucide-react-native';
import { formatPhone, type AdminUser, type RegistrationMode } from '@selfinance/shared';
import { ApiError, getServer } from '../api';
import { adminApi, useAdmin } from '../data';
import { fmtDateLong } from '../format';
import { Hint, PageHeader, Sheet, SwitchRow } from '../kit';
import { useNav } from '../nav';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { Button, Card, Field, SectionTitle, Segmented, Skeleton, T } from '../ui';
import { SmallBtn } from '../widgets';

/** Администрирование: регистрация, приглашения, пользователи. Чужие финансы администратор не видит. */
export function AdminScreen() {
  const t = useTheme();
  const nav = useNav();
  const { user: me } = useSession();
  const { settings, users, invites } = useAdmin();
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);

  const fail = (e: unknown) => Alert.alert('Ошибка', e instanceof ApiError ? e.message : undefined);
  const inviteLink = (code: string) => `${getServer()}/register?invite=${code}`;
  const now = new Date().toISOString();
  const activeInvites = (invites.data ?? []).filter((i) => !i.usedBy && (!i.expiresAt || i.expiresAt > now));

  const blockToggle = (u: AdminUser) => {
    const go = () => adminApi.updateUser(u.id, { isBlocked: !u.isBlocked }).catch(fail);
    if (u.isBlocked) return void go();
    Alert.alert(`Заблокировать «${u.name}»?`, 'Все его сеансы завершатся.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Заблокировать', style: 'destructive', onPress: () => void go() },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PageHeader title="Администрирование" onBack={nav.pop} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Card style={{ gap: 12 }}>
          <SectionTitle
            right={
              settings.data ? (
                <T size={12} tone="muted">v{settings.data.version}, {settings.data.dbType === 'mysql' ? 'MySQL/MariaDB' : 'SQLite'}</T>
              ) : undefined
            }
          >
            Регистрация
          </SectionTitle>
          {settings.data ? (
            <Segmented
              value={settings.data.registration}
              onChange={(v: RegistrationMode) => void adminApi.setRegistration(v).catch(fail)}
              options={[
                { value: 'closed', label: 'Закрытая' },
                { value: 'invite', label: 'По ссылкам' },
                { value: 'open', label: 'Открытая' },
              ]}
            />
          ) : (
            <Skeleton height={46} />
          )}

          {settings.data?.registration === 'invite' && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <T weight="700" style={{ flex: 1 }}>Приглашения</T>
                <Pressable hitSlop={8} onPress={() => void adminApi.newInvite().catch(fail)}>
                  <T tone="accent" weight="600">+ Создать ссылку</T>
                </Pressable>
              </View>
              {activeInvites.length ? (
                activeInvites.map((i) => (
                  <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                    <View style={{ flex: 1 }}>
                      <T size={13} selectable>{inviteLink(i.code)}</T>
                      <T size={12} tone="muted">до {i.expiresAt ? fmtDateLong(i.expiresAt) : '—'}</T>
                    </View>
                    <Pressable hitSlop={6} style={{ padding: 6 }} onPress={() => void Share.share({ message: inviteLink(i.code) })}>
                      <Share2 size={18} color={t.accent} />
                    </Pressable>
                    <Pressable hitSlop={6} style={{ padding: 6 }} onPress={() => void adminApi.deleteInvite(i.id).catch(fail)}>
                      <Trash2 size={18} color={t.muted} />
                    </Pressable>
                  </View>
                ))
              ) : (
                <Hint>Активных приглашений нет. Ссылка действует 7 дней и подходит одному человеку.</Hint>
              )}
            </View>
          )}
        </Card>

        <Card>
          <SectionTitle
            right={
              <Pressable hitSlop={8} onPress={() => setAdding(true)}>
                <Plus size={22} color={t.accent} />
              </Pressable>
            }
          >
            Пользователи
          </SectionTitle>
          {(users.data ?? []).map((u) => (
            <View key={u.id} style={{ paddingVertical: 10, gap: 8, opacity: u.isBlocked ? 0.55 : 1, borderTopWidth: 1, borderTopColor: t.border }}>
              <View>
                <T weight="600">
                  {u.name}
                  {u.isAdmin && <T size={12} tone="accent">  админ</T>}
                  {u.isBlocked && <T size={12} tone="danger">  заблокирован</T>}
                </T>
                <T size={13} tone="muted">{[u.email, u.phone && formatPhone(u.phone)].filter(Boolean).join(', ')}</T>
              </View>
              <SwitchRow
                title="Общие бюджеты"
                value={u.canShare}
                onChange={(v) => void adminApi.updateUser(u.id, { canShare: v }).catch(fail)}
              />
              {u.id !== me?.id && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <SmallBtn title="Пароль" onPress={() => setResetFor(u)} />
                  <SmallBtn
                    title={u.isAdmin ? 'Снять админа' : 'Сделать админом'}
                    onPress={() => void adminApi.updateUser(u.id, { isAdmin: !u.isAdmin }).catch(fail)}
                  />
                  <SmallBtn title={u.isBlocked ? 'Разблокировать' : 'Заблокировать'} onPress={() => blockToggle(u)} />
                </View>
              )}
            </View>
          ))}
          <Hint style={{ marginTop: 10 }}>
            «Общие бюджеты» — пользователь может создавать семейные бюджеты, вступать в чужие по приглашению и видит раздел «Бюджеты». Администратор
            управляет аккаунтами, но не видит чужие финансы.
          </Hint>
        </Card>
      </ScrollView>

      <AddUserSheet visible={adding} onClose={() => setAdding(false)} />
      <ResetPasswordSheet key={resetFor?.id ?? 'none'} user={resetFor} onClose={() => setResetFor(null)} />
    </View>
  );
}

function AddUserSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [canShare, setCanShare] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setFields({});
    setBusy(true);
    try {
      await adminApi.createUser({ name, login, password, canShare, isAdmin });
      setName('');
      setLogin('');
      setPassword('');
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
      } else setError('Не получилось');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title="Новый пользователь" onClose={onClose}>
      <Field label="Имя" value={name} onChangeText={setName} error={fields.name} />
      <Field label="Email или телефон" value={login} onChangeText={setLogin} autoCapitalize="none" error={fields.login} />
      <Field label="Пароль" value={password} onChangeText={setPassword} autoCapitalize="none" error={fields.password} />
      <SwitchRow title="Общие бюджеты" hint="Может создавать семейные бюджеты" value={canShare} onChange={setCanShare} />
      <SwitchRow title="Администратор" hint="Управляет пользователями и регистрацией" value={isAdmin} onChange={setIsAdmin} />
      <Hint>Передайте пароль пользователю — он сможет сменить его в настройках.</Hint>
      {error && <T tone="danger">{error}</T>}
      <Button title="Создать" onPress={submit} loading={busy} />
    </Sheet>
  );
}

function ResetPasswordSheet({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user) return;
    if (password.length < 6) return setError('Минимум 6 символов');
    setBusy(true);
    try {
      await adminApi.updateUser(user.id, { password });
      onClose();
      Alert.alert('Пароль изменён');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={!!user} title={user ? `Пароль для «${user.name}»` : ''} onClose={onClose}>
      <Field label="Новый пароль" value={password} onChangeText={setPassword} autoCapitalize="none" autoFocus />
      {error && <T tone="danger">{error}</T>}
      <Button title="Сохранить" onPress={submit} loading={busy} />
    </Sheet>
  );
}
