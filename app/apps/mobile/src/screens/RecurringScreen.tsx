import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { amountToInput, currencySymbol, getCurrentCurrency, parseAmount, todayISO, type Recurring } from '@selfinance/shared';
import { ApiError } from '../api';
import { recurringApi, useLookups, useRecurring, type Lookups } from '../data';
import { daysUntil, dueLabel, PERIODS, REMIND, shortDate } from '../format';
import { CatIcon } from '../icons';
import { Hint, PageHeader, RoundBtn, Select, Sheet, SwitchRow } from '../kit';
import { useNav } from '../nav';
import { AccountSelect, CategorySelect } from '../pickers';
import { useBudget, useSession } from '../session';
import { useTheme } from '../theme';
import { Button, Card, Field, Money, SectionTitle, Segmented, Skeleton, T } from '../ui';
import { PausedIcon } from '../widgets';

export function RecurringScreen() {
  const t = useTheme();
  const nav = useNav();
  const { user } = useSession();
  const today = todayISO(user?.timezone);
  const rules = useRecurring();
  const l = useLookups();
  const { canEdit } = useBudget();
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);

  const list = rules.data ?? [];
  const active = list.filter((r) => !r.isPaused);
  const monthlyExpense = active.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const monthlyIncome = active.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PageHeader
        title="Регулярные платежи"
        onBack={nav.pop}
        right={
          canEdit ? (
            <Pressable hitSlop={8} onPress={() => setEditing('new')} style={{ padding: 6 }}>
              <Plus size={24} color={t.accent} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {(monthlyExpense > 0 || monthlyIncome > 0) && (
          <Card>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1 }}>
                <T tone="muted" size={13}>Обязательные расходы</T>
                <Money value={monthlyExpense} round size={19} tone="expense" />
              </View>
              <View style={{ flex: 1 }}>
                <T tone="muted" size={13}>Регулярные доходы</T>
                <Money value={monthlyIncome} round size={19} tone="income" />
              </View>
            </View>
          </Card>
        )}
        <Card>
          <SectionTitle>Каждый месяц</SectionTitle>
          {rules.data === undefined || !l.ready ? (
            <Skeleton height={200} />
          ) : list.length ? (
            list.map((r) => <RuleRow key={r.id} r={r} l={l} today={today} onPress={canEdit ? () => setEditing(r) : undefined} />)
          ) : (
            <View style={{ gap: 12 }}>
              <T tone="muted">
                Отметьте операцию переключателем «Регулярный платёж» — и за пару дней до следующего на главной появится напоминание.
              </T>
              {canEdit && <Button title="Добавить вручную" kind="secondary" onPress={() => setEditing('new')} />}
            </View>
          )}
        </Card>
      </ScrollView>

      <RecurringSheet
        key={editing === 'new' ? 'new' : editing?.id ?? 'none'}
        visible={!!editing}
        rule={editing === 'new' ? null : editing}
        l={l}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

function RuleRow({ r, l, today, onPress }: { r: Recurring; l: Lookups; today: string; onPress?: () => void }) {
  const cat = l.category(r.categoryId);
  const color = cat?.color ?? (cat?.parentId ? l.category(cat.parentId)?.color : null);
  const left = daysUntil(today, r.nextDue);
  const extra = [
    (r.intervalMonths ?? 1) > 1 ? PERIODS.find((x) => x.months === r.intervalMonths)?.label.toLowerCase() ?? `раз в ${r.intervalMonths} мес.` : null,
    r.dayPinned ? `всегда ${r.dayOfMonth}-го` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, opacity: r.isPaused ? 0.55 : pressed ? 0.6 : 1 })}
    >
      {r.isPaused ? <PausedIcon /> : <CatIcon name={cat?.icon ?? 'dots'} color={color} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="500" numberOfLines={1}>{r.name}</T>
        <T size={13} tone={left < 0 && !r.isPaused ? 'expense' : 'muted'}>
          {r.isPaused ? 'на паузе' : `${shortDate(r.nextDue)}, ${dueLabel(left)}`}
          {extra ? `, ${extra}` : ''}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T>
          {r.amountVaries ? '≈ ' : ''}
          <Money value={r.type === 'expense' ? -r.amount : r.amount} sign={r.type === 'income' ? 'always' : 'auto'} tone={r.type === 'income' ? 'income' : 'text'} />
        </T>
        {r.lastPaidDate && <T size={12} tone="faint">последний {shortDate(r.lastPaidDate)}</T>}
      </View>
    </Pressable>
  );
}

