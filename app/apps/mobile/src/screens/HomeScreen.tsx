import { useState, type ReactNode } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { MONTHS_DAT, MONTHS_PREP, monthRange, monthTitle, shiftMonth, todayISO } from '@selfinance/shared';
import { recurringApi, useCapital, useLimits, useLookups, usePlanned, useSummary, useTxFeed, useUpcoming } from '../data';
import { useNav } from '../nav';
import { invalidateAll } from '../query';
import { useBudget, useSession } from '../session';
import { useTheme } from '../theme';
import { TxDays } from '../TxList';
import { Button, Card, ErrorBox, SectionTitle, Skeleton, T } from '../ui';
import { AccountsList, AfterPlans, AheadTitle, CapitalView, CategoryBars, DaysChart, LimitCard, MonthTotals, PlanRow, UpcomingRow } from '../widgets';
import { LimitSheet } from './LimitSheet';
import { ForecastSheet, usePlanSheets } from './PlanSheets';

export function HomeScreen() {
  const t = useTheme();
  const nav = useNav();
  const { user } = useSession();
  const { budgetId, budgets, budget, canEdit } = useBudget();
  const today = todayISO(user?.timezone);
  const curMonth = today.slice(0, 7);
  const [month, setMonth] = useState(curMonth);
  const { from, to } = monthRange(month);

  const l = useLookups();
  const capital = useCapital();
  const summary = useSummary(from, to);
  const recent = useTxFeed({}, 8);
  const limits = useLimits(month);
  const planned = usePlanned();
  const upcoming = useUpcoming();
  const plans = usePlanSheets(l);
  const [limitOpen, setLimitOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [pulling, setPulling] = useState(false);

  const prevIdx = Number(shiftMonth(month, -1).slice(5)) - 1;
  const label = { prep: MONTHS_PREP[prevIdx], dat: MONTHS_DAT[prevIdx] };
  const upItems = upcoming.data ?? [];
  const planItems = planned.data?.items ?? [];
  const shownPlans = planItems.slice(0, 5);
  const activeAccounts = capital.data?.accounts.filter((a) => !a.isArchived) ?? [];

  const onRefresh = async () => {
    setPulling(true);
    invalidateAll();
    await Promise.all([capital.refetch(), summary.refetch(), recent.reload()]);
    setPulling(false);
  };

  const run = (p: Promise<unknown>) => p.catch((e) => Alert.alert('Не получилось', e instanceof Error ? e.message : undefined));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={t.accent} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconBtn onPress={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={22} color={t.text} />
        </IconBtn>
        <View style={{ alignItems: 'center' }}>
          <T size={17} weight="700">{monthTitle(month)}</T>
          {budgets.length > 1 && <T size={12} tone="muted">{budget.name}</T>}
        </View>
        <IconBtn onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= curMonth}>
          <ChevronRight size={22} color={month >= curMonth ? t.faint : t.text} />
        </IconBtn>
      </View>

      {capital.data ? (
        <Card>
          <CapitalView c={capital.data} extra={planned.data && <AfterPlans data={planned.data} onPress={() => setForecastOpen(true)} />} />
        </Card>
      ) : capital.error ? (
        <Card><ErrorBox error={capital.error} onRetry={capital.refetch} /></Card>
      ) : (
        <Skeleton height={140} />
      )}

      {(upItems.length > 0 || planItems.length > 0) && (
        <Card>
          <SectionTitle right={canEdit ? <Link onPress={() => plans.create()}>+ План</Link> : undefined}>
            <AheadTitle />
          </SectionTitle>
          {upItems.map((u) => (
            <UpcomingRow
              key={u.recurring.id}
              u={u}
              l={l}
              canEdit={canEdit}
              onPay={() => nav.openTx({ recurring: u.recurring })}
              onSkip={() => void run(recurringApi(budgetId).skip(u.recurring.id))}
              onLink={() => u.match && void run(recurringApi(budgetId).link(u.recurring.id, u.match.id))}
            />
          ))}
          {shownPlans.map((p) => (
            <PlanRow key={p.id} p={p} l={l} onPress={() => plans.open(p)} />
          ))}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
            {upItems.length > 0 && <Link onPress={() => nav.push({ name: 'recurring' })}>Все регулярные</Link>}
            <Link onPress={() => nav.push({ name: 'planned' })}>
              {planItems.length > shownPlans.length ? `Ещё ${planItems.length - shownPlans.length} в планах` : 'Все планы'}
            </Link>
          </View>
        </Card>
      )}

      {limits.data && limits.data.month === month && (limits.data.overall || (canEdit && limits.data.isCurrent)) && (
        <Card>
          <LimitCard data={limits.data} onEdit={canEdit ? () => setLimitOpen(true) : undefined} />
        </Card>
      )}

      <Card>
        {summary.data ? (
          <>
            <MonthTotals s={summary.data} label={label} />
            <DaysChart s={summary.data} today={today} kind="both" />
          </>
        ) : summary.error ? (
          <ErrorBox error={summary.error} onRetry={summary.refetch} />
        ) : (
          <Skeleton height={180} />
        )}
      </Card>

      <Card>
        <SectionTitle right={<Link onPress={() => nav.setTab('ops')}>Все операции</Link>}>Последние операции</SectionTitle>
        {recent.loading && !recent.items.length ? (
          <Skeleton height={200} />
        ) : recent.error && !recent.items.length ? (
          <ErrorBox error={recent.error} onRetry={recent.reload} />
        ) : recent.items.length ? (
          <TxDays items={recent.items.slice(0, 8)} l={l} today={today} onOpen={(tx) => nav.openTx({ tx })} pendingIds={recent.pendingIds} />
        ) : (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }}>
            <T tone="muted">Здесь появятся ваши доходы и расходы.</T>
            {canEdit && <Button title="Добавить первую операцию" onPress={() => nav.openTx()} />}
          </View>
        )}
      </Card>

      <Card>
        <SectionTitle right={<Link onPress={() => nav.setTab('stats')}>Статистика</Link>}>Куда ушли деньги</SectionTitle>
        {summary.data && l.ready ? <CategoryBars s={summary.data} l={l} limits={limits.data?.categories} /> : <Skeleton height={140} />}
      </Card>

      {activeAccounts.length > 1 && (
        <Card>
          <SectionTitle right={<Link onPress={() => nav.push({ name: 'accounts' })}>Управлять</Link>}>Счета</SectionTitle>
          <AccountsList accounts={activeAccounts} />
        </Card>
      )}

      {plans.sheets}
      {planned.data && <ForecastSheet visible={forecastOpen} data={planned.data} onClose={() => setForecastOpen(false)} />}
      {limits.data && l.ready && (
        <LimitSheet visible={limitOpen} data={limits.data} l={l} month={curMonth} onClose={() => setLimitOpen(false)} />
      )}
    </ScrollView>
  );
}

function Link({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <T tone="accent" size={14} weight="600">{children}</T>
    </Pressable>
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
