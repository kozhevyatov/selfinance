import { useState, type ReactNode } from 'react';
import { Alert, Platform, View } from 'react-native';
import { Ban, HandCoins, Pencil, ShoppingCart, Trash2 } from 'lucide-react-native';
import {
  addDays,
  amountToInput,
  currencySymbol,
  getCurrentCurrency,
  parseAmount,
  todayISO,
  type Planned,
  type PlannedItem,
  type PlannedOverview,
} from '@selfinance/shared';
import { ApiError } from '../api';
import { plannedApi, type Lookups } from '../data';
import { shortDate } from '../format';
import { DateStepper, Divider, Hint, MenuRow, RoundBtn, Sheet, SwitchRow } from '../kit';
import { useNav } from '../nav';
import { AccountSelect, CategorySelect } from '../pickers';
import { useBudget, useSession } from '../session';
import { useTheme } from '../theme';
import { Button, Chip, Field, Money, Segmented, T } from '../ui';
import { PlanStatus, planWhen } from '../widgets';

type SheetState = { kind: 'card'; plan: PlannedItem } | { kind: 'edit'; plan: Planned | null; type?: 'income' | 'expense' };

/** Карточка плана и форма плана — для главной и экрана «Планы». */
export function usePlanSheets(l: Lookups) {
  const [state, setState] = useState<SheetState | null>(null);
  const close = () => setState(null);
  const sheets = (
    <>
      <PlanCard
        p={state?.kind === 'card' ? state.plan : null}
        l={l}
        onClose={close}
        onEdit={(p) => {
          // iOS не покажет новое окно, пока старое уезжает
          setState(null);
          setTimeout(() => setState({ kind: 'edit', plan: p }), Platform.OS === 'ios' ? 450 : 0);
        }}
      />
      <PlannedSheet
        visible={state?.kind === 'edit'}
        plan={state?.kind === 'edit' ? state.plan : null}
        initialType={state?.kind === 'edit' ? state.type : undefined}
        l={l}
        onClose={close}
        key={state?.kind === 'edit' ? state.plan?.id ?? 'new-' + (state.type ?? 'expense') : 'none'}
      />
    </>
  );
  return {
    create: (type: 'income' | 'expense' = 'expense') => setState({ kind: 'edit', plan: null, type }),
    open: (plan: PlannedItem) => setState({ kind: 'card', plan }),
    sheets,
  };
}

function PlanCard({ p, l, onClose, onEdit }: { p: PlannedItem | null; l: Lookups; onClose: () => void; onEdit: (p: PlannedItem) => void }) {
  const t = useTheme();
  const nav = useNav();
  const { budgetId, canEdit } = useBudget();
  if (!p) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;
  const cat = l.category(p.categoryId);
  const acc = l.account(p.accountId);
  const overdue = p.daysLeft !== null && p.daysLeft < 0;
  const income = p.type === 'income';

  const cancel = () =>
    Alert.alert(`Отменить план «${p.name}»?`, 'Его можно будет вернуть из списка отменённых.', [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Отменить план',
        style: 'destructive',
        onPress: () =>
          plannedApi(budgetId)
            .action(p.id, 'cancel')
            .then(onClose)
            .catch((e) => Alert.alert('Не получилось', e instanceof Error ? e.message : undefined)),
      },
    ]);

  return (
    <Sheet visible title={p.name} onClose={onClose}>
      <View style={{ gap: 4 }}>
        <Money value={p.amount} size={34} weight="700" tone={income ? 'income' : 'text'} />
        <T tone={overdue ? 'expense' : 'muted'}>{p.date ? planWhen(p) : 'Без даты — когда-нибудь'}</T>
        <PlanStatus p={p} />
        {(cat || acc || p.comment) && (
          <T tone="muted" size={13}>
            {[cat?.name, acc ? `${income ? 'на счёт' : 'со счёта'} «${acc.name}»` : null, p.comment].filter(Boolean).join(' · ')}
          </T>
        )}
      </View>
      {canEdit && (
        <View>
          <MenuRow
            icon={income ? <HandCoins size={19} color={t.income} /> : <ShoppingCart size={19} color={t.accent} />}
            title={income ? 'Внести поступление' : 'Внести покупку'}
            hint={income ? 'Деньги пришли — записать доход и закрыть план' : 'Уже купил — записать расход и закрыть план'}
            onPress={() => {
              onClose();
              nav.openTx({ planned: p }, true);
            }}
          />
          <Divider />
          <MenuRow icon={<Pencil size={18} color={t.text} />} title="Изменить" hint="Сумма, дата, название, категория" onPress={() => onEdit(p)} />
          <Divider />
          <MenuRow
            icon={<Ban size={18} color={t.text} />}
            title="Отменить план"
            hint={income ? 'Денег не будет — убрать из списка' : 'Передумал покупать — убрать из списка'}
            onPress={cancel}
          />
        </View>
      )}
    </Sheet>
  );
}

