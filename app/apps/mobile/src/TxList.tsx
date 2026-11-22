import { Pressable, View } from 'react-native';
import { CloudUpload } from 'lucide-react-native';
import { dayTitle, type Transaction } from '@selfinance/shared';
import { describeTx, type Lookups } from './data';
import { CatIcon } from './icons';
import { useTheme } from './theme';
import { Money, T } from './ui';

export function TxRow({ tx, l, onPress, pending }: { tx: Transaction; l: Lookups; onPress?: () => void; pending?: boolean }) {
  const t = useTheme();
  const d = describeTx(tx, l);
  const iconColor = d.icon === 'snow' ? t.frozen : d.kind === 'repay' || d.kind === 'borrow' ? t.credit : d.color;

  let sum;
  if (tx.type === 'expense') sum = <Money value={-tx.amount} />;
  else if (tx.type === 'income') sum = <Money value={tx.amount} sign="always" tone="income" />;
  else if (tx.type === 'transfer')
    sum = (
      <Money
        value={tx.amount}
        sign="never"
        tone={d.kind === 'freeze' || d.kind === 'unfreeze' ? 'frozen' : d.kind === 'repay' || d.kind === 'borrow' ? 'credit' : 'transfer'}
      />
    );
  else sum = <Money value={tx.amount} sign="always" tone="transfer" />;

  const author = l.shared ? l.member(tx.createdBy) : undefined;
  const accName = l.account(tx.accountId)?.name;
  const right = pending
    ? 'ждёт отправки'
    : tx.type === 'transfer'
      ? author ? `перевод · ${author}` : 'перевод'
      : [l.multiAccount ? accName : undefined, author].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, opacity: pressed ? 0.6 : 1 })}
    >
      <CatIcon name={d.icon} color={iconColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={15} weight="500" numberOfLines={1}>{d.title}</T>
        {!!d.sub && <T size={13} tone="muted" numberOfLines={1}>{d.sub}</T>}
      </View>
      <View style={{ alignItems: 'flex-end', maxWidth: '45%' }}>
        {sum}
        {!!right && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {pending && <CloudUpload size={12} color={t.credit} />}
            <T size={12} tone={pending ? 'credit' : 'faint'} numberOfLines={1}>{right}</T>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export interface DayGroup {
  date: string;
  total: number;
  items: Transaction[];
}

/** Операции по дням с дневным итогом (доходы − расходы). */
export function groupByDay(items: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const tx of items) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== tx.date) groups.push((g = { date: tx.date, items: [], total: 0 }));
    g.items.push(tx);
    if (tx.type === 'income') g.total += tx.amount;
    if (tx.type === 'expense') g.total -= tx.amount;
  }
  return groups;
}

export function DayHeader({ date, total, today }: { date: string; total: number; today: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingBottom: 4 }}>
      <T size={13} tone="muted" weight="600">{dayTitle(date, today)}</T>
      {total !== 0 && <Money value={total} sign="always" size={13} weight="500" tone="muted" />}
    </View>
  );
}

export function TxDays({
  items,
  l,
  today,
  onOpen,
  pendingIds,
}: {
  items: Transaction[];
  l: Lookups;
  today: string;
  onOpen: (tx: Transaction) => void;
  pendingIds?: Set<string>;
}) {
  return (
    <>
      {groupByDay(items).map((g) => (
        <View key={g.date}>
          <DayHeader date={g.date} total={g.total} today={today} />
          {g.items.map((tx) => (
            <TxRow key={tx.id} tx={tx} l={l} onPress={() => onOpen(tx)} pending={pendingIds?.has(tx.id)} />
          ))}
        </View>
      ))}
    </>
  );
}
