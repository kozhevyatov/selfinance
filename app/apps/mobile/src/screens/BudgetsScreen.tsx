import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { ArrowLeftRight, Check, LogOut, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { DEFAULT_CURRENCY, type Budget, type BudgetRole } from '@selfinance/shared';
import { ApiError } from '../api';
import { budgetsApi, useBudgetInvites, useBudgetMembers, useCandidates, useIncomingInvites } from '../data';
import { CurrencySelect } from '../currency';
import { Hint, PageHeader, Select, Sheet } from '../kit';
import { useNav } from '../nav';
import { useBudget, useSession } from '../session';
import { useTheme } from '../theme';
import { Button, Card, Field, SectionTitle, T } from '../ui';
import { SmallBtn } from '../widgets';

export const ROLE_LABEL: Record<BudgetRole, string> = { owner: 'владелец', member: 'участник', viewer: 'наблюдатель' };
const ROLE_HINT: Record<BudgetRole, string> = {
  owner: 'всё, включая участников и удаление бюджета',
  member: 'вносит и правит операции, счета, категории',
  viewer: 'только просмотр',
};
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

export function BudgetsScreen() {
  const t = useTheme();
  const nav = useNav();
  const { user } = useSession();
  const { budgets, budget: current, setBudgetId } = useBudget();
  const [selId, setSelId] = useState(current.id);
  const [creating, setCreating] = useState(false);
  const sel = budgets.find((b) => b.id === selId) ?? current;
  const writable = budgets.filter((b) => b.role !== 'viewer');

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PageHeader
        title="Бюджеты"
        onBack={nav.pop}
        right={
          user?.canShare ? (
            <Pressable hitSlop={8} onPress={() => setCreating(true)} style={{ padding: 6 }}>
              <Plus size={24} color={t.accent} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <IncomingInvites />
        <Card>
          <SectionTitle>Мои бюджеты</SectionTitle>
          {budgets.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => setSelId(b.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 10,
                marginHorizontal: -10,
                borderRadius: 14,
                backgroundColor: sel.id === b.id ? t.accentSoft : 'transparent',
              }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.input, alignItems: 'center', justifyContent: 'center' }}>
                <T weight="700">{b.name.slice(0, 1).toUpperCase()}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T weight="600">{b.name}</T>
                <T size={13} tone="muted">
                  {b.type === 'personal' ? 'Личный — видите только вы' : `Общий · вы ${ROLE_LABEL[b.role]}`}
                  {b.id === current.id ? ' · открыт сейчас' : ''}
                </T>
              </View>
              {b.id !== current.id && <SmallBtn title="Открыть" onPress={() => setBudgetId(b.id)} />}
            </Pressable>
          ))}
          {!user?.canShare && budgets.length < 2 && (
            <Hint style={{ marginTop: 8 }}>Создавать общие бюджеты может пользователь, которому это разрешил администратор.</Hint>
          )}
          {writable.length > 1 && (
            <Button
              title="Перевод между бюджетами"
              kind="secondary"
              icon={<ArrowLeftRight size={18} color={t.text} />}
              onPress={() => nav.openTx({ cross: true })}
              style={{ marginTop: 12 }}
            />
          )}
        </Card>

        {sel.type === 'shared' && <SharedBudget key={sel.id} b={sel} onGone={() => setSelId(budgets[0]?.id ?? '')} />}
      </ScrollView>

      <CreateBudgetSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setSelId(id);
          setCreating(false);
        }}
      />
    </View>
  );
}

