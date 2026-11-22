import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, TextInput, View } from 'react-native';
import { ArrowDown, Trash2 } from 'lucide-react-native';
import { addDays, amountToInput, currencySymbol, formatMoney, isCredit, parseAmount, todayISO, type Account, type Transaction } from '@selfinance/shared';
import { ApiError } from '../api';
import { crossApi, deleteTx, useBudgetAccounts } from '../data';
import { DateStepper, Hint, RoundBtn, Select, Sheet } from '../kit';
import { AccountSelect } from '../pickers';
import { useBudget, useSession } from '../session';
import { useTheme } from '../theme';
import { Button, Chip, Field, T } from '../ui';

const usable = (list: Account[] = []) => list.filter((a) => !a.isArchived);
const firstFree = (list: Account[]) => list.find((a) => !a.isFrozen && !isCredit(a))?.id ?? list[0]?.id ?? '';

/** Перевод между бюджетами: новый (без tx) или просмотр и правка существующего. */
export function CrossSheet({ visible, tx, onClose }: { visible: boolean; tx?: Transaction; onClose: () => void }) {
  const outgoing = tx ? tx.amount < 0 : true;
  const other = tx?.linkedBudget?.name ?? 'другой бюджет';
  const title = tx ? (outgoing ? `В бюджет «${other}»` : `Из бюджета «${other}»`) : 'Перевод между бюджетами';
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      {visible && <CrossForm tx={tx} onClose={onClose} />}
    </Sheet>
  );
}

function CrossForm({ tx, onClose }: { tx?: Transaction; onClose: () => void }) {
  const t = useTheme();
  const { user } = useSession();
  const { budgets, budget, budgetId, canEdit } = useBudget();
  const today = todayISO(user?.timezone);
  const writable = budgets.filter((b) => b.role !== 'viewer');

  const [fromBudget, setFromBudget] = useState(budget.role !== 'viewer' ? budget.id : writable[0]?.id ?? '');
  const [toBudget, setToBudget] = useState(() => writable.find((b) => b.id !== fromBudget)?.id ?? '');
  const fromData = useBudgetAccounts(tx ? '' : fromBudget).data;
  const toData = useBudgetAccounts(tx ? '' : toBudget).data;
  const fromAccs = useMemo(() => usable(fromData), [fromData]);
  const toAccs = useMemo(() => usable(toData), [toData]);
  const [fromAcc, setFromAcc] = useState('');
  const [toAcc, setToAcc] = useState('');
  const [amountStr, setAmountStr] = useState(tx ? amountToInput(Math.abs(tx.amount)) : '');
  const [date, setDate] = useState(tx?.date ?? today);
  const [comment, setComment] = useState(tx?.comment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fromAccs.some((a) => a.id === fromAcc)) setFromAcc(firstFree(fromAccs));
  }, [fromAccs, fromAcc]);
  useEffect(() => {
    if (!toAccs.some((a) => a.id === toAcc)) setToAcc(firstFree(toAccs));
  }, [toAccs, toAcc]);
  useEffect(() => {
    if (toBudget === fromBudget) setToBudget(writable.find((b) => b.id !== fromBudget)?.id ?? '');
  }, [fromBudget, toBudget, writable]);

  const amount = parseAmount(amountStr);

  async function submit() {
    setError(null);
    setFields({});
    if (amount === null || amount <= 0) return setFields({ amount: 'Введите сумму больше нуля' });
    setBusy(true);
    try {
      if (tx) await crossApi.update(tx.transferGroupId!, { amount, date, comment: comment || null });
      else
        await crossApi.create({ fromBudgetId: fromBudget, fromAccountId: fromAcc, toBudgetId: toBudget, toAccountId: toAcc, amount, date, comment: comment || null });
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

  const onDelete = () =>
    tx &&
    Alert.alert('Удалить перевод?', 'Он исчезнет из обоих бюджетов.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteTx(budgetId, tx.id)
            .then(onClose)
            .catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось удалить')),
      },
    ]);

  const outgoing = tx ? tx.amount < 0 : true;
  const other = tx?.linkedBudget?.name ?? 'другой бюджет';

  return (
    <>
      <Hint>
        {tx
          ? `${outgoing ? `Ушло из «${budget.name}» в «${other}».` : `Пришло из «${other}» в «${budget.name}».`} В доходы и расходы не входит. Изменения применяются сразу в обоих бюджетах.`
          : 'Деньги уйдут со счёта одного бюджета и придут на счёт другого. В доходы и расходы не входит.'}
      </Hint>

      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            value={amountStr}
            onChangeText={setAmountStr}
            placeholder="0"
            placeholderTextColor={t.faint}
            autoFocus={!tx}
            editable={canEdit}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
            style={{ flex: 1, fontSize: 40, fontWeight: '700', color: t.text, fontVariant: ['tabular-nums'], paddingVertical: 4 }}
          />
          <T size={32} tone="muted" weight="600">{currencySymbol(budget.currency)}</T>
        </View>
        {fields.amount ? (
          <T tone="danger" size={13}>{fields.amount}</T>
        ) : amount !== null && /[+\-*/]/.test(amountStr) ? (
          <T tone="muted">= {formatMoney(amount)}</T>
        ) : null}
      </View>

      {!tx && (
        <View style={{ gap: 12 }}>
          <Select label="Из бюджета" value={fromBudget} options={writable.map((b) => ({ value: b.id, label: b.name }))} onChange={setFromBudget} />
          <AccountSelect label="Со счёта" accounts={fromAccs} value={fromAcc} onChange={setFromAcc} />
          <View style={{ alignItems: 'center' }}>
            <ArrowDown size={20} color={t.muted} />
          </View>
          <Select
            label="В бюджет"
            value={toBudget}
            options={writable.filter((b) => b.id !== fromBudget).map((b) => ({ value: b.id, label: b.name }))}
            onChange={setToBudget}
          />
          <AccountSelect label="На счёт" accounts={toAccs} value={toAcc} onChange={setToAcc} />
          {(fields.fromAccountId || fields.toAccountId || fields.toBudgetId) && (
            <T tone="danger" size={13}>{fields.fromAccountId || fields.toAccountId || fields.toBudgetId}</T>
          )}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <T tone="muted" size={13}>Дата</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[0, -1, -2].map((d) => {
            const v = addDays(today, d);
            return <Chip key={d} label={d === 0 ? 'Сегодня' : d === -1 ? 'Вчера' : 'Позавчера'} active={date === v} onPress={() => setDate(v)} />;
          })}
        </View>
        <DateStepper date={date} today={today} onChange={setDate} />
      </View>

      <Field label="Комментарий" value={comment} onChangeText={setComment} placeholder="Необязательно" maxLength={500} editable={canEdit} />

      {error && <T tone="danger">{error}</T>}
      {canEdit && (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {tx && (
            <RoundBtn onPress={onDelete}>
              <Trash2 size={20} color={t.danger} />
            </RoundBtn>
          )}
          <Button title={tx ? 'Сохранить' : 'Перевести'} onPress={submit} loading={busy} style={{ flex: 1 }} />
        </View>
      )}
    </>
  );
}
