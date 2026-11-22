import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { ChevronLeft, ChevronRight, Snowflake } from 'lucide-react-native';
import { isCredit, monthRange, monthTitle, shiftMonth, todayISO, type Account, type Capital, type Summary, type Transaction } from '@selfinance/shared';
import { useCapital, useLookups, useSummary, useTxFeed } from '../data';
import { invalidateAll } from '../query';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { TxDays } from '../TxList';
import { Button, Card, ErrorBox, Money, SectionTitle, Skeleton, T } from '../ui';

export function HomeScreen({ onOpenTx, onAdd, onAllOps }: { onOpenTx: (tx: Transaction) => void; onAdd: () => void; onAllOps: () => void }) {
  const t = useTheme();
  const { user } = useSession();
  const today = todayISO(user?.timezone);
  const curMonth = today.slice(0, 7);
  const [month, setMonth] = useState(curMonth);
  const { from, to } = monthRange(month);

  const l = useLookups();
  const capital = useCapital();
  const summary = useSummary(from, to);
  const recent = useTxFeed({}, 8);
  const [pulling, setPulling] = useState(false);

  const onRefresh = async () => {
    setPulling(true);
    invalidateAll();
    await Promise.all([capital.refetch(), summary.refetch(), recent.reload()]);
    setPulling(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={t.accent} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconBtn onPress={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={22} color={t.text} />
        </IconBtn>
        <T size={17} weight="700">{monthTitle(month)}</T>
        <IconBtn onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= curMonth}>
          <ChevronRight size={22} color={month >= curMonth ? t.faint : t.text} />
        </IconBtn>
      </View>

      {capital.data ? <CapitalCard c={capital.data} /> : capital.error ? <Card><ErrorBox error={capital.error} onRetry={capital.refetch} /></Card> : <Skeleton height={140} />}

      <Card>
        {summary.data ? <MonthTotals s={summary.data} isCurrent={month === curMonth} /> : summary.error ? <ErrorBox error={summary.error} onRetry={summary.refetch} /> : <Skeleton height={110} />}
      </Card>

      <Card>
        <SectionTitle
          right={
            <Pressable onPress={onAllOps} hitSlop={10}>
              <T tone="accent" size={14} weight="600">Все операции</T>
            </Pressable>
          }
        >
          Последние операции
        </SectionTitle>
        {recent.loading && !recent.items.length ? (
          <Skeleton height={200} />
        ) : recent.error && !recent.items.length ? (
          <ErrorBox error={recent.error} onRetry={recent.reload} />
        ) : recent.items.length ? (
          <TxDays items={recent.items} l={l} today={today} onOpen={onOpenTx} />
        ) : (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }}>
            <T tone="muted">Здесь появятся ваши доходы и расходы.</T>
            <Button title="Добавить первую операцию" onPress={onAdd} />
          </View>
        )}
      </Card>

      {capital.data && capital.data.accounts.filter((a) => !a.isArchived).length > 1 && (
        <Card>
          <SectionTitle>Счета</SectionTitle>
          <AccountsList accounts={capital.data.accounts.filter((a) => !a.isArchived)} />
        </Card>
      )}
    </ScrollView>
  );
}

function IconBtn({ children, onPress, disabled }: { children: ReactNode; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </Pressable>
  );
}

function CapitalCard({ c }: { c: Capital }) {
  const t = useTheme();
  const parts = [
    { v: Math.max(0, c.free - c.creditInFree), color: t.accent },
    { v: Math.max(0, c.frozen), color: t.frozen },
    { v: Math.max(0, c.creditInFree), color: t.credit },
  ].filter((p) => p.v > 0);
  const total = Math.max(1, parts.reduce((a, p) => a + p.v, 0));

  return (
    <Card style={{ gap: 12 }}>
      <View>
        <T tone="muted" size={13}>В обороте</T>
        <Money value={c.free} size={32} weight="700" tone={c.free < 0 ? 'expense' : 'text'} />
        {c.creditInFree > 0 && (
          <T tone="credit" size={13}>
            в том числе <Money value={c.creditInFree} size={13} weight="500" tone="credit" /> по кредиткам
          </T>
        )}
        {c.creditAvailable > 0 && (
          <T tone="credit" size={13}>
            доступно по кредиткам <Money value={c.creditAvailable} size={13} weight="500" tone="credit" />
          </T>
        )}
      </View>

      {parts.length > 1 && (
        <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
          {parts.map((p, i) => (
            <View key={i} style={{ flex: p.v / total, backgroundColor: p.color }} />
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Snowflake size={13} color={t.frozen} />
            <T tone="muted" size={13}>Заморожено</T>
          </View>
          <Money value={c.frozen} size={17} tone="frozen" />
        </View>
        <View style={{ flex: 1 }}>
          <T tone="muted" size={13}>Всего</T>
          <Money value={c.total} size={17} />
        </View>
        {c.debt > 0 && (
          <View style={{ flex: 1 }}>
            <T tone="muted" size={13}>Долг</T>
            <Money value={-c.debt} size={17} tone="credit" />
          </View>
        )}
      </View>
    </Card>
  );
}

function MonthTotals({ s, isCurrent }: { s: Summary; isCurrent: boolean }) {
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat label="Приход">
          <Money value={s.income} size={18} tone="income" />
        </Stat>
        <Stat label="Расход">
          <Money value={s.expense} size={18} tone="expense" />
        </Stat>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat label="Разница">
          <Money value={s.net} sign="always" size={18} />
        </Stat>
        <Stat label="В среднем в день">
          <Money value={s.avgPerDay} size={18} />
        </Stat>
      </View>
      {isCurrent && s.forecastExpense !== null && s.forecastExpense > 0 && (
        <T tone="muted" size={13}>
          При таком темпе расходы за месяц ≈ <Money value={s.forecastExpense} size={13} weight="600" tone="muted" />
        </T>
      )}
    </View>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T tone="muted" size={13}>{label}</T>
      {children}
    </View>
  );
}

const KIND_LABEL: Record<Account['kind'], string> = {
  cash: 'Наличные',
  bank: 'Карта / счёт',
  deposit: 'Вклад',
  savings: 'Накопления',
  credit: 'Кредитка',
  loan: 'Кредит',
};

function AccountsList({ accounts }: { accounts: Account[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: 2 }}>
      {accounts.map((a) => {
        const credit = isCredit(a);
        const sub = [a.bankName, KIND_LABEL[a.kind]].filter(Boolean).join(' · ');
        return (
          <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: credit ? t.credit : a.isFrozen ? t.frozen : a.color || t.accent,
              }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T weight="500" numberOfLines={1}>{a.name}</T>
              <T tone="muted" size={13} numberOfLines={1}>{sub}</T>
            </View>
            <Money value={a.balance} tone={credit ? 'credit' : a.isFrozen ? 'frozen' : a.balance < 0 ? 'expense' : 'text'} />
          </View>
        );
      })}
    </View>
  );
}
