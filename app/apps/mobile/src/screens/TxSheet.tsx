import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react-native';
import {
  addDays,
  amountToInput,
  currencySymbol,
  dayTitle,
  formatMoney,
  getCurrentCurrency,
  isCredit,
  parseAmount,
  todayISO,
  type Account,
  type Transaction,
  type TxType,
} from '@selfinance/shared';
import { ApiError } from '../api';
import { deleteTx, describeTx, saveTx, useLookups } from '../data';
import { CatIcon } from '../icons';
import { useBudget, useSession } from '../session';
import { KEYS, load, save } from '../storage';
import { radius, useTheme } from '../theme';
import { Button, Chip, Field, Money, Segmented, T } from '../ui';

export interface TxSheetOptions {
  tx?: Transaction;
  type?: 'expense' | 'income' | 'transfer';
}

export function TxSheet({ opts, onClose }: { opts: TxSheetOptions | null; onClose: () => void }) {
  const t = useTheme();
  return (
    <Modal
      visible={!!opts}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: t.card }}>{opts && <TxForm opts={opts} onClose={onClose} />}</View>
    </Modal>
  );
}

function TxForm({ opts, onClose }: { opts: TxSheetOptions; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { budgetId, canEdit } = useBudget();
  const l = useLookups();
  const today = todayISO(user?.timezone);
  const edit = opts.tx;

  // переводы между бюджетами и корректировки пока меняются только в веб-версии
  const readOnly = !canEdit || edit?.type === 'adjustment';

  const active = useMemo(() => l.accounts.filter((a) => !a.isArchived), [l.accounts]);
  const defaultAcc = (preferred?: string | null) =>
    active.find((a) => a.id === preferred)?.id ?? active.find((a) => !a.isFrozen && !isCredit(a))?.id ?? active[0]?.id ?? '';

  const [type, setType] = useState<TxType>(edit?.type ?? opts.type ?? 'expense');
  const [amountStr, setAmountStr] = useState(edit ? amountToInput(edit.amount) : '');
  const [categoryId, setCategoryId] = useState<string | null>(edit?.categoryId ?? null);
  const [accountId, setAccountId] = useState(edit?.accountId ?? '');
  const [toAccountId, setToAccountId] = useState(edit?.toAccountId ?? '');
  const [date, setDate] = useState(edit?.date ?? today);
  const [comment, setComment] = useState(edit?.comment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const touchedAcc = useRef(false);

  // счёт по умолчанию — последний использованный в этом бюджете
  useEffect(() => {
    if (edit || touchedAcc.current || !active.length) return;
    load<string>(KEYS.lastAccount(budgetId)).then((last) => {
      if (touchedAcc.current) return;
      const acc = defaultAcc(last);
      setAccountId(acc);
      if (type === 'transfer') setToAccountId((cur) => cur || active.find((a) => a.id !== acc)?.id || '');
    });
  }, [active.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const amount = parseAmount(amountStr);
  const isExpr = /[+\-*/]/.test(amountStr.replace(/^-/, ''));

  const catType = type === 'income' ? 'income' : 'expense';
  const tops = useMemo(
    () =>
      l.categories
        .filter((c) => c.type === catType && !c.parentId && (!c.isArchived || c.id === categoryId))
        .sort((a, b) => a.sort - b.sort),
    [l.categories, catType, categoryId],
  );
  const selected = l.category(categoryId);
  const selectedTop = selected?.parentId ? l.category(selected.parentId) : selected;
  const subs = selectedTop
    ? l.categories.filter((c) => c.parentId === selectedTop.id && (!c.isArchived || c.id === categoryId)).sort((a, b) => a.sort - b.sort)
    : [];

  const switchType = (next: TxType) => {
    setType(next);
    if (selected && selected.type !== (next === 'income' ? 'income' : 'expense')) setCategoryId(null);
    if (next === 'transfer' && !toAccountId) setToAccountId(active.find((a) => a.id !== accountId)?.id ?? '');
  };

  const pickAccount = (id: string) => {
    touchedAcc.current = true;
    setAccountId(id);
    if (type === 'transfer' && id === toAccountId) setToAccountId(active.find((a) => a.id !== id)?.id ?? '');
  };

  async function submit() {
    setError(null);
    setFields({});
    if (amount === null || amount <= 0) return setFields({ amount: 'Введите сумму' });
    if (type === 'transfer') {
      if (active.length < 2) return setError('Для перевода нужно хотя бы два счёта');
      if (!accountId || !toAccountId || accountId === toAccountId) return setError('Выберите разные счета');
    }
    setBusy(true);
    try {
      await saveTx(
        budgetId,
        {
          type,
          amount,
          date,
          accountId: accountId || null,
          toAccountId: type === 'transfer' ? toAccountId || null : null,
          categoryId: type === 'income' || type === 'expense' ? categoryId : null,
          comment: comment.trim() || null,
        },
        edit?.id,
      );
      if (accountId && type !== 'transfer') void save(KEYS.lastAccount(budgetId), accountId);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
      } else setError('Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  function onDelete() {
    if (!edit) return;
    Alert.alert('Удалить операцию?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTx(budgetId, edit.id);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось удалить');
          }
        },
      },
    ]);
  }

  const title = edit ? 'Операция' : 'Новая операция';
  const showAccount = active.length > 1 || type === 'transfer';
  const sym = currencySymbol(getCurrentCurrency());
  const amountColor = type === 'income' ? t.income : type === 'expense' ? t.expense : t.text;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: Platform.OS === 'ios' ? 14 : insets.top + 8,
          paddingBottom: 8,
        }}
      >
        <T size={18} weight="700">{title}</T>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {edit && canEdit && !(edit.type === 'adjustment' && edit.linkedBudget) && (
            <RoundBtn onPress={onDelete}>
              <Trash2 size={20} color={t.danger} />
            </RoundBtn>
          )}
          <RoundBtn onPress={onClose}>
            <X size={20} color={t.text} />
          </RoundBtn>
        </View>
      </View>

      {readOnly && edit ? (
        <ReadOnlyTx tx={edit} />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 24 }}
        >
          <Segmented
            value={type as 'expense' | 'income' | 'transfer'}
            onChange={switchType}
            options={[
              { value: 'expense', label: 'Расход', tone: 'expense' },
              { value: 'income', label: 'Доход', tone: 'income' },
              { value: 'transfer', label: 'Перевод' },
            ]}
          />

          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={amountStr}
                onChangeText={setAmountStr}
                placeholder="0"
                placeholderTextColor={t.faint}
                autoFocus={!edit}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
                returnKeyType="done"
                style={{
                  flex: 1,
                  fontSize: 40,
                  fontWeight: '700',
                  color: amountColor,
                  fontVariant: ['tabular-nums'],
                  paddingVertical: 4,
                }}
              />
              <T size={32} tone="muted" weight="600">{sym}</T>
            </View>
            {isExpr && amount !== null && <T tone="muted">= {formatMoney(amount)}</T>}
            {fields.amount && <T tone="danger" size={13}>{fields.amount}</T>}
          </View>

          {type !== 'transfer' && (
            <View style={{ gap: 10 }}>
              <T tone="muted" size={13}>Категория</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
                {tops.map((c) => {
                  const on = selectedTop?.id === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setCategoryId(on && selected?.id === c.id ? null : c.id)}
                      style={{ width: '25%', alignItems: 'center', gap: 6 }}
                    >
                      <View style={{ borderRadius: 26, borderWidth: 2, borderColor: on ? c.color || t.accent : 'transparent', padding: 2 }}>
                        <CatIcon name={c.icon} color={c.color} size={44} />
                      </View>
                      <T size={12} numberOfLines={2} style={{ textAlign: 'center', paddingHorizontal: 2 }} weight={on ? '600' : '400'}>
                        {c.name}
                      </T>
                    </Pressable>
                  );
                })}
                {!tops.length && <T tone="faint">Категорий нет — операция попадёт в «Без категории»</T>}
              </View>
              {subs.length > 0 && selectedTop && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Chip label={`Весь «${selectedTop.name}»`} active={selected?.id === selectedTop.id} onPress={() => setCategoryId(selectedTop.id)} color={selectedTop.color ?? undefined} />
                  {subs.map((s) => (
                    <Chip key={s.id} label={s.name} active={selected?.id === s.id} onPress={() => setCategoryId(s.id)} color={selectedTop.color ?? undefined} />
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {showAccount && (
            <AccountPicker label={type === 'transfer' ? 'Откуда' : 'Счёт'} accounts={active} value={accountId} onChange={pickAccount} />
          )}
          {type === 'transfer' && (
            <AccountPicker
              label="Куда"
              accounts={active.filter((a) => a.id !== accountId)}
              value={toAccountId}
              onChange={setToAccountId}
            />
          )}

          <DatePicker date={date} today={today} onChange={setDate} />

          <Field label="Комментарий" value={comment} onChangeText={setComment} placeholder="Необязательно" error={fields.comment} />

          {error && <T tone="danger">{error}</T>}
          <Button title={edit ? 'Сохранить' : 'Добавить'} onPress={submit} loading={busy} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function RoundBtn({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.input, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </Pressable>
  );
}

function AccountPicker({ label, accounts, value, onChange }: { label: string; accounts: Account[]; value: string; onChange: (id: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <T tone="muted" size={13}>{label}</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {accounts.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            active={a.id === value}
            onPress={() => onChange(a.id)}
            color={isCredit(a) ? t.credit : a.isFrozen ? t.frozen : undefined}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function DatePicker({ date, today, onChange }: { date: string; today: string; onChange: (d: string) => void }) {
  const t = useTheme();
  const quick = [
    { d: today, label: 'Сегодня' },
    { d: addDays(today, -1), label: 'Вчера' },
    { d: addDays(today, -2), label: 'Позавчера' },
  ];
  return (
    <View style={{ gap: 8 }}>
      <T tone="muted" size={13}>Дата</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {quick.map((q) => (
          <Chip key={q.d} label={q.label} active={date === q.d} onPress={() => onChange(q.d)} />
        ))}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: t.input,
          borderRadius: radius.item,
          minHeight: 48,
          paddingHorizontal: 6,
        }}
      >
        <Pressable hitSlop={8} onPress={() => onChange(addDays(date, -1))} style={{ padding: 8 }}>
          <ChevronLeft size={20} color={t.text} />
        </Pressable>
        <T weight="600">{dayTitle(date, today)}</T>
        <Pressable hitSlop={8} onPress={() => onChange(addDays(date, 1))} style={{ padding: 8 }}>
          <ChevronRight size={20} color={t.text} />
        </Pressable>
      </View>
    </View>
  );
}

function ReadOnlyTx({ tx }: { tx: Transaction }) {
  const l = useLookups();
  const { user } = useSession();
  const { canEdit } = useBudget();
  const d = describeTx(tx, l);
  return (
    <View style={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CatIcon name={d.icon} color={d.color} size={48} />
        <View style={{ flex: 1 }}>
          <T size={17} weight="600">{d.title}</T>
          {!!d.sub && <T tone="muted">{d.sub}</T>}
        </View>
      </View>
      <Money value={tx.amount} sign={tx.type === 'adjustment' ? 'always' : 'never'} size={32} weight="700" />
      <T tone="muted">{dayTitle(tx.date, todayISO(user?.timezone))}</T>
      <T tone="faint" size={13}>
        {!canEdit
          ? 'У вас доступ только для просмотра этого бюджета.'
          : tx.linkedBudget
            ? 'Переводы между бюджетами пока редактируются в веб-версии.'
            : 'Корректировки пока редактируются в веб-версии.'}
      </T>
    </View>
  );
}