function RecurringSheet({ visible, rule, l, onClose }: { visible: boolean; rule: Recurring | null; l: Lookups; onClose: () => void }) {
  const t = useTheme();
  const { budgetId } = useBudget();
  const [name, setName] = useState(rule?.name ?? '');
  const [type, setType] = useState<'expense' | 'income'>(rule?.type ?? 'expense');
  const [amount, setAmount] = useState(rule ? amountToInput(rule.amount) : '');
  const [amountVaries, setAmountVaries] = useState(rule?.amountVaries ?? false);
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const [accountId, setAccountId] = useState(rule?.accountId ?? '');
  const [day, setDay] = useState(String(rule?.dayOfMonth ?? new Date().getDate()));
  const [dayPinned, setDayPinned] = useState(rule?.dayPinned ?? false);
  const [remindDays, setRemindDays] = useState(rule?.remindDays ?? 3);
  const [intervalMonths, setIntervalMonths] = useState(rule?.intervalMonths ?? 1);
  const [isPaused, setIsPaused] = useState(rule?.isPaused ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    const a = parseAmount(amount);
    const d = Number(day);
    if (!name.trim()) return setError('Укажите название');
    if (!a || a <= 0) return setError('Введите сумму');
    if (!(d >= 1 && d <= 31)) return setError('День месяца — от 1 до 31');
    setBusy(true);
    try {
      await recurringApi(budgetId).save(
        {
          name: name.trim(),
          ...(rule ? {} : { type }),
          amount: a,
          ...(rule ? { amountVaries } : {}),
          categoryId: categoryId || null,
          accountId: accountId || null,
          dayOfMonth: d,
          dayPinned,
          intervalMonths,
          remindDays,
          ...(rule ? { isPaused } : {}),
        },
        rule?.id,
      );
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  const onDelete = () =>
    rule &&
    Alert.alert(`Удалить регулярный платёж «${rule.name}»?`, 'Операции останутся.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          recurringApi(budgetId)
            .remove(rule.id)
            .then(onClose)
            .catch((e) => setError(e instanceof ApiError ? e.message : 'Не получилось')),
      },
    ]);

  return (
    <Sheet
      visible={visible}
      title={rule ? rule.name : 'Регулярный платёж'}
      onClose={onClose}
      right={rule ? <RoundBtn onPress={onDelete}><Trash2 size={20} color={t.danger} /></RoundBtn> : undefined}
    >
      {!rule && (
        <Segmented
          value={type}
          onChange={(v) => {
            setType(v);
            setCategoryId('');
          }}
          options={[
            { value: 'expense', label: 'Расход', tone: 'expense' },
            { value: 'income', label: 'Доход', tone: 'income' },
          ]}
        />
      )}
      <Field label="Название" value={name} onChangeText={setName} placeholder="Например, Интернет" maxLength={100} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="Сумма" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={'0 ' + currencySymbol(getCurrentCurrency())} />
        </View>
        <View style={{ width: 110 }}>
          <Field label="День месяца" value={day} onChangeText={(v) => setDay(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
        </View>
      </View>
      <CategorySelect categories={l.categories} type={rule?.type ?? type} value={categoryId} onChange={setCategoryId} />
      {l.multiAccount && (
        <AccountSelect accounts={l.accounts.filter((a) => !a.isArchived)} value={accountId} onChange={setAccountId} empty="Любой" />
      )}
      <Select label="Период" value={intervalMonths} options={PERIODS.map((p) => ({ value: p.months, label: p.label }))} onChange={setIntervalMonths} />
      <Select label="Напоминать" value={remindDays} options={REMIND} onChange={setRemindDays} />
      {intervalMonths > 1 && (
        <Hint>Следующая дата — последняя оплата плюс период. Пока оплат не было, напомню в ближайшее {Number(day) || 1}-е число.</Hint>
      )}
      <SwitchRow title="Закрепить день" hint="Иначе дата берётся из последней оплаты" value={dayPinned} onChange={setDayPinned} />
      {rule && (
        <>
          <SwitchRow title="Сумма меняется" hint="Показывать «≈» перед суммой" value={amountVaries} onChange={setAmountVaries} />
          <SwitchRow title="Пауза" hint="Не напоминать, пока не включите снова" value={isPaused} onChange={setIsPaused} />
        </>
      )}
      {error && <T tone="danger">{error}</T>}
      <Button title={rule ? 'Сохранить' : 'Добавить'} onPress={submit} loading={busy} />
    </Sheet>
  );
}
