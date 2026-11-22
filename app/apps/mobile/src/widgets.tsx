import { useId, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { BellRing, CreditCard, Pause, Snowflake } from 'lucide-react-native';
import {
  creditAvailableOf,
  currencySymbol,
  debtOf,
  formatMoney,
  getCurrentCurrency,
  isCredit,
  MONTHS_NOM,
  MONTHS_PREP,
  type Account,
  type Capital,
  type LimitStatus,
  type Limits,
  type PlannedItem,
  type PlannedOverview,
  type Summary,
  type UpcomingPayment,
} from '@selfinance/shared';
import type { Lookups } from './data';
import { dueLabel, plural, shortDate } from './format';
import { CatIcon } from './icons';
import { mix, useTheme } from './theme';
import { Button, Money, T } from './ui';

export interface PrevLabel {
  prep: string;
  dat: string;
}

/* ---------- Свободные деньги + полоса капитала ---------- */

export function CapitalView({ c, extra }: { c: Capital; extra?: ReactNode }) {
  const t = useTheme();
  const free = c.accounts.filter((a) => !a.isFrozen && !isCredit(a) && a.balance > 0 && !a.isArchived);
  const freeSum = free.reduce((s, a) => s + a.balance, 0);
  const frozenTotal = c.accounts.filter((a) => a.isFrozen && a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const frozenCount = c.accounts.filter((a) => a.isFrozen && !a.isArchived).length;
  const credit = c.creditInFree;
  const barTotal = freeSum + credit + frozenTotal;
  const showBar = barTotal > 0 && (free.length > 1 || frozenTotal > 0 || credit > 0);
  const pct = (v: number) => Math.round((v / barTotal) * 100);

  return (
    <View style={{ gap: 12 }}>
      <View>
        <T tone="muted" size={13}>Свободные деньги</T>
        <Money value={c.free} size={34} weight="700" tone={c.free < 0 ? 'expense' : 'text'} />
        {credit > 0 && (
          <T tone="credit" size={13}>
            в том числе <Money value={credit} round size={13} weight="500" tone="credit" /> по кредиткам
          </T>
        )}
        {c.creditAvailable > 0 && (
          <T tone="credit" size={13}>
            + <Money value={c.creditAvailable} round size={13} weight="500" tone="credit" /> доступно по {credit > 0 ? 'другим ' : ''}кредиткам
          </T>
        )}
        {extra}
      </View>

      {showBar && (
        <View style={{ gap: 10 }}>
          <CapitalBar free={free} credit={credit} frozen={frozenTotal} />
          {(frozenTotal > 0 || credit > 0) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 6 }}>
              <Legend color={t.accent} label={`В обороте ${100 - pct(frozenTotal) - pct(credit)}%`} />
              {credit > 0 && <Legend color={t.credit} label={`Кредитки ${pct(credit)}%`} />}
              {frozenTotal > 0 && <Legend color={t.frozen} label={`Заморожено ${pct(frozenTotal)}%`} />}
            </View>
          )}
        </View>
      )}

      {(frozenCount > 0 || c.debt > 0) && (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {frozenCount > 0 && (
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Snowflake size={13} color={t.frozen} />
                <T tone="muted" size={13}>Заморожено</T>
              </View>
              <Money value={c.frozen} size={17} tone="frozen" />
            </View>
          )}
          {c.debt > 0 && (
            <View style={{ flex: 1 }}>
              <T tone="muted" size={13}>Долг</T>
              <Money value={c.debt} size={17} tone="credit" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <T tone="muted" size={13}>Всего</T>
            <Money value={c.total} size={17} />
          </View>
        </View>
      )}
    </View>
  );
}

/** Полоса капитала как в веб-версии: счета в обороте, кредитки и «лёд» со штриховкой. */
function CapitalBar({ free, credit, frozen }: { free: Account[]; credit: number; frozen: number }) {
  const t = useTheme();
  const sorted = [...free].sort((a, b) => b.balance - a.balance);
  const shown = sorted.slice(0, 3);
  const rest = sorted.slice(3).reduce((s, a) => s + a.balance, 0);
  const total = sorted.reduce((s, a) => s + a.balance, 0) + credit + frozen;
  // оттенки акцентного цвета для 1-го, 2-го, 3-го счёта и «остальных»
  const shades = [t.accent, mix(t.accent, t.card, 0.78), mix(t.accent, t.card, 0.56), mix(t.accent, t.card, 0.38)];
  const segs: { key: string; flex: number; bg: string; fg: string; label?: string; icon?: ReactNode; hatch?: string }[] = [];
  shown.forEach((a, i) => segs.push({ key: a.id, flex: a.balance, bg: shades[i], fg: t.accentText, label: a.name }));
  if (rest > 0) segs.push({ key: 'rest', flex: rest, bg: shades[3], fg: t.accent });
  if (credit > 0)
    segs.push({ key: 'credit', flex: credit, bg: t.creditSoft, fg: t.credit, label: 'Кредитки', icon: <CreditCard size={16} color={t.credit} />, hatch: t.creditHatch });
  if (frozen > 0)
    segs.push({ key: 'ice', flex: frozen, bg: t.frozenSoft, fg: t.frozen, label: 'Вклады и копилки', icon: <Snowflake size={16} color={t.frozen} />, hatch: t.frozenHatch });

  return (
    <View
      style={{
        flexDirection: 'row',
        height: 44,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: t.card,
        shadowColor: '#000',
        shadowOpacity: t.dark ? 0 : 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 1 },
      }}
    >
      {segs.map((s, i) => {
        // подпись — только если сегмент достаточно широкий, иначе только иконка
        const share = s.flex / total;
        return (
          <View
            key={s.key}
            style={{
              flex: s.flex,
              backgroundColor: s.bg,
              borderLeftWidth: i ? 2 : 0,
              borderLeftColor: t.bg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: share > 0.08 ? 10 : 0,
              justifyContent: share > 0.08 ? 'flex-start' : 'center',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            {s.hatch && <Hatch color={s.hatch} />}
            {share > 0.06 && s.icon}
            {s.label && share > 0.2 && (
              <T size={13} weight="600" style={{ color: s.fg, flexShrink: 1 }} numberOfLines={1}>
                {s.label}
              </T>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Диагональная штриховка, как repeating-linear-gradient(-45deg) в вебе. */
function Hatch({ color }: { color: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={9} height={9} patternTransform="rotate(45)">
          <Rect x={0} y={0} width={2} height={9} fill={color} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <T tone="muted" size={12}>{label}</T>
    </View>
  );
}

/* ---------- Счета по группам ---------- */

function bankBadge(a: Account) {
  if (a.kind === 'cash') return currencySymbol(getCurrentCurrency());
  return (a.bankName || a.name).slice(0, 1).toUpperCase();
}

function creditSub(a: Account) {
  const parts: string[] = [];
  if (a.bankName) parts.push(a.bankName);
  if (a.kind === 'credit' && a.creditLimit)
    parts.push(`доступно ${formatMoney(creditAvailableOf(a))} из ${formatMoney(a.creditLimit)}${a.includeInFree ? ' (в свободных)' : ''}`);
  else if (a.kind === 'credit') parts.push('кредитка');
  else parts.push(debtOf(a) ? 'кредит' : 'кредит погашен');
  if (a.note) parts.push(a.note);
  return parts.join(', ');
}

export function AccountsList({ accounts, onPress }: { accounts: Account[]; onPress?: (a: Account) => void }) {
  const t = useTheme();
  const free = accounts.filter((a) => !a.isFrozen && !isCredit(a));
  const frozen = accounts.filter((a) => a.isFrozen && !isCredit(a));
  const credit = accounts.filter(isCredit);
  const sum = (list: Account[]) => list.reduce((s, a) => s + a.balance, 0);

  const row = (a: Account) => {
    const cr = isCredit(a);
    const sub = cr ? creditSub(a) : [a.bankName, a.note].filter(Boolean).join(', ');
    const bg = a.color ?? (cr ? t.credit + '26' : a.isFrozen ? t.frozen + '26' : t.input);
    const fg = a.color ? '#fff' : cr ? t.credit : a.isFrozen ? t.frozen : t.text;
    return (
      <Pressable
        key={a.id}
        onPress={onPress ? () => onPress(a) : undefined}
        disabled={!onPress}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <T weight="700" style={{ color: fg }}>{bankBadge(a)}</T>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="500" numberOfLines={1}>{a.name}</T>
          {!!sub && <T tone="muted" size={12} numberOfLines={2}>{sub}</T>}
        </View>
        <Money value={a.balance} tone={cr ? 'credit' : a.isFrozen ? 'frozen' : a.balance < 0 ? 'expense' : 'text'} />
      </Pressable>
    );
  };

  const head = (icon: ReactNode, title: string, list: Account[], tone: 'text' | 'frozen' | 'credit') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 2 }}>
      {icon}
      <T size={13} weight="700" tone={tone === 'text' ? 'muted' : tone} style={{ flex: 1 }}>{title}</T>
      <Money value={sum(list)} size={13} weight="600" tone={tone === 'text' ? 'muted' : tone} />
    </View>
  );

  return (
    <View>
      {free.length > 0 && (
        <View>
          {frozen.length + credit.length > 0 && head(null, 'В обороте', free, 'text')}
          {free.map(row)}
        </View>
      )}
      {frozen.length > 0 && (
        <View>
          {head(<Snowflake size={13} color={t.frozen} />, 'Заморожено', frozen, 'frozen')}
          {frozen.map(row)}
        </View>
      )}
      {credit.length > 0 && (
        <View>
          {head(<CreditCard size={13} color={t.credit} />, 'Кредиты', credit, 'credit')}
          {credit.map(row)}
        </View>
      )}
    </View>
  );
}

/* ---------- Итоги периода ---------- */

function Delta({ cur, prev, goodWhenLess, label }: { cur: number; prev: number; goodWhenLess: boolean; label: PrevLabel }) {
  if (!prev && !cur) return null;
  if (!prev) return <T size={12} tone="faint">в {label.prep} не было</T>;
  const d = Math.round(((cur - prev) / prev) * 100);
  if (Math.abs(d) < 2) return <T size={12} tone="faint">как в {label.prep}</T>;
  const good = goodWhenLess ? d < 0 : d > 0;
  return (
    <T size={12} tone={good ? 'income' : 'expense'}>
      {d > 0 ? '+' : '−'}{Math.abs(d)}% к {label.dat}
    </T>
  );
}

function Total({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ width: '50%', paddingVertical: 6, paddingRight: 8, gap: 1 }}>
      <T tone="muted" size={13}>{label}</T>
      {children}
    </View>
  );
}

const periodWord = (s: Summary) => (s.daysTotal > 31 ? 'периода' : 'месяца');

export function MonthTotals({ s, label }: { s: Summary; label: PrevLabel }) {
  const cmp = s.prevToDate ?? s.prev;
  const netDiff = s.net - cmp.net;
  const e = s.expectedIncome;
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Total label="Приход">
          <Money value={s.income} round size={19} tone="income" />
          <Delta cur={s.income} prev={cmp.income} goodWhenLess={false} label={label} />
          {e && e.total > e.received && (
            <T size={12} tone="income">ожидается <Money value={e.total} round size={12} tone="income" /> к концу {periodWord(s)}</T>
          )}
        </Total>
        <Total label="Расход">
          <Money value={s.expense} round size={19} tone="expense" />
          <Delta cur={s.expense} prev={cmp.expense} goodWhenLess label={label} />
        </Total>
        <Total label="Разница">
          <Money value={s.net} sign="always" round size={19} />
          {(cmp.net || s.net) ? <Money value={netDiff} sign="always" round size={12} weight="500" tone={netDiff >= 0 ? 'income' : 'expense'} /> : null}
        </Total>
        <Total label="В среднем за день">
          <Money value={s.avgPerDay} round size={19} />
          <T size={12} tone="faint"><Money value={s.avgPerWeek} round size={12} weight="400" tone="faint" /> в неделю</T>
        </Total>
      </View>
      <CrossLine s={s} />
    </View>
  );
}

export function TypeTotals({ s, all, kind, label }: { s: Summary; all?: Summary; kind: 'expense' | 'income'; label: PrevLabel }) {
  const cmp = s.prevToDate ?? s.prev;
  const value = s[kind];
  const avg = s.daysElapsed ? Math.round(value / s.daysElapsed) : 0;
  const whole = all ? all[kind] : 0;
  const share = all && whole ? Math.round((value / whole) * 100) : null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      <Total label={kind === 'expense' ? 'Расход' : 'Приход'}>
        <Money value={value} round size={19} tone={kind === 'expense' ? 'expense' : 'income'} />
        <Delta cur={value} prev={cmp[kind]} goodWhenLess={kind === 'expense'} label={label} />
      </Total>
      <Total label={`В ${label.prep}`}>
        <Money value={s.prev[kind]} round size={19} />
        <T size={12} tone="faint">за весь период</T>
      </Total>
      <Total label="В среднем за день">
        <Money value={avg} round size={19} />
        <T size={12} tone="faint"><Money value={avg * 7} round size={12} weight="400" tone="faint" /> в неделю</T>
      </Total>
      {share !== null ? (
        <Total label="Доля">
          <T size={19} weight="600">{share}%</T>
          <T size={12} tone="faint">от всех {kind === 'expense' ? 'расходов' : 'доходов'}</T>
        </Total>
      ) : (
        <Total label="Прошло дней">
          <T size={19} weight="600">{s.daysElapsed}</T>
          <T size={12} tone="faint">из {s.daysTotal}</T>
        </Total>
      )}
    </View>
  );
}

export function CrossLine({ s }: { s: Summary }) {
  if (!s.crossIn && !s.crossOut) return null;
  return (
    <T tone="muted" size={12} style={{ marginTop: 6 }}>
      {s.crossIn ? <>Получено из других бюджетов: <Money value={s.crossIn} sign="always" round size={12} weight="500" tone="muted" /></> : null}
      {s.crossIn && s.crossOut ? ' · ' : null}
      {s.crossOut ? <>Передано в другие бюджеты: <Money value={-s.crossOut} round size={12} weight="500" tone="muted" /></> : null}
    </T>
  );
}

export function ExpectedIncomeBox({ s }: { s: Summary }) {
  const t = useTheme();
  const e = s.expectedIncome;
  if (!e || e.total <= e.received) return null;
  const row = (label: string, v: ReactNode, bold?: boolean) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <T tone={bold ? 'text' : 'muted'} size={13} weight={bold ? '600' : '400'}>{label}</T>
      {v}
    </View>
  );
  return (
    <View style={{ backgroundColor: t.income + '14', borderRadius: 12, padding: 12, marginTop: 10 }}>
      {row('Уже пришло', <Money value={e.received} round size={13} />)}
      {e.planned > 0 && row('Запланированные доходы', <Money value={e.planned} sign="always" round size={13} tone="income" />)}
      {e.recurring > 0 && row('Регулярные доходы впереди', <Money value={e.recurring} sign="always" round size={13} tone="income" />)}
      {row(`Ожидается к концу ${periodWord(s)}`, <Money value={e.total} round size={13} />, true)}
    </View>
  );
}

/* ---------- Столбики по дням ---------- */

export function DaysChart({ s, today, kind }: { s: Summary; today: string; kind: 'expense' | 'income' | 'both' }) {
  const t = useTheme();
  const days = s.daily;
  const H = 110;
  const vals = (d: Summary['daily'][number]) => (kind === 'both' ? [d.income, d.expense] : [d[kind]]);
  const max = Math.max(1, ...days.flatMap(vals)) * 1.05;
  const avg = kind === 'expense' ? s.avgPerDay : kind === 'income' ? (s.daysElapsed ? Math.round(s.income / s.daysElapsed) : 0) : 0;
  const forecast = s.forecastExpense === null ? null : kind === 'income' ? s.expectedIncome?.total ?? avg * s.daysTotal : s.forecastExpense;
  const h = (v: number) => (v ? Math.max(3, (v / max) * H) : 2);

  return (
    <View style={{ marginTop: 12, gap: 4 }}>
      <View style={{ height: H, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        {avg > 0 && s.daysElapsed > 0 && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: (avg / max) * H, borderTopWidth: 1, borderStyle: 'dashed', borderColor: t.muted }}>
            <T size={10} tone="muted" style={{ position: 'absolute', right: 0, top: -14 }}>в среднем {formatMoney(Math.round(avg / 100) * 100)}</T>
          </View>
        )}
        {days.map((d) => {
          const future = d.date > today;
          const isToday = d.date === today;
          if (future) return <View key={d.date} style={{ flex: 1, height: 2, backgroundColor: t.border, borderRadius: 1 }} />;
          if (kind === 'both') {
            return (
              <View key={d.date} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
                <View style={{ flex: 1, height: h(d.income), backgroundColor: d.income ? t.income : t.border, borderRadius: 2 }} />
                <View style={{ flex: 1, height: h(d.expense), backgroundColor: d.expense ? t.expense : t.border, borderRadius: 2 }} />
              </View>
            );
          }
          const v = d[kind];
          const color = kind === 'income' ? t.income : t.expense;
          return (
            <View
              key={d.date}
              style={{ flex: 1, height: h(v), borderRadius: 2, backgroundColor: v ? color : t.border, opacity: isToday || !v ? 1 : 0.85 }}
            />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {days.map((d) => {
          const n = Number(d.date.slice(8));
          const show = n === 1 || n % 5 === 0;
          return (
            <T key={d.date} size={9} tone={d.date === today ? 'text' : 'faint'} style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
              {show ? n : ''}
            </T>
          );
        })}
      </View>
      {kind === 'both' && (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Legend color={t.income} label="Приход" />
          <Legend color={t.expense} label="Расход" />
        </View>
      )}
      {forecast !== null && (
        <View style={{ gap: 2, marginTop: 4 }}>
          <T size={12} tone="muted">Прошло {s.daysElapsed} {plural(s.daysElapsed, 'день', 'дня', 'дней')} из {s.daysTotal}</T>
          {s.daysElapsed > 0 && (
            <T size={12} tone="muted">
              {kind === 'income' ? `Ожидается к концу ${periodWord(s)} ` : `Если так продолжится, за ${s.daysTotal > 31 ? 'период' : 'месяц'} уйдёт `}
              ≈ <Money value={forecast} round size={12} weight="700" tone="muted" />
            </T>
          )}
        </View>
      )}
    </View>
  );
}

/* ---------- Куда ушли деньги ---------- */

export function CategoryBars({ s, l, limits = [] }: { s: Summary; l: Lookups; limits?: LimitStatus[] }) {
  const t = useTheme();
  const list = s.expenseByCategory;
  if (!list.length) return <T tone="muted">Расходов в этом месяце пока нет</T>;
  const limitOf = new Map(limits.map((x) => [x.categoryId, x]));
  const withLimit = list.filter((c) => limitOf.has(c.categoryId));
  const others = list.filter((c) => !limitOf.has(c.categoryId));
  const top = [...withLimit, ...others.slice(0, Math.max(0, 4 - withLimit.length))];
  const rest = list.filter((c) => !top.includes(c));
  const restSum = rest.reduce((x, c) => x + c.amount, 0);
  const max = Math.max(...top.filter((c) => !limitOf.has(c.categoryId)).map((c) => c.amount), restSum, 1);

  const bar = (key: string, icon: ReactNode, name: string, amount: number, width: number, color: string, extra?: ReactNode, subs?: string) => (
    <View key={key} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }}>
      {icon}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T style={{ flex: 1 }} numberOfLines={1}>{name}</T>
          <Money value={amount} round size={14} />
          {extra}
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: t.input, overflow: 'hidden' }}>
          <View style={{ width: `${Math.max(1, Math.min(100, width))}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
        </View>
        {!!subs && <T size={12} tone="muted" numberOfLines={1}>{subs}</T>}
      </View>
    </View>
  );

  return (
    <View>
      {top.map((c) => {
        const cat = l.category(c.categoryId);
        const color = cat?.color ?? '#8A8F9C';
        const lim = limitOf.get(c.categoryId);
        const width = lim ? (c.amount / lim.limit) * 100 : (c.amount / max) * 100;
        const barColor = lim?.state === 'over' ? t.expense : lim?.state === 'warn' ? '#E0A100' : color;
        const subs = c.subs
          .slice(0, 3)
          .map((x) => `${l.category(x.categoryId)?.name ?? '—'} ${formatMoney(Math.round(x.amount / 100) * 100)}`)
          .join(', ');
        return bar(
          c.categoryId ?? 'none',
          <CatIcon name={cat?.icon ?? 'dots'} color={color} size={32} />,
          cat?.name ?? 'Без категории',
          c.amount,
          width,
          barColor,
          lim ? <T size={12} tone="muted">из <Money value={lim.limit} round size={12} weight="400" tone="muted" /></T> : undefined,
          subs,
        );
      })}
      {restSum > 0 && bar('rest', <CatIcon name="dots" size={32} />, 'Остальное', restSum, (restSum / max) * 100, t.muted)}
    </View>
  );
}

/* ---------- Лимит месяца ---------- */

const monthIdx = (m: string) => Number(m.slice(5)) - 1;

export function LimitCard({ data, onEdit }: { data: Limits; onEdit?: () => void }) {
  const t = useTheme();
  const o = data.overall;
  const name = MONTHS_NOM[monthIdx(data.month)].toLowerCase();
  const rec = data.recurring.paid + data.recurring.upcoming;

  if (!o) {
    if (!onEdit || !data.isCurrent) return null;
    return (
      <View style={{ gap: 10 }}>
        <T tone="muted">Задайте лимит расходов на месяц, и приложение подскажет, сколько можно тратить в день.</T>
        <Button title="Задать лимит" kind="secondary" onPress={onEdit} />
      </View>
    );
  }

  const pct = Math.min(100, (o.spent / o.limit) * 100);
  const fpct = o.forecast !== null ? Math.min(100, (o.forecast / o.limit) * 100) : null;
  const color = o.state === 'over' ? t.expense : o.state === 'warn' ? '#E0A100' : t.accent;

  return (
    <Pressable onPress={onEdit} disabled={!onEdit} style={{ gap: 8 }}>
      <T size={17} weight="700">
        Лимит на {name}: <Money value={o.limit} round size={17} weight="700" />
      </T>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: t.input, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 10, backgroundColor: color, borderRadius: 5 }} />
        {fpct !== null && fpct > pct && (
          <View style={{ position: 'absolute', left: `${fpct}%`, top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: t.text, opacity: 0.5 }} />
        )}
      </View>
      <T size={14}>
        Потрачено <Money value={o.spent} round size={14} />
        {o.remaining >= 0 ? <>, осталось <Money value={o.remaining} round size={14} /></> : null}
      </T>
      {o.remaining < 0 && (
        <T tone="expense" size={14}>Лимит превышен на <Money value={-o.remaining} round size={14} tone="expense" /></T>
      )}
      {data.isCurrent && o.daysLeft !== null && o.remaining > 0 && (
        <T size={14}>
          До конца месяца {o.daysLeft} {plural(o.daysLeft, 'день', 'дня', 'дней')}, можно тратить{' '}
          <T weight="700" size={14}>≈ <Money value={o.perDay ?? 0} round size={14} weight="700" /> в день</T>
        </T>
      )}
      {data.isCurrent && o.remaining === 0 && <T size={14}>Лимит исчерпан</T>}
      {data.isCurrent && o.forecast !== null && o.forecast > o.limit && o.remaining > 0 && (
        <T size={13} tone="expense">
          При таком темпе выйдет ≈ <Money value={o.forecast} round size={13} tone="expense" />, это на{' '}
          <Money value={o.forecast - o.limit} round size={13} tone="expense" /> больше лимита
        </T>
      )}
      {!data.isCurrent && (
        <T size={14} tone={o.remaining < 0 ? 'expense' : 'income'}>
          {o.remaining >= 0 ? `В ${MONTHS_PREP[monthIdx(data.month)]} уложились в лимит` : `В ${MONTHS_PREP[monthIdx(data.month)]} лимит превышен`}
        </T>
      )}
      {!data.includeRecurring && rec > 0 && (
        <T size={13} tone="muted">
          Обязательные платежи отдельно: <Money value={rec} round size={13} weight="500" tone="muted" />
          {data.recurring.upcoming > 0 && data.recurring.paid > 0 && (
            <> (оплачено <Money value={data.recurring.paid} round size={13} weight="500" tone="muted" />, впереди <Money value={data.recurring.upcoming} round size={13} weight="500" tone="muted" />)</>
          )}
          {data.recurring.upcoming > 0 && data.recurring.paid === 0 && <> (ещё впереди)</>}
        </T>
      )}
    </Pressable>
  );
}

/* ---------- Регулярный платёж в списке «Впереди» ---------- */

export function UpcomingRow({
  u,
  l,
  canEdit,
  onPay,
  onSkip,
  onLink,
}: {
  u: UpcomingPayment;
  l: Lookups;
  canEdit: boolean;
  onPay: () => void;
  onSkip: () => void;
  onLink: () => void;
}) {
  const r = u.recurring;
  const cat = l.category(r.categoryId);
  const color = cat?.color ?? (cat?.parentId ? l.category(cat.parentId)?.color : null) ?? null;
  const overdue = u.daysLeft < 0;
  return (
    <View style={{ paddingVertical: 8, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CatIcon name={cat?.icon ?? 'dots'} color={color} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="500" numberOfLines={1}>{r.name}</T>
          <T size={13} tone={overdue ? 'expense' : 'muted'}>{shortDate(u.dueDate)}, {dueLabel(u.daysLeft)}</T>
        </View>
        <T>
          {r.amountVaries ? '≈ ' : ''}
          <Money value={r.type === 'expense' ? -r.amount : r.amount} sign={r.type === 'income' ? 'always' : 'auto'} tone={r.type === 'income' ? 'income' : 'text'} />
        </T>
      </View>
      {canEdit && (
        <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 52 }}>
          <SmallBtn title={r.type === 'income' ? 'Получено' : 'Оплатить'} onPress={onPay} primary />
          <SmallBtn title="Пропустить" onPress={onSkip} />
        </View>
      )}
      {u.match && canEdit && (
        <View style={{ paddingLeft: 52, gap: 4 }}>
          <T size={13} tone="muted">
            Похоже, уже {r.type === 'income' ? 'получено' : 'оплачено'}: <Money value={u.match.amount} size={13} weight="500" tone="muted" />, {shortDate(u.match.date)}.
          </T>
          <Pressable onPress={onLink} hitSlop={6}>
            <T size={13} tone="accent" weight="600">Да, это он</T>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function SmallBtn({ title, onPress, primary, disabled }: { title: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        minHeight: 34,
        borderRadius: 17,
        justifyContent: 'center',
        backgroundColor: primary ? t.accent : t.input,
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
      })}
    >
      <T size={14} weight="600" style={{ color: primary ? t.accentText : t.text }}>{title}</T>
    </Pressable>
  );
}

/* ---------- Планы ---------- */

export function planWhen(p: PlannedItem) {
  if (!p.date || p.daysLeft === null) return 'без даты';
  return `${shortDate(p.date)}, ${dueLabel(p.daysLeft)}`;
}

export function PlanStatus({ p }: { p: PlannedItem }) {
  if (p.type === 'income') {
    const overdue = p.daysLeft !== null && p.daysLeft < 0;
    return <T size={12} tone={overdue ? 'expense' : 'income'}>{overdue ? 'Ещё не пришло' : p.date ? 'Ожидается доход' : 'Доход когда-нибудь'}</T>;
  }
  if (p.shortfall > 0) {
    return (
      <T size={12} tone="expense">
        {p.date ? 'К этой дате не хватает ' : 'Не хватает '}
        <Money value={p.shortfall} round size={12} tone="expense" />
      </T>
    );
  }
  return <T size={12} tone="income">{p.date ? 'Денег хватает' : 'Можно купить сейчас'}</T>;
}

export function PlanRow({ p, l, onPress }: { p: PlannedItem; l: Lookups; onPress: () => void }) {
  const cat = l.category(p.categoryId);
  const color = cat?.color ?? (cat?.parentId ? l.category(cat.parentId)?.color : null) ?? null;
  const overdue = p.daysLeft !== null && p.daysLeft < 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
      <CatIcon name={cat?.icon ?? 'dots'} color={color} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="500" numberOfLines={1}>{p.name}</T>
        <T size={13} tone={overdue ? 'expense' : 'muted'}>{planWhen(p)}</T>
      </View>
      <View style={{ alignItems: 'flex-end', maxWidth: '50%' }}>
        <Money value={p.type === 'income' ? p.amount : -p.amount} sign={p.type === 'income' ? 'always' : 'auto'} tone={p.type === 'income' ? 'income' : 'text'} />
        <PlanStatus p={p} />
      </View>
    </Pressable>
  );
}

/** Строка под свободными деньгами: сколько останется после планов. */
export function AfterPlans({ data, onPress }: { data: PlannedOverview; onPress: () => void }) {
  if (data.afterPlans === null) return null;
  const neg = data.afterPlans < 0;
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ marginTop: 4 }}>
      <T size={13} tone={neg ? 'expense' : 'accent'}>
        После планов{data.horizon ? ` (до ${shortDate(data.horizon)})` : ''}:{' '}
        <Money value={data.afterPlans} round size={13} weight="700" tone={neg ? 'expense' : 'accent'} /> ›
      </T>
    </Pressable>
  );
}

export function AheadTitle() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <BellRing size={18} color={t.muted} />
      <T size={17} weight="700">Впереди</T>
    </View>
  );
}

export function PausedIcon() {
  const t = useTheme();
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.input, alignItems: 'center', justifyContent: 'center' }}>
      <Pause size={18} color={t.muted} />
    </View>
  );
}
