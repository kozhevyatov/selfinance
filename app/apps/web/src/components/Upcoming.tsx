import { BellRing } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MONTHS_GEN, parseISODate, type UpcomingPayment } from '@selfinance/shared';
import { useBudget } from '../lib/budget';
import { CatIcon } from '../lib/icons';
import type { Lookups } from '../lib/lookups';
import { useLinkRecurring, useSkipRecurring, useUpcoming } from '../lib/queries';
import { plural } from './HomeWidgets';
import { useTxSheet } from './Layout';
import { Money } from './Money';

export function dueLabel(daysLeft: number) {
  if (daysLeft < 0) return `просрочен на ${-daysLeft} ${plural(-daysLeft, 'день', 'дня', 'дней')}`;
  if (daysLeft === 0) return 'сегодня';
  if (daysLeft === 1) return 'завтра';
  return `через ${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')}`;
}

export const shortDate = (date: string) => {
  const { m, d } = parseISODate(date);
  return `${d} ${MONTHS_GEN[m - 1]}`;
};

export function UpcomingRow({ u, l }: { u: UpcomingPayment; l: Lookups }) {
  const open = useTxSheet();
  const skip = useSkipRecurring();
  const link = useLinkRecurring();
  const { canEdit } = useBudget();
  const r = u.recurring;
  const cat = l.category(r.categoryId);
  const color = cat?.color ?? (cat?.parentId ? l.category(cat.parentId)?.color : null) ?? null;
  const overdue = u.daysLeft < 0;

  return (
    <div className={'up-row' + (overdue ? ' overdue' : '')}>
      <div className="cat-ic" style={color ? { ['--c' as string]: color } : undefined}>
        <CatIcon name={cat?.icon ?? 'dots'} />
      </div>
      <div className="tx-main">
        <div className="tx-title">{r.name}</div>
        <div className={'tx-sub' + (overdue ? ' exp' : '')}>
          {shortDate(u.dueDate)}, {dueLabel(u.daysLeft)}
        </div>
      </div>
      <div className="tx-sum num">
        {r.amountVaries && '≈ '}
        <Money value={r.type === 'expense' ? -r.amount : r.amount} sign={r.type === 'income' ? 'always' : 'auto'} />
      </div>
      {canEdit && (
        <div className="up-actions">
          <button className="btn btn-primary btn-sm" onClick={() => open({ recurring: r })}>
            {r.type === 'income' ? 'Получено' : 'Оплатить'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => skip.mutate(r.id)} disabled={skip.isPending}>
            Пропустить
          </button>
        </div>
      )}
      {u.match && canEdit && (
        <div className="up-match">
          Похоже, уже {r.type === 'income' ? 'получено' : 'оплачено'}: <Money value={u.match.amount} />, {shortDate(u.match.date)}.{' '}
          <button className="link" onClick={() => link.mutate({ id: r.id, transactionId: u.match!.id })} disabled={link.isPending}>
            Да, это он
          </button>
        </div>
      )}
    </div>
  );
}

export function UpcomingPanel({ l }: { l: Lookups }) {
  const { data = [] } = useUpcoming();
  if (!data.length) return null;
  return (
    <section className="panel span-all upcoming" aria-label="Скоро платежи">
      <div className="panel-head">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BellRing size={18} className="muted" /> Скоро платежи
        </h2>
        <Link className="link" to="/recurring">Все регулярные</Link>
      </div>
      {data.map((u) => <UpcomingRow key={u.recurring.id} u={u} l={l} />)}
    </section>
  );
}
