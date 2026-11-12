import { useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { Planned } from '@selfinance/shared';
import { TopBar } from '../components/Layout';
import { Money } from '../components/Money';
import { ForecastSheet, PlanRow, usePlanSheets } from '../components/Planned';
import { shortDate } from '../components/Upcoming';
import { useBudget } from '../lib/budget';
import { CatIcon } from '../lib/icons';
import { useLookups, type Lookups } from '../lib/lookups';
import { usePlanned, usePlannedAction } from '../lib/queries';

export function PlannedPage() {
  const { data, isLoading } = usePlanned();
  const l = useLookups();
  const { canEdit } = useBudget();
  const s = usePlanSheets(l);
  const [forecast, setForecast] = useState(false);

  const items = data?.items ?? [];
  const dated = items.filter((p) => p.date);
  const undated = items.filter((p) => !p.date);
  const total = items.reduce((sum, p) => sum + p.amount, 0);
  const reserved = items.reduce((sum, p) => sum + p.reserved, 0);

  return (
    <>
      <TopBar title="Планы" />

      <section className="panel" style={{ maxWidth: 760 }}>
        <div className="panel-head">
          <h2>Запланированные расходы</h2>
          {canEdit && (
            <button className="link" onClick={s.create} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Plus size={16} /> Запланировать
            </button>
          )}
        </div>

        {data && items.length > 0 && (
          <div className="totals plan-totals">
            <div className="total"><span>Свободно сейчас</span><b><Money value={data.free} round /></b></div>
            <div className="total t-out"><span>Запланировано</span><b><Money value={total} round /></b></div>
            {reserved > 0 && <div className="total"><span>Уже отложено</span><b className="frz"><Money value={reserved} round /></b></div>}
            {data.afterPlans !== null && (
              <button type="button" className="total plan-after" onClick={() => setForecast(true)}>
                <span>После планов{data.horizon ? ` (до ${shortDate(data.horizon)})` : ''}</span>
                <b className={data.afterPlans < 0 ? 'exp' : ''}><Money value={data.afterPlans} round /></b>
                <small className="link">Как посчитано</small>
              </button>
            )}
          </div>
        )}

        {isLoading || !l.ready ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : items.length ? (
          <>
            {dated.map((p) => <PlanRow key={p.id} p={p} l={l} onEdit={() => s.edit(p)} onReserve={() => s.reserve(p)} />)}
            {undated.length > 0 && (
              <>
                <h3 className="plan-group">Когда-нибудь</h3>
                {undated.map((p) => <PlanRow key={p.id} p={p} l={l} onEdit={() => s.edit(p)} onReserve={() => s.reserve(p)} />)}
              </>
            )}
          </>
        ) : (
          <div className="empty">
            <p>
              Запишите будущую покупку — она будет висеть на главной как напоминание и покажет, хватает ли на неё свободных денег
              с учётом регулярных платежей. Под план можно заранее отложить деньги.
            </p>
            {canEdit && <button className="btn btn-primary" onClick={s.create}>Запланировать расход</button>}
          </div>
        )}
      </section>

      {data && data.history.length > 0 && (
        <section className="panel" style={{ maxWidth: 760, marginTop: 20 }}>
          <div className="panel-head"><h2>Выполненные и отменённые</h2></div>
          {data.history.map((p) => <HistoryRow key={p.id} p={p} l={l} canEdit={canEdit} />)}
        </section>
      )}

      {s.sheets}
      {forecast && data && <ForecastSheet data={data} onClose={() => setForecast(false)} />}
    </>
  );
}

function HistoryRow({ p, l, canEdit }: { p: Planned; l: Lookups; canEdit: boolean }) {
  const action = usePlannedAction();
  const cat = l.category(p.categoryId);
  const color = cat?.color ?? (cat?.parentId ? l.category(cat.parentId)?.color : null) ?? null;
  const when = p.doneAt ? shortDate(p.doneAt.slice(0, 10)) : '';
  return (
    <div className="up-row" style={{ opacity: p.status === 'cancelled' ? 0.6 : 1 }}>
      <div className="cat-ic" style={color ? { ['--c' as string]: color } : undefined}>
        <CatIcon name={cat?.icon ?? 'dots'} />
      </div>
      <div className="tx-main">
        <div className="tx-title">{p.name}</div>
        <div className="tx-sub">{p.status === 'done' ? `куплено ${when}` : `отменён ${when}`}</div>
      </div>
      <div className="tx-sum num"><Money value={-p.amount} /></div>
      {canEdit && (
        <div className="up-actions">
          {p.status === 'cancelled' && (
            <button className="btn btn-ghost btn-sm" onClick={() => action.mutate({ id: p.id, action: 'restore' })} disabled={action.isPending} title="Вернуть в планы">
              <RotateCcw size={15} /> Вернуть
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            aria-label="Удалить из истории"
            onClick={() => confirm(`Удалить «${p.name}» из истории? Операция покупки останется.`) && action.mutate({ id: p.id, action: 'delete' })}
            disabled={action.isPending}
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