const QUICK = [
  { days: 7, label: 'Через неделю' },
  { days: 14, label: 'Через 2 недели' },
  { days: 30, label: 'Через месяц' },
];

function PlannedSheet({
  visible,
  plan,
  l,
  onClose,
  initialType = 'expense',
}: {
  visible: boolean;
  plan: Planned | null;
  l: Lookups;
  onClose: () => void;
  initialType?: 'income' | 'expense';
}) {
  const t = useTheme();
  const { user } = useSession();
  const { budgetId } = useBudget();
  const today = todayISO(user?.timezone);
  const [type, setType] = useState<'income' | 'expense'>(plan?.type ?? initialType);
  const income = type === 'income';
  const [name, setName] = useState(plan?.name ?? '');
  const [amount, setAmount] = useState(plan ? amountToInput(plan.amount) : '');
  const [date, setDate] = useState<string>(plan ? plan.date ?? '' : addDays(today, 7));
  const [categoryId, setCategoryId] = useState(plan?.categoryId ?? '');
  const [accountId, setAccountId] = useState(plan?.accountId ?? '');
  const [comment, setComment] = useState(plan?.comment ?? '');
  const [excludeFromLimit, setExclude] = useState(plan?.excludeFromLimit ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accounts = l.accounts.filter((a) => !a.isArchived && !a.isFrozen);
  const minDate = plan?.date && plan.date < today ? plan.date : today;

  async function submit() {
    setError(null);
    const a = parseAmount(amount);
    if (!name.trim()) return setError(income ? 'Укажите, откуда доход' : 'Укажите, что купить');
    if (!a || a <= 0) return setError('Введите сумму');
    setBusy(true);
    try {
      await plannedApi(budgetId).save(
        {
          type,
          name: name.trim(),
          amount: a,
          date: date || null,
          categoryId: categoryId || null,
          accountId: accountId || null,
          comment: comment.trim() || null,
          excludeFromLimit,
        },
        plan?.id,
      );
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  const remove = () =>
    plan &&
    Alert.alert(`Удалить план «${plan.name}»?`, undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          plannedApi(budgetId)
            .action(plan.id, 'delete')
            .then(onClose)
            .catch((e) => setError(e instanceof ApiError ? e.message : 'Не получилось')),
      },
    ]);

  return (
    <Sheet
      visible={visible}
      title={plan ? 'Изменить план' : income ? 'Запланировать доход' : 'Запланировать расход'}
      onClose={onClose}
      right={plan ? <RoundBtn onPress={remove}><Trash2 size={20} color={t.danger} /></RoundBtn> : undefined}
    >
      <Segmented
        value={type}
        onChange={(v) => {
          if (v !== type) {
            setType(v);
            setCategoryId('');
          }
        }}
        options={[
          { value: 'expense', label: 'Расход', tone: 'expense' },
          { value: 'income', label: 'Доход', tone: 'income' },
        ]}
      />
      <Field
        label={income ? 'Откуда деньги' : 'Что купить'}
        value={name}
        onChangeText={setName}
        placeholder={income ? 'Например, премия или возврат долга' : 'Например, зимняя резина'}
        maxLength={100}
      />
      <Field
        label="Сумма"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder={'0 ' + currencySymbol(getCurrentCurrency())}
      />
      <View style={{ gap: 8 }}>
        <T tone="muted" size={13}>Когда</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="Без даты" active={!date} onPress={() => setDate('')} />
          {QUICK.map((q) => {
            const v = addDays(today, q.days);
            return <Chip key={q.days} label={q.label} active={date === v} onPress={() => setDate(v)} />;
          })}
        </View>
        {date ? (
          <DateStepper date={date} today={today} onChange={setDate} min={minDate} />
        ) : (
          <Chip label="Выбрать дату" onPress={() => setDate(addDays(today, 1))} />
        )}
        {!date && <Hint>Без даты план не входит в прогноз — просто висит в списке «когда-нибудь».</Hint>}
      </View>
      <CategorySelect categories={l.categories} type={type} value={categoryId} onChange={setCategoryId} />
      {l.multiAccount && (
        <AccountSelect
          label={income ? 'На какой счёт придут' : 'С какого счёта платить'}
          accounts={accounts}
          value={accountId}
          onChange={setAccountId}
          empty={income ? 'Решу при поступлении' : 'Решу при покупке'}
        />
      )}
      <Field label="Комментарий" value={comment} onChangeText={setComment} placeholder="Необязательно" maxLength={500} />
      {!income && (
        <SwitchRow
          title="Не учитывать в лимите"
          hint="Покупка запланирована заранее и не съест месячный лимит"
          value={excludeFromLimit}
          onChange={setExclude}
        />
      )}
      {income && !!date && <Hint>Доход прибавится в прогнозе «После планов» и в ожидаемом приходе за месяц.</Hint>}
      {error && <T tone="danger">{error}</T>}
      <Button title={plan ? 'Сохранить' : 'Запланировать'} onPress={submit} loading={busy} />
    </Sheet>
  );
}

/** Расшифровка прогноза «После планов». */
export function ForecastSheet({ visible, data, onClose }: { visible: boolean; data: PlannedOverview; onClose: () => void }) {
  const t = useTheme();
  const row = (key: string, left: ReactNode, right: ReactNode, strong?: boolean, neg?: boolean) => (
    <View
      key={key}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        borderTopWidth: strong ? 1 : 0,
        borderTopColor: t.border,
        backgroundColor: neg ? t.expense + '12' : 'transparent',
      }}
    >
      <View style={{ flex: 1 }}>{left}</View>
      {right}
    </View>
  );
  return (
    <Sheet visible={visible} title="Как посчитано" onClose={onClose}>
      <Hint>
        Из свободных денег по порядку вычитаются регулярные платежи и запланированные покупки
        {data.horizon ? ` до ${shortDate(data.horizon)}` : ''}, а запланированные доходы прибавляются. Регулярные доходы не учитываются — прогноз
        осторожный.
      </Hint>
      <View>
        {row('start', <T weight="600">Свободно сейчас</T>, <Money value={data.free} weight="700" />)}
        {data.steps.map((s, i) =>
          row(
            s.kind + s.id + i,
            <T size={14}>
              <T size={12} tone="muted">{shortDate(s.date)} </T>
              {s.name}
              {s.kind === 'recurring' && <T size={12} tone="muted"> · регулярный</T>}
              {s.type === 'income' && <T size={12} tone="muted"> · доход</T>}
            </T>,
            <View style={{ alignItems: 'flex-end' }}>
              <T size={14} tone={s.type === 'income' ? 'income' : 'text'}>
                {s.type === 'income' ? '+' : '−'}
                {s.approx ? '≈' : ''}
                <Money value={s.amount} round size={14} tone={s.type === 'income' ? 'income' : 'text'} />
              </T>
              <T size={12} tone="muted">→ <Money value={s.balanceAfter} round size={12} weight="400" tone={s.balanceAfter < 0 ? 'expense' : 'muted'} /></T>
            </View>,
            false,
            s.balanceAfter < 0,
          ),
        )}
        {data.afterPlans !== null &&
          row(
            'total',
            <T weight="700">После планов</T>,
            <Money value={data.afterPlans} weight="700" tone={data.afterPlans < 0 ? 'expense' : 'text'} />,
            true,
          )}
      </View>
    </Sheet>
  );
}
