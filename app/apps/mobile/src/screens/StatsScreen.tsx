import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
  addDays,
  daysBetween,
  MONTHS_DAT,
  MONTHS_PREP,
  monthRange,
  monthTitle,
  rangeTitle,
  shiftMonth,
  todayISO,
  weekRange,
} from '@selfinance/shared';
import { ActivityCards, HeatCalendar, InsightCards, MatrixView, MonthlyTable, rateLabel } from '../StatsDetails';
import { DynamicsChart, StructureView } from '../charts';
import { useCapital, useDynamics, useInsights, useMatrix, useLimits, useLookups, useMembers, useSummary, type StatsFilter } from '../data';
import { DateStepper, Select, type Option } from '../kit';
import { invalidateAll } from '../query';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { Card, Chip, SectionTitle, Segmented, Skeleton, T } from '../ui';
import { AccountsList, CapitalView, DaysChart, ExpectedIncomeBox, LimitCard, MonthTotals, TypeTotals, type PrevLabel } from '../widgets';

type Mode = 'week' | 'month' | 'year' | 'range';
type Kind = 'all' | 'expense' | 'income';

export function StatsScreen() {
  const t = useTheme();
  const { user } = useSession();
  const today = todayISO(user?.timezone);
  const curMonth = today.slice(0, 7);
  const curYear = Number(today.slice(0, 4));
  const weekStart = user?.weekStart ?? 1;
  const curWeek = weekRange(today, weekStart);

  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);
  const [weekDate, setWeekDate] = useState(today);
  const [rFrom, setRFrom] = useState(addDays(today, -29));
  const [rTo, setRTo] = useState(today);
  const [kind, setKind] = useState<Kind>('all');
  const [structType, setStructType] = useState<'expense' | 'income'>('expense');
  const [catId, setCatId] = useState('');
  const [accId, setAccId] = useState('');
  const [userId, setUserId] = useState('');
  const [pulling, setPulling] = useState(false);

  let from: string;
  let to: string;
  let label: PrevLabel;
  if (mode === 'month') {
    ({ from, to } = monthRange(month));
    const i = Number(shiftMonth(month, -1).slice(5)) - 1;
    label = { prep: MONTHS_PREP[i], dat: MONTHS_DAT[i] };
  } else if (mode === 'week') {
    ({ from, to } = weekRange(weekDate, weekStart));
    label = { prep: 'прошлую неделю', dat: 'прошлой неделе' };
  } else if (mode === 'year') {
    from = `${year}-01-01`;
    to = `${year}-12-31`;
    label = { prep: 'прошлом году', dat: 'прошлому году' };
  } else {
    from = rFrom <= rTo ? rFrom : rTo;
    to = rFrom <= rTo ? rTo : rFrom;
    label = { prep: 'прошлом периоде', dat: 'прошлому периоду' };
  }

  const l = useLookups();
  const members = useMembers().data ?? [];
  const filter: StatsFilter = { categoryId: catId || null, accountId: accId || null, userId: userId || null };
  const filtered = !!(catId || accId || userId);
  const summary = useSummary(from, to);
  const prevFrom = summary.data?.prev.from ?? from;
  const prevTo = summary.data?.prev.to ?? to;
  const prev = useSummary(prevFrom, prevTo);
  const fSummary = useSummary(from, to, filter, filtered);
  const fPrev = useSummary(prevFrom, prevTo, filter, filtered);
  const dynTo = mode === 'year' ? `${year}-12` : mode === 'month' ? month : to.slice(0, 7);
  const dynMonth = dynTo > curMonth ? curMonth : dynTo;
  const dynamics = useDynamics(dynMonth, 12, filter);
  const insights = useInsights(from, to, filter);
  const sType = kind === 'all' ? structType : kind;
  const matrix = useMatrix(dynMonth, sType, 12, filter);
  const capital = useCapital();
  const limits = useLimits(mode === 'month' ? month : curMonth);

  const all = summary.data;
  const s = filtered ? (fSummary.data?.from === from && fSummary.data?.to === to ? fSummary.data : undefined) : all;
  const prevData = filtered ? fPrev.data : prev.data;
  const prevReady = !!prevData && !!s && prevData.from === s.prev.from;
  const showDays = !!s && daysBetween(from, to) <= 62;

  const typeCats = l.categories.filter((c) => c.type === kind && !c.isArchived);
  const catOptions: Option<string>[] = [
    { value: '', label: 'Все категории' },
    ...typeCats
      .filter((c) => !c.parentId)
      .flatMap((tp) => [
        { value: tp.id, label: tp.name },
        ...typeCats.filter((c) => c.parentId === tp.id).map((c) => ({ value: c.id, label: c.name, indent: true })),
      ]),
  ];

  const pickKind = (k: Kind) => {
    setKind(k);
    setCatId('');
  };

  const onRefresh = async () => {
    setPulling(true);
    invalidateAll();
    await Promise.all([summary.refetch(), dynamics.refetch(), capital.refetch(), insights.refetch(), matrix.refetch()]);
    setPulling(false);
  };

  const step = (back: () => void, title: string, fwd: () => void, fwdOff: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable hitSlop={8} onPress={back} style={{ padding: 6 }}>
        <ChevronLeft size={22} color={t.text} />
      </Pressable>
      <T weight="700" size={16}>{title}</T>
      <Pressable hitSlop={8} onPress={fwd} disabled={fwdOff} style={{ padding: 6, opacity: fwdOff ? 0.3 : 1 }}>
        <ChevronRight size={22} color={t.text} />
      </Pressable>
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={t.accent} />}
    >
      <T size={26} weight="700">Статистика</T>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'week', label: 'Неделя' },
          { value: 'month', label: 'Месяц' },
          { value: 'year', label: 'Год' },
          { value: 'range', label: 'Период' },
        ]}
      />
      {mode === 'month' && step(() => setMonth(shiftMonth(month, -1)), monthTitle(month), () => setMonth(shiftMonth(month, 1)), month >= curMonth)}
      {mode === 'week' &&
        step(
          () => setWeekDate(addDays(from, -7)),
          from === curWeek.from ? 'Эта неделя' : rangeTitle(from, to, today),
          () => setWeekDate(addDays(from, 7)),
          from >= curWeek.from,
        )}
      {mode === 'year' && step(() => setYear(year - 1), String(year), () => setYear(year + 1), year >= curYear)}
      {mode === 'range' && (
        <View style={{ gap: 8 }}>
          <T tone="muted" size={13}>С</T>
          <DateStepper date={rFrom} today={today} onChange={setRFrom} max={today} />
          <T tone="muted" size={13}>По</T>
          <DateStepper date={rTo} today={today} onChange={setRTo} max={today} />
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Всё" active={kind === 'all'} onPress={() => pickKind('all')} />
        <Chip label="Расходы" active={kind === 'expense'} onPress={() => pickKind('expense')} color={t.expense} />
        <Chip label="Доходы" active={kind === 'income'} onPress={() => pickKind('income')} color={t.income} />
      </View>
      {(kind !== 'all' || l.multiAccount || members.length > 1) && (
        <View style={{ gap: 8 }}>
          {kind !== 'all' && <Select value={catId} options={catOptions} onChange={setCatId} />}
          {l.multiAccount && (
            <Select
              value={accId}
              options={[
                { value: '', label: 'Все счета' },
                ...l.accounts.filter((a) => !a.isArchived || a.id === accId).map((a) => ({ value: a.id, label: a.name + (a.isArchived ? ' (архив)' : '') })),
              ]}
              onChange={setAccId}
            />
          )}
          {members.length > 1 && (
            <Select
              value={userId}
              options={[{ value: '', label: 'Все участники' }, ...members.map((m) => ({ value: m.userId, label: m.name }))]}
              onChange={setUserId}
            />
          )}
        </View>
      )}

      <Card>
        {s ? (
          <>
            {kind === 'all' ? <MonthTotals s={s} label={label} /> : <TypeTotals s={s} all={filtered ? all : undefined} kind={kind} label={label} />}
            {kind !== 'expense' && <ExpectedIncomeBox s={s} />}
            {kind === 'all' && !filtered && <T weight="600">Норма сбережений · {rateLabel(s.income, s.expense)}</T>}
            {showDays && <DaysChart s={s} today={today} kind={kind === 'all' ? 'both' : kind} />}
          </>
        ) : (
          <Skeleton height={180} />
        )}
      </Card>

      {mode === 'month' && kind !== 'income' && !filtered && limits.data?.month === month && limits.data.overall && (
        <Card>
          <LimitCard data={limits.data} />
        </Card>
      )}

      <Card>
        <SectionTitle>{kind === 'all' ? 'Динамика за 12 месяцев' : kind === 'expense' ? 'Расходы за 12 месяцев' : 'Доходы за 12 месяцев'}</SectionTitle>
        {dynamics.data ? (
          <DynamicsChart points={dynamics.data} current={mode === 'month' ? month : undefined} only={kind === 'all' ? undefined : kind} />
        ) : (
          <Skeleton height={190} />
        )}
      </Card>

      <Card>
        <SectionTitle>Структура</SectionTitle>
        {kind === 'all' && (
          <View style={{ marginBottom: 12 }}>
            <Segmented
              value={structType}
              onChange={setStructType}
              options={[
                { value: 'expense', label: 'Расходы', tone: 'expense' },
                { value: 'income', label: 'Доходы', tone: 'income' },
              ]}
            />
          </View>
        )}
        {s && l.ready ? (
          <StructureView
            key={sType + from + to + catId + accId + userId}
            type={sType}
            list={sType === 'expense' ? s.expenseByCategory : s.incomeByCategory}
            prev={prevReady ? (sType === 'expense' ? prevData!.expenseByCategory : prevData!.incomeByCategory) : undefined}
            l={l}
          />
        ) : (
          <Skeleton height={260} />
        )}
      </Card>

      {s && daysBetween(from, to) <= 400 && <HeatCalendar key={from + to + kind} s={s} today={today} weekStart={weekStart} kind={kind === 'income' ? 'income' : 'expense'} />}
      {insights.data && l.ready
        ? <>
          <InsightCards data={insights.data} kind={kind} l={l} weekStart={weekStart} />
          <ActivityCards data={insights.data} kind={sType} l={l} weekStart={weekStart} />
        </>
        : <Card>{insights.error ? <T tone="muted">Не удалось загрузить разбор операций</T> : <Skeleton height={180} />}</Card>}
      <Card>
        <SectionTitle>{catId ? 'Подкатегории по месяцам' : 'Категории по месяцам'}</SectionTitle>
        {kind === 'all' && <Segmented value={structType} onChange={setStructType} options={[{ value: 'expense', label: 'Расходы' }, { value: 'income', label: 'Доходы' }]} />}
        {matrix.data && l.ready ? <MatrixView data={matrix.data} l={l} sub={!!catId} /> :
          matrix.error ? <T tone="muted">Не удалось загрузить категории по месяцам</T> : <Skeleton height={140} />}
      </Card>
      {!filtered && <Card>
        <SectionTitle>{mode === 'year' ? `${year} год по месяцам` : '12 месяцев по цифрам'}</SectionTitle>
        {dynamics.data ? <MonthlyTable points={mode === 'year' ? dynamics.data.filter(p => p.month.startsWith(String(year))) : dynamics.data} /> : <Skeleton height={160} />}
      </Card>}
      <Card>
        <SectionTitle>Капитал бюджета по месяцам</SectionTitle>
        {dynamics.data ? <MonthlyTable points={dynamics.data} capital /> : <Skeleton height={160} />}
      </Card>

      <Card>
        <SectionTitle>Капитал сейчас</SectionTitle>
        {capital.data ? (
          <View style={{ gap: 12 }}>
            <CapitalView c={capital.data} />
            <AccountsList accounts={capital.data.accounts.filter((a) => !a.isArchived)} />
          </View>
        ) : (
          <Skeleton height={200} />
        )}
      </Card>
    </ScrollView>
  );
}
