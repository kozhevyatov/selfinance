import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS_DAT, MONTHS_PREP, monthRange, monthTitle, shiftMonth, todayISO } from '@selfinance/shared';
import { AccountsList, CapitalBlock, CategoryBars, DaysChart, MonthTotals, PanelLink } from '../components/HomeWidgets';
import { TopBar, useTxSheet } from '../components/Layout';
import { TxDays } from '../components/TxList';
import { UpcomingPanel } from '../components/Upcoming';
import { LimitCard, LimitSheet } from '../components/Limits';
import { useBudget } from '../lib/budget';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { useCapital, useLimits, useSummary, useTransactions } from '../lib/queries';

export function HomePage() {
  const { user } = useAuth();
  const today = todayISO(user?.timezone);
  const curMonth = today.slice(0, 7);
  const [month, setMonth] = useState(curMonth);
  const { from, to } = monthRange(month);

  const l = useLookups();
  const capital = useCapital();
  const summary = useSummary(from, to);
  const recent = useTransactions({}, 8);
  const open = useTxSheet();
  const limits = useLimits(month);
  const { canEdit } = useBudget();
  const [limitOpen, setLimitOpen] = useState(false);

  const prevIdx = Number(shiftMonth(month, -1).slice(5)) - 1;
  const prevLabel = { prep: MONTHS_PREP[prevIdx], dat: MONTHS_DAT[prevIdx] };
  const recentItems = recent.data?.pages[0]?.items ?? [];

  return (
    <>
      <TopBar>
        <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={18} />
        </button>
        <b>{monthTitle(month)}</b>
        <button className="icon-btn" aria-label="Следующий месяц" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= curMonth}>
          <ChevronRight size={18} />
        </button>
      </TopBar>

      {capital.data ? <CapitalBlock capital={capital.data} /> : <div className="capital"><div className="skeleton" style={{ height: 90 }} /></div>}

      <div className="grid">
        <UpcomingPanel l={l} />

        {limits.data && <LimitCard data={limits.data} onEdit={canEdit ? () => setLimitOpen(true) : undefined} />}

        <section className="panel span-all" aria-label="Итоги месяца">
          {summary.data ? (
            <>
              <MonthTotals s={summary.data} prevLabel={prevLabel} />
              <DaysChart s={summary.data} today={today} />
            </>
          ) : (
            <div className="skeleton" style={{ height: 200 }} />
          )}
        </section>

        <section className="panel" aria-label="Последние операции">
          <div className="panel-head">
            <h2>Последние операции</h2>
            <PanelLink to="/operations">Все операции</PanelLink>
          </div>
          {recent.isLoading || !l.ready ? (
            <div className="skeleton" style={{ height: 240 }} />
          ) : recentItems.length ? (
            <TxDays items={recentItems} l={l} onOpen={(tx) => open({ tx })} timezone={user?.timezone} />
          ) : (
            <div className="empty">
              <p>Здесь появятся ваши доходы и расходы.</p>
              <button className="btn btn-primary" onClick={() => open()}>Добавить первую операцию</button>
            </div>
          )}
        </section>

        <div className="stack">
          <section className="panel" aria-label="Расходы по категориям">
            <div className="panel-head">
              <h2>Куда ушли деньги</h2>
              <PanelLink to="/stats">Статистика</PanelLink>
            </div>
            {summary.data && l.ready ? <CategoryBars s={summary.data} l={l} limits={limits.data?.categories} /> : <div className="skeleton" style={{ height: 160 }} />}
          </section>

          {capital.data && capital.data.accounts.length > 1 && (
            <section className="panel" aria-label="Счета">
              <div className="panel-head">
                <h2>Счета</h2>
                <PanelLink to="/accounts">Управлять</PanelLink>
              </div>
              <AccountsList accounts={capital.data.accounts} />
            </section>
          )}
        </div>
      </div>

      {limitOpen && limits.data && l.ready && (
        <LimitSheet data={limits.data} l={l} month={curMonth} onClose={() => setLimitOpen(false)} />
      )}
    </>
  );
}
