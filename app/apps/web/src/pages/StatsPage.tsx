import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  MONTHS_DAT,
  MONTHS_PREP,
  addDays,
  daysBetween,
  monthRange,
  monthTitle,
  rangeTitle,
  shiftMonth,
  todayISO,
  weekRange,
} from '@selfinance/shared';
import { DynamicsChart, StructureView } from '../components/Charts';
import { AccountsList, CapitalBlock, DaysChart, ExpectedIncomeBox, MonthTotals, TypeTotals, type PrevLabel } from '../components/HomeWidgets';
import { TopBar } from '../components/Layout';
import { LimitCard } from '../components/Limits';
import { Anomalies, CalendarHeat, CapitalSplitChart, KpiRow, MandatoryBlock, MatrixTable, MonthsTable, TopOps, WeekdaysChart } from '../components/StatsMore';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { useCapital, useCurrentMembers, useDynamics, useInsights, useLimits, useMatrix, useSummary, type StatsFilter } from '../lib/queries';

type Mode = 'month' | 'week' | 'year' | 'range';
type Kind = 'all' | 'expense' | 'income';

export function StatsPage() {
  const { user } = useAuth();
  const today = todayISO(user?.timezone);
  const curMonth = today.slice(0, 7);
  const curYear = Number(today.slice(0, 4));

  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);
  const [rFrom, setRFrom] = useState(addDays(today, -29));
  const [rTo, setRTo] = useState(today);
  const [structType, setStructType] = useState<'expense' | 'income'>('expense');
  const [kind, setKind] = useState<Kind>('all');
  const [catId, setCatId] = useState('');
  const [accId, setAccId] = useState('');
  const [userId, setUserId] = useState('');
  const weekStart = user?.weekStart ?? 1;
  const [weekDate, setWeekDate] = useState(today);
  const curWeek = weekRange(today, weekStart);

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
  const members = useCurrentMembers().data ?? [];
  const accounts = l.accounts.filter((a) => !a.isArchived || a.id === accId);
  const filter: StatsFilter = { categoryId: catId || null, accountId: accId || null, userId: userId || null };
  const filtered = !!(catId || accId || userId);
  const summary = useSummary(from, to);
  const prevFrom = summary.data?.prev.from ?? from;
  const prevTo = summary.data?.prev.to ?? to;
  const prev = useSummary(prevFrom, prevTo);
  // с фильтром — отдельные запросы: категория (с подкатегориями), счёт, участник
  const fSummary = useSummary(from, to, filter, filtered);
  const fPrev = useSummary(prevFrom, prevTo, filter, filtered);
  const dynTo = mode === 'year' ? `${year}-12` : mode === 'month' ? month : to.slice(0, 7);
  const dynMonth = dynTo > curMonth ? curMonth : dynTo;
  const dynamics = useDynamics(dynMonth, 12, filter);
  const insights = useInsights(from, to, filter);
  const matrixType: 'expense' | 'income' = kind === 'all' ? structType : kind;
  const matrix = useMatrix(dynMonth, matrixType, 12, filter);
  const capital = useCapital();
  const limits = useLimits(mode === 'month' ? month : curMonth);

  const all = summary.isPlaceholderData ? undefined : summary.data;
  const s = filtered ? (!fSummary.isPlaceholderData && fSummary.data?.from === from && fSummary.data?.to === to ? fSummary.data : undefined) : all;
  const prevData = filtered ? fPrev.data : prev.data;
  const prevReady = prevData && s && prevData.from === s.prev.from;
  const sType = kind === 'all' ? structType : kind;

  const typeCats = l.categories.filter((c) => c.type === kind && !c.isArchived);
  const typeTops = typeCats.filter((c) => !c.parentId);
  const pickKind = (k: Kind) => {
    setKind(k);
    setCatId('');
  };
  const showDays = s && daysBetween(from, to) <= 62;
  const showCalendar = s && daysBetween(from, to) <= 400;
  const ins = insights.data?.from === from && insights.data?.to === to ? insights.data : undefined;
  const mx = matrix.data;
  const insightFallback = insights.isError
    ? <p className="muted">Не удалось загрузить разбор операций. <button type="button" onClick={() => insights.refetch()}>Повторить</button></p>
    : <div className="skeleton" style={{ height: 160 }} />;

  return (
    <>
      <TopBar title="Статистика">
        {mode === 'month' && (
          <>
            <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={18} /></button>
            <b>{monthTitle(month)}</b>
            <button className="icon-btn" aria-label="Следующий месяц" disabled={month >= curMonth} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={18} /></button>
          </>
        )}
        {mode === 'week' && (
          <>
            <button className="icon-btn" aria-label="Предыдущая неделя" onClick={() => setWeekDate(addDays(from, -7))}><ChevronLeft size={18} /></button>
            <b>{from === curWeek.from ? 'Эта неделя' : rangeTitle(from, to, today)}</b>
            <button className="icon-btn" aria-label="Следующая неделя" disabled={from >= curWeek.from} onClick={() => setWeekDate(addDays(from, 7))}><ChevronRight size={18} /></button>
          </>
        )}
        {mode === 'year' && (
          <>
            <button className="icon-btn" aria-label="Предыдущий год" onClick={() => setYear(year - 1)}><ChevronLeft size={18} /></button>
            <b>{year}</b>
            <button className="icon-btn" aria-label="Следующий год" disabled={year >= curYear} onClick={() => setYear(year + 1)}><ChevronRight size={18} /></button>
          </>
        )}
        {mode === 'range' && (
          <>
            <input type="date" className="input date-sm" value={rFrom} max={today} onChange={(e) => e.target.value && setRFrom(e.target.value)} aria-label="С" />
            <span className="muted">—</span>
            <input type="date" className="input date-sm" value={rTo} max={today} onChange={(e) => e.target.value && setRTo(e.target.value)} aria-label="По" />
          </>
        )}
      </TopBar>

      <div className="segmented" style={{ maxWidth: 440, marginBottom: 12 }}>
        {([['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год'], ['range', 'Период']] as const).map(([v, t]) => (
          <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}>{t}</button>
        ))}
      </div>

      <div className="stats-filter">
        <div className="segmented">
          {([['all', 'Всё'], ['expense', 'Расходы'], ['income', 'Доходы']] as const).map(([v, t]) => (
            <button key={v} type="button" aria-pressed={kind === v} onClick={() => pickKind(v)}>{t}</button>
          ))}
        </div>
        {kind !== 'all' && (
          <select className="select" value={catId} onChange={(e) => setCatId(e.target.value)} aria-label="Категория">
            <option value="">Все категории</option>
            {typeTops.map((t) => [
              <option key={t.id} value={t.id}>{t.name}</option>,
              ...typeCats.filter((c) => c.parentId === t.id).map((c) => <option key={c.id} value={c.id}>{'\u00A0\u00A0\u00A0'}{c.name}</option>),
            ])}
          </select>
        )}
        {l.multiAccount && (
          <select className="select" value={accId} onChange={(e) => setAccId(e.target.value)} aria-label="Счёт">
            <option value="">Все счета</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isArchived ? ' (архив)' : ''}</option>)}
          </select>
        )}
        {members.length > 1 && (
          <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Участник">
            <option value="">Все участники</option>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </select>
        )}
      </div>

      <div className="grid">
        <section className="panel span-all" aria-label="Итоги">
          {s ? (
            <>
              {kind === 'all' ? <MonthTotals s={s} prevLabel={label} /> : <TypeTotals s={s} all={filtered ? all : undefined} kind={kind} prevLabel={label} />}
              {kind !== 'expense' && <ExpectedIncomeBox s={s} />}
              {showDays && <DaysChart s={s} today={today} kind={kind === 'all' ? 'both' : kind} />}
              {ins && kind !== 'income' && (
                <div style={{ marginTop: 18 }}>
                  <KpiRow ins={ins} income={s.income} expense={s.expense} showSavings={kind === 'all' && !filtered} />
                </div>
              )}
            </>
          ) : (
            <div className="skeleton" style={{ height: 180 }} />
          )}
        </section>

        {mode === 'month' && kind !== 'income' && !filtered && limits.data?.month === month && <LimitCard data={limits.data} />}

        {showCalendar && (
          <section className="panel span-all" aria-label="Календарь">
            <div className="panel-head"><h2>{kind === 'income' ? 'Календарь доходов' : 'Календарь трат'}</h2></div>
            <CalendarHeat key={from + to + kind} daily={s!.daily} from={from} to={to} today={today} weekStart={weekStart} kind={kind === 'income' ? 'income' : 'expense'} />
          </section>
        )}

        <section className="panel span-all" aria-label="Динамика">
          <div className="panel-head">
            <h2>{kind === 'all' ? 'Динамика за 12 месяцев' : kind === 'expense' ? 'Расходы за 12 месяцев' : 'Доходы за 12 месяцев'}</h2>
          </div>
          {dynamics.data ? <DynamicsChart points={dynamics.data} current={mode === 'month' ? month : undefined} only={kind === 'all' ? undefined : kind} /> : <div className="skeleton" style={{ height: 220 }} />}
        </section>

        <section className="panel" aria-label="Структура">
          <div className="panel-head">
            <h2>Структура</h2>
            {kind === 'all' && (
              <div className="segmented" style={{ padding: 3 }}>
                <button type="button" aria-pressed={structType === 'expense'} onClick={() => setStructType('expense')}>Расходы</button>
                <button type="button" aria-pressed={structType === 'income'} onClick={() => setStructType('income')}>Доходы</button>
              </div>
            )}
          </div>
          {s && l.ready ? (
            <StructureView
              key={sType + from + to + catId + accId + userId}
              type={sType}
              list={sType === 'expense' ? s.expenseByCategory : s.incomeByCategory}
              prev={prevReady ? (sType === 'expense' ? prevData!.expenseByCategory : prevData!.incomeByCategory) : undefined}
              l={l}
            />
          ) : (
            <div className="skeleton" style={{ height: 260 }} />
          )}
        </section>

        <section className="panel" aria-label="Капитал">
          <div className="panel-head"><h2>Капитал сейчас</h2></div>
          {capital.data ? (
            <div className="cap-compact">
              <CapitalBlock capital={capital.data} />
              <AccountsList accounts={capital.data.accounts} />
            </div>
          ) : (
            <div className="skeleton" style={{ height: 200 }} />
          )}
        </section>

        {kind !== 'income' && (
          <>
            <section className="panel" aria-label="Обязательные и свободные">
              <div className="panel-head"><h2>Обязательные и свободные</h2></div>
              {ins ? <MandatoryBlock m={ins.mandatory} /> : insightFallback}
            </section>
            <section className="panel" aria-label="Дни недели">
              <div className="panel-head"><h2>По дням недели</h2><span className="muted" style={{ fontSize: 13 }}>в среднем за день</span></div>
              {ins ? <WeekdaysChart ins={ins} weekStart={weekStart} /> : insightFallback}
            </section>
            <section className="panel" aria-label="Что изменилось">
              <div className="panel-head"><h2>Что изменилось</h2></div>
              {ins && l.ready ? <Anomalies list={ins.anomalies} periods={ins.anomalyPeriods} l={l} /> : insightFallback}
            </section>
          </>
        )}

        <section className={'panel' + (kind === 'income' ? ' span-all' : '')} aria-label="Крупнейшие операции">
          <div className="panel-head"><h2>{kind === 'income' ? 'Крупнейшие доходы' : 'Крупнейшие траты'}</h2></div>
          {ins && l.ready ? (
            <TopOps list={kind === 'income' ? ins.topIncome : ins.topExpense} l={l} kind={kind === 'income' ? 'income' : 'expense'} />
          ) : insightFallback}
        </section>

        <section className="panel span-all" aria-label="Категории по месяцам">
          <div className="panel-head">
            <h2>{catId ? 'Подкатегории по месяцам' : 'Категории по месяцам'}</h2>
            {kind === 'all' && (
              <div className="segmented" style={{ padding: 3 }}>
                <button type="button" aria-pressed={structType === 'expense'} onClick={() => setStructType('expense')}>Расходы</button>
                <button type="button" aria-pressed={structType === 'income'} onClick={() => setStructType('income')}>Доходы</button>
              </div>
            )}
          </div>
          {mx && l.ready ? <MatrixTable data={mx} l={l} type={matrixType} current={mode === 'month' ? month : undefined} sub={!!catId} /> : matrix.isError ? <p className="muted">Не удалось загрузить категории. <button type="button" onClick={() => matrix.refetch()}>Повторить</button></p> : <div className="skeleton" style={{ height: 240 }} />}
        </section>

        {!filtered && (
          <section className="panel span-all" aria-label="Месяцы">
            <div className="panel-head"><h2>{mode === 'year' ? `${year} год по месяцам` : '12 месяцев по цифрам'}</h2></div>
            {dynamics.data ? <MonthsTable points={mode === 'year' ? dynamics.data.filter(p => p.month.startsWith(String(year))) : dynamics.data} today={today} /> : <div className="skeleton" style={{ height: 240 }} />}
          </section>
        )}

        <section className="panel span-all" aria-label="Капитал по месяцам">
          <div className="panel-head"><h2>Капитал бюджета по месяцам</h2></div>
          {dynamics.data ? <CapitalSplitChart points={dynamics.data} current={mode === 'month' ? month : undefined} /> : <div className="skeleton" style={{ height: 220 }} />}
        </section>
      </div>
    </>
  );
}
