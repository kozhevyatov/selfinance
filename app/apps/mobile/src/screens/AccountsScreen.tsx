import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Archive, ArrowLeftRight, CreditCard, Plus, Snowflake, Sun } from 'lucide-react-native';
import {
  amountToInput,
  creditAvailableOf,
  currencySymbol,
  debtOf,
  formatMoney,
  getCurrentCurrency,
  isCredit,
  isCreditKind,
  parseAmount,
  type Account,
  type AccountKind,
} from '@selfinance/shared';
import { ApiError } from '../api';
import { accountsApi, useAllAccounts, useCapital } from '../data';
import { Hint, PageHeader, Sheet, SwitchRow } from '../kit';
import { useNav } from '../nav';
import { useBudget } from '../session';
import { radius, useTheme } from '../theme';
import { Button, Card, Chip, Field, Money, SectionTitle, Skeleton, T } from '../ui';
import { AccountsList, CapitalView } from '../widgets';

const KINDS: { v: AccountKind; label: string }[] = [
  { v: 'cash', label: 'Наличные' },
  { v: 'bank', label: 'Банк' },
  { v: 'deposit', label: 'Вклад' },
  { v: 'savings', label: 'Копилка' },
  { v: 'credit', label: 'Кредитка' },
  { v: 'loan', label: 'Кредит' },
];