function SharedBudget({ b, onGone }: { b: Budget; onGone: () => void }) {
  const t = useTheme();
  const { user } = useSession();
  const isOwner = b.role === 'owner';
  const members = useBudgetMembers(b.id);
  const [name, setName] = useState(b.name);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = members.data ?? [];
  const owners = list.filter((m) => m.role === 'owner').length;

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не получилось');
    }
  };
  const ask = (title: string, msg: string, action: string, fn: () => Promise<unknown>) =>
    Alert.alert(title, msg, [
      { text: 'Отмена', style: 'cancel' },
      { text: action, style: 'destructive', onPress: () => void run(fn) },
    ]);

  return (
    <>
      <Card>
        {renaming ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Field value={name} onChangeText={setName} maxLength={100} autoFocus />
            </View>
            <Pressable
              hitSlop={6}
              onPress={() =>
                void run(async () => {
                  await budgetsApi.update(b.id, { name });
                  setRenaming(false);
                })
              }
            >
              <Check size={22} color={t.accent} />
            </Pressable>
            <Pressable
              hitSlop={6}
              onPress={() => {
                setName(b.name);
                setRenaming(false);
              }}
            >
              <X size={22} color={t.muted} />
            </Pressable>
          </View>
        ) : (
          <SectionTitle
            right={
              isOwner ? (
                <Pressable hitSlop={8} onPress={() => setRenaming(true)}>
                  <Pencil size={18} color={t.muted} />
                </Pressable>
              ) : undefined
            }
          >
            {b.name}: участники
          </SectionTitle>
        )}

        {list.map((m) => {
          const canManage = isOwner && !(m.role === 'owner' && owners <= 1);
          return (
            <View key={m.userId} style={{ paddingVertical: 8, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <T weight="600">
                    {m.name}
                    {m.userId === user?.id && <T tone="muted"> (вы)</T>}
                  </T>
                  <T size={12} tone="muted">
                    с {fmtDate(m.joinedAt)}
                    {!m.active && ' · администратор отключил ему общие бюджеты, сейчас бюджет ему не виден'}
                  </T>
                </View>
                {!canManage && <T size={13} tone="muted">{ROLE_LABEL[m.role]}</T>}
                {isOwner && m.userId !== user?.id && canManage && (
                  <Pressable
                    hitSlop={6}
                    onPress={() => ask(`Убрать «${m.name}» из бюджета?`, '', 'Убрать', () => budgetsApi.removeMember(b.id, m.userId))}
                  >
                    <Trash2 size={18} color={t.muted} />
                  </Pressable>
                )}
              </View>
              {canManage && (
                <Select
                  value={m.role}
                  options={(['owner', 'member', 'viewer'] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                  onChange={(role) => void run(() => budgetsApi.setRole(b.id, m.userId, role))}
                />
              )}
            </View>
          );
        })}
        <Hint style={{ marginTop: 8 }}>
          Владелец — {ROLE_HINT.owner}; участник — {ROLE_HINT.member}; наблюдатель — {ROLE_HINT.viewer}.
        </Hint>
        {error && <T tone="danger" style={{ marginTop: 8 }}>{error}</T>}
      </Card>

      {isOwner && <InviteSection b={b} run={run} />}

      <Card style={{ gap: 10 }}>
        {(!isOwner || owners > 1) && (
          <Button
            title="Выйти из бюджета"
            kind="secondary"
            icon={<LogOut size={18} color={t.text} />}
            onPress={() =>
              ask(`Выйти из бюджета «${b.name}»?`, 'Вернуться можно будет только по новому приглашению.', 'Выйти', async () => {
                await budgetsApi.removeMember(b.id, user!.id);
                onGone();
              })
            }
          />
        )}
        {isOwner && (
          <Button
            title="Удалить бюджет"
            kind="danger"
            icon={<Trash2 size={18} color={t.danger} />}
            onPress={() =>
              ask(`Удалить бюджет «${b.name}»?`, 'Он удалится для всех участников, его операции станут недоступны.', 'Удалить', async () => {
                await budgetsApi.remove(b.id);
                onGone();
              })
            }
          />
        )}
      </Card>
    </>
  );
}

function InviteSection({ b, run }: { b: Budget; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const t = useTheme();
  const invites = useBudgetInvites(b.id, true);
  const candidates = useCandidates(b.id, true);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'member' | 'viewer'>('member');
  const list = candidates.data ?? [];
  const picked = list.some((c) => c.userId === userId) ? userId : '';

  return (
    <Card style={{ gap: 10 }}>
      <SectionTitle>Пригласить</SectionTitle>
      {list.length ? (
        <>
          <Select
            value={picked}
            placeholder="Выберите пользователя"
            options={list.map((c) => ({ value: c.userId, label: c.name, hint: c.login ?? undefined }))}
            onChange={setUserId}
          />
          <Select
            value={role}
            options={[
              { value: 'member', label: 'участник' },
              { value: 'viewer', label: 'наблюдатель' },
            ]}
            onChange={setRole}
          />
          <Button
            title="Пригласить"
            disabled={!picked}
            onPress={() =>
              void run(async () => {
                await budgetsApi.invite(b.id, picked, role);
                setUserId('');
              })
            }
          />
        </>
      ) : (
        <Hint>Пригласить некого: все пользователи с разрешением «Общие бюджеты» уже в бюджете или приглашены.</Hint>
      )}
      {(invites.data ?? []).map((i) => (
        <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          <View style={{ flex: 1 }}>
            <T weight="600">{i.userName}</T>
            <T size={12} tone="muted">приглашён как {ROLE_LABEL[i.role]}, ждём ответа</T>
          </View>
          <Pressable hitSlop={6} onPress={() => void run(() => budgetsApi.deleteInvite(b.id, i.id))}>
            <X size={18} color={t.muted} />
          </Pressable>
        </View>
      ))}
      <Hint>
        В списке только пользователи, которым администратор разрешил общие бюджеты. Приглашённый увидит приглашение у себя и сам решит, принять ли его.
      </Hint>
    </Card>
  );
}

/** Приглашения, адресованные мне. */
export function IncomingInvites() {
  const { user } = useSession();
  const { setBudgetId } = useBudget();
  const { data = [] } = useIncomingInvites(!!user?.canShare);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data.length) return null;

  const reply = async (id: string, accept: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const r = await budgetsApi.answer(id, accept);
      if (accept && r.budgetId) setBudgetId(r.budgetId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <SectionTitle>Вас пригласили</SectionTitle>
      {data.map((i) => (
        <View key={i.id} style={{ gap: 8 }}>
          <View>
            <T weight="600">{i.budgetName}</T>
            <T size={13} tone="muted">
              {i.invitedBy ? `${i.invitedBy} приглашает` : 'Приглашение'} как {ROLE_LABEL[i.role]}а: {ROLE_HINT[i.role]}
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SmallBtn title="Принять" primary disabled={busy} onPress={() => void reply(i.id, true)} />
            <SmallBtn title="Отклонить" disabled={busy} onPress={() => void reply(i.id, false)} />
          </View>
        </View>
      ))}
      <Hint>Ваш личный бюджет участники не увидят.</Hint>
      {error && <T tone="danger">{error}</T>}
    </Card>
  );
}

function CreateBudgetSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { budget } = useBudget();
  const [name, setName] = useState('Семья');
  const [currency, setCurrency] = useState(budget.currency ?? DEFAULT_CURRENCY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const b = await budgetsApi.create({ name: name.trim(), currency });
      onCreated(b.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось создать');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title="Общий бюджет" onClose={onClose}>
      <Field label="Название" value={name} onChangeText={setName} maxLength={100} />
      <CurrencySelect value={currency} onChange={setCurrency} />
      <Hint>Появится кошелёк и стартовые категории. Потом пригласите участников.</Hint>
      {error && <T tone="danger">{error}</T>}
      <Button title="Создать" onPress={submit} loading={busy} />
    </Sheet>
  );
}
