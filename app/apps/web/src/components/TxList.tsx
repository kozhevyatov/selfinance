import type { CSSProperties } from 'react';
import { ArrowLeftRight, Scale, Snowflake } from 'lucide-react';
import { dayTitle, todayISO, type Transaction } from '@selfinance/shared';
import { describeTx, type Lookups } from '../lib/lookups';
import { CatIcon } from '../lib/icons';
import { Money } from './Money';

export function TxRow({ tx, l, onClick }: { tx: Transaction; l: Lookups; onClick?: () => void }) {
  const d = describeTx(tx, l);
  let icon;
  let style: CSSProperties = {};
  if (d.icon === 'snow') {
    icon = <Snowflake size={19} strokeWidth={1.8} />;
    style = { ['--c' as string]: 'var(--frozen)' };
  } else if (d.icon === 'swap') {
    icon = <ArrowLeftRight size={19} strokeWidth={1.8} />;
  } else if (d.icon === 'adjust') {
    icon = <Scale size={19} strokeWidth={1.8} />;
  } else {
    icon = <CatIcon name={d.icon} />;
    if (d.color) style = { ['--c' as string]: d.color };
  }

  const accName = l.account(tx.accountId)?.name;
  let sum;
  if (tx.type === 'expense') sum = <Money value={-tx.amount} className="tx-sum" />;
  else if (tx.type === 'income') sum = <Money value={tx.amount} sign="always" className="tx-sum in" />;
  else if (tx.type === 'transfer') sum = <Money value={tx.amount} sign="never" className={'tx-sum' + (d.kind === 'move' ? '' : ' tr')} />;
  else sum = <Money value={tx.amount} sign="always" className="tx-sum adj" />;

  return (
    <button type="button" className="tx" onClick={onClick}>
      <div className="cat-ic" style={style}>{icon}</div>
      <div className="tx-main">
        <div className="tx-title">{d.title}</div>
        {d.sub && <div className="tx-sub">{d.sub}</div>}
      </div>
      <div className="tx-right">
        <div>{sum}</div>
        {tx.type === 'transfer' ? (
          <div className="tx-acc">перевод</div>
        ) : (
          l.multiAccount && accName && <div className="tx-acc">{accName}</div>
        )}
      </div>
    </button>
  );
}

/** Операции, сгруппированные по дням, с дневным итогом (доходы − расходы). */
export function TxDays({ items, l, onOpen, timezone }: { items: Transaction[]; l: Lookups; onOpen: (tx: Transaction) => void; timezone?: string }) {
  const today = todayISO(timezone);
  const groups: { date: string; items: Transaction[]; total: number }[] = [];
  for (const tx of items) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== tx.date) groups.push((g = { date: tx.date, items: [], total: 0 }));
    g.items.push(tx);
    if (tx.type === 'income') g.total += tx.amount;
    if (tx.type === 'expense') g.total -= tx.amount;
  }
  return (
    <>
      {groups.map((g) => (
        <div className="day-group" key={g.date}>
          <p className="day-title">
            <span>{dayTitle(g.date, today)}</span>
            {g.total !== 0 && <Money value={g.total} sign="always" />}
          </p>
          {g.items.map((tx) => (
            <TxRow key={tx.id} tx={tx} l={l} onClick={() => onOpen(tx)} />
          ))}
        </div>
      ))}
    </>
  );
}