export function AccountsScreen() {
  const t = useTheme();
  const nav = useNav();
  const capital = useCapital();
  const all = useAllAccounts();
  const { canEdit } = useBudget();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const archived = (all.data ?? []).filter((a) => a.isArchived);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PageHeader
        title="Счета"
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
        {capital.data ? (
          <Card>
            <CapitalView c={capital.data} />
          </Card>
        ) : (
          <Skeleton height={140} />
        )}
        <Card>
          <SectionTitle>Мои счета</SectionTitle>
          {capital.data ? (
            <AccountsList accounts={capital.data.accounts.filter((a) => !a.isArchived)} onPress={canEdit ? setEditing : undefined} />
          ) : (
            <Skeleton height={160} />
          )}
          <Hint style={{ marginTop: 12 }}>
            Замороженные счета (вклады, копилки) не входят в свободные деньги. Чтобы заморозить или разморозить деньги, откройте счёт и сделайте
            перевод. Кредитки и кредиты — не ваши деньги: их долг вычитается из «Всего». Покупка с кредитки — обычный расход, погашение — перевод на неё.
          </Hint>
        </Card>
        {archived.length > 0 && (
          <Card>
            <SectionTitle>Архив</SectionTitle>
            <AccountsList accounts={archived} onPress={canEdit ? setEditing : undefined} />
          </Card>
        )}
      </ScrollView>

      <AccountSheet
        key={editing === 'new' ? 'new' : editing?.id ?? 'none'}
        visible={!!editing}
        account={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

function AccountSheet({ visible, account, onClose }: { visible: boolean; account: Account | null; onClose: () => void }) {
  const t = useTheme();
  const nav = useNav();
  const { budgetId } = useBudget();
  const { data: accounts = [] } = useAllAccounts();
  const api = accountsApi(budgetId);

  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank');
  const [bankName, setBankName] = useState(account?.bankName ?? '');
  const [isFrozen, setIsFrozen] = useState(account?.isFrozen ?? false);
  const [frozenTouched, setFrozenTouched] = useState(!!account);
  const [note, setNote] = useState(account?.note ?? '');
  const [includeInFree, setIncludeInFree] = useState(account?.includeInFree ?? false);
  const [creditLimit, setCreditLimit] = useState(account?.creditLimit ? amountToInput(account.creditLimit) : '');
  const [initial, setInitial] = useState('');
  // у кредитов вводим долг положительным числом, храним отрицательным балансом
  const [actual, setActual] = useState(account ? amountToInput(isCredit(account) ? Math.max(0, -account.balance) : account.balance) : '');
  const credit = isCreditKind(kind);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const pickKind = (k: AccountKind) => {
    setKind(k);
    if (!frozenTouched || isCreditKind(k)) setIsFrozen(k === 'deposit' || k === 'savings');
  };

  const fail = (e: unknown) => {
    if (e instanceof ApiError) {
      setError(e.message);
      setFields(e.fields);
    } else setError('Не получилось');
  };

  async function submit() {
    setError(null);
    setFields({});
    const init = initial.trim() ? parseAmount(initial) : 0;
    if (init === null) return setFields({ initialBalance: 'Не получается разобрать сумму' });
    const limit = kind === 'credit' && creditLimit.trim() ? parseAmount(creditLimit) : null;
    if (kind === 'credit' && creditLimit.trim() && (limit === null || limit < 0)) return setFields({ creditLimit: 'Не получается разобрать сумму' });
    if (!name.trim()) return setFields({ name: 'Укажите название' });
    setBusy(true);
    try {
      await api.save(
        {
          name: name.trim(),
          kind,
          isFrozen: credit ? false : isFrozen,
          creditLimit: kind === 'credit' ? limit : null,
          includeInFree: kind === 'credit' && includeInFree,
          bankName: kind === 'cash' ? null : bankName.trim() || null,
          note: note.trim() || null,
          ...(account ? {} : { initialBalance: credit ? -Math.abs(init) : init }),
        },
        account?.id,
      );
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function doReconcile() {
    if (!account) return;
    const parsed = parseAmount(actual);
    if (parsed === null) return setFields({ actual: 'Не получается разобрать сумму' });
    const v = isCredit(account) ? -Math.abs(parsed) : parsed;
    try {
      const r = await api.reconcile(account.id, v);
      Alert.alert(r.adjustment === 0 ? 'Баланс совпадает' : `Добавлена корректировка ${formatMoney(r.adjustment, { sign: 'always' })}`);
      onClose();
    } catch (e) {
      fail(e);
    }
  }

  function doArchive() {
    if (!account) return;
    if (account.isArchived) {
      api.save({ isArchived: false }, account.id).then(onClose, fail);
      return;
    }
    const go = () =>
      api.remove(account.id).then((r) => {
        if (r.archived) Alert.alert('По счёту есть операции, поэтому он перенесён в архив');
        onClose();
      }, fail);
    if (account.balance !== 0) {
      Alert.alert(`На счёте ${formatMoney(account.balance)}`, 'Всё равно убрать в архив?', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'В архив', style: 'destructive', onPress: go },
      ]);
    } else go();
  }

  const others = accounts.filter((a) => !a.isArchived && a.id !== account?.id);
  const frozenTarget = others.find((a) => a.isFrozen && !isCredit(a));
  const freeTarget = others.find((a) => !a.isFrozen && !isCredit(a));
  const accCredit = !!account && isCredit(account);
  const debt = account ? debtOf(account) : 0;
  const goTx = (o: Parameters<typeof nav.openTx>[0]) => {
    onClose();
    nav.openTx(o, true);
  };

  return (
    <Sheet visible={visible} title={account ? account.name : 'Новый счёт'} onClose={onClose}>
      {account && !account.isArchived && (
        <View style={{ gap: 12 }}>
          {accCredit ? (
            <CreditSummary account={account} debt={debt} />
          ) : (
            <View>
              <T tone="muted" size={13}>Остаток</T>
              <Money value={account.balance} size={30} weight="700" tone={account.isFrozen ? 'frozen' : 'text'} />
            </View>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <ActionChip icon={<ArrowLeftRight size={15} color={t.text} />} label="Перевести" onPress={() => goTx({ type: 'transfer', accountId: account.id })} />
            {accCredit && freeTarget && debt > 0 && (
              <ActionChip
                icon={<CreditCard size={15} color={t.credit} />}
                label="Погасить"
                onPress={() => goTx({ type: 'transfer', accountId: freeTarget.id, toAccountId: account.id })}
              />
            )}
            {!accCredit && !account.isFrozen && frozenTarget && (
              <ActionChip
                icon={<Snowflake size={15} color={t.frozen} />}
                label="Заморозить"
                onPress={() => goTx({ type: 'transfer', accountId: account.id, toAccountId: frozenTarget.id })}
              />
            )}
            {!accCredit && account.isFrozen && freeTarget && (
              <ActionChip
                icon={<Sun size={15} color={t.text} />}
                label="Разморозить"
                onPress={() => goTx({ type: 'transfer', accountId: account.id, toAccountId: freeTarget.id })}
              />
            )}
          </View>
        </View>
      )}

      <Field label="Название" value={name} onChangeText={setName} placeholder="Например, Т-Банк или Копилка «Отпуск»" maxLength={100} error={fields.name} />

      <View style={{ gap: 8 }}>
        <T tone="muted" size={13}>Тип</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map((k) => (
            <Chip key={k.v} label={k.label} active={kind === k.v} onPress={() => pickKind(k.v)} />
          ))}
        </View>
      </View>

      {kind !== 'cash' && <Field label="Банк" value={bankName} onChangeText={setBankName} placeholder="Необязательно" maxLength={100} />}

      {credit ? (
        <Hint>
          {kind === 'credit'
            ? 'Кредитка: покупки — обычные расходы, погашение — перевод на карту. Долг вычитается из капитала.'
            : 'Кредит или ипотека: долг вычитается из капитала. Платёж по кредиту — перевод на этот счёт, проценты — отдельный расход.'}
        </Hint>
      ) : (
        <SwitchRow
          title="Заморожено"
          hint="Деньги на этом счёте не входят в свободные — вклад или накопления"
          value={isFrozen}
          onChange={(v) => {
            setIsFrozen(v);
            setFrozenTouched(true);
          }}
        />
      )}

      {kind === 'credit' && (
        <>
          <Field
            label="Кредитный лимит"
            value={creditLimit}
            onChangeText={setCreditLimit}
            keyboardType="decimal-pad"
            placeholder="Например, 100 000"
            error={fields.creditLimit}
          />
          <SwitchRow
            title="Учитывать в доступных средствах"
            hint="Доступный лимит прибавится к свободным деньгам на главной и в прогнозе планов. Капитал («Всего») от этого не меняется."
            value={includeInFree}
            onChange={setIncludeInFree}
          />
        </>
      )}

      {!account && (
        <Field
          label={credit ? 'Сколько сейчас должны' : 'Сколько сейчас на счёте'}
          value={initial}
          onChangeText={setInitial}
          keyboardType="numbers-and-punctuation"
          placeholder={'0 ' + currencySymbol(getCurrentCurrency())}
          error={fields.initialBalance}
        />
      )}

      <Field label="Заметка" value={note} onChangeText={setNote} placeholder="Например, до 15 марта, 16%" maxLength={1000} />

      {account && !account.isArchived && (
        <View style={{ gap: 8 }}>
          <T tone="muted" size={13}>Сверить баланс</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={actual}
              onChangeText={setActual}
              keyboardType="numbers-and-punctuation"
              style={{
                flex: 1,
                minHeight: 50,
                borderRadius: radius.item,
                backgroundColor: t.input,
                color: t.text,
                paddingHorizontal: 14,
                fontSize: 16,
              }}
            />
            <Button title="Сверить" kind="secondary" onPress={doReconcile} />
          </View>
          {fields.actual ? (
            <T tone="danger" size={13}>{fields.actual}</T>
          ) : (
            <Hint>
              {accCredit
                ? 'Введите, сколько вы должны на самом деле — разница запишется корректировкой.'
                : 'Введите, сколько на счёте на самом деле — разница запишется корректировкой.'}
            </Hint>
          )}
        </View>
      )}

      {error && <T tone="danger">{error}</T>}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {account && (
          <Button
            title={account.isArchived ? 'Вернуть' : 'В архив'}
            kind="secondary"
            icon={<Archive size={18} color={t.text} />}
            onPress={doArchive}
          />
        )}
        <Button title={account ? 'Сохранить' : 'Добавить счёт'} onPress={submit} loading={busy} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

function ActionChip({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        minHeight: 38,
        borderRadius: 19,
        backgroundColor: t.input,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon}
      <T size={14} weight="600">{label}</T>
    </Pressable>
  );
}

/** Шапка кредитного счёта: долг, доступный остаток и заполненность лимита. */
function CreditSummary({ account, debt }: { account: Account; debt: number }) {
  const t = useTheme();
  const limit = account.kind === 'credit' ? account.creditLimit : null;
  const used = limit ? Math.min(100, Math.round((debt / limit) * 100)) : 0;
  return (
    <View style={{ gap: 6 }}>
      <T tone="muted" size={13}>{debt ? 'Долг' : account.balance > 0 ? 'Переплата' : 'Долга нет'}</T>
      <Money value={debt || Math.max(0, account.balance)} size={30} weight="700" tone="credit" />
      {limit ? (
        <>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.input, overflow: 'hidden' }}>
            <View style={{ width: `${used}%`, height: 8, backgroundColor: t.credit }} />
          </View>
          <T tone="muted" size={13}>
            Доступно <Money value={creditAvailableOf(account)} size={13} /> из {formatMoney(limit)}
          </T>
        </>
      ) : null}
    </View>
  );
}
