import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { ChevronDown } from 'lucide-react-native';
import { formatMoney, MONTHS_NOM, type CategoryStat, type DynamicsPoint } from '@selfinance/shared';
import type { Lookups } from './data';
import { CatIcon } from './icons';
import { useTheme } from './theme';
import { Money, T } from './ui';
import { Legend } from './widgets';

const SHORT = MONTHS_NOM.map((m) => m.slice(0, 3).toLowerCase());
const rub = (v: number) => formatMoney(Math.round(v / 100) * 100);

/* ---------- Динамика: приход/расход по месяцам + линия капитала ---------- */

function avgOf(points: DynamicsPoint[], k: 'income' | 'expense') {
  const start = points.findIndex((p) => p[k] > 0);
  if (start < 0) return 0;
  const used = points.slice(start);
  return used.reduce((s, p) => s + p[k], 0) / used.length;
}

export function DynamicsChart({ points, current, only }: { points: DynamicsPoint[]; current?: string; only?: 'income' | 'expense' }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  if (!points.length) return null;
  const H = 150;
  const showIn = only !== 'expense';
  const showOut = only !== 'income';
  const max = Math.max(1, ...points.flatMap((p) => [showIn ? p.income : 0, showOut ? p.expense : 0])) * 1.08;
  const caps = points.map((p) => p.capital);
  const cMin = Math.min(...caps);
  const cMax = Math.max(...caps);
  const span = cMax - cMin || Math.abs(cMax) || 1;
  const n = points.length;
  const line = points
    .map((p, i) => {
      const x = ((i + 0.5) / n) * w;
      const y = H - (0.15 + ((p.capital - cMin) / span) * 0.7) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = points[points.length - 1];
  const picked = points.find((p) => p.month === sel);

  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: H }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H, gap: 4 }}>
          {points.map((p) => {
            const cur = p.month === current || p.month === sel;
            return (
              <Pressable
                key={p.month}
                onPress={() => setSel(sel === p.month ? null : p.month)}
                style={{ flex: 1, height: H, flexDirection: 'row', alignItems: 'flex-end', gap: 1, opacity: sel && !cur ? 0.45 : 1 }}
              >
                {showIn && <View style={{ flex: 1, height: Math.max(1, (p.income / max) * H), backgroundColor: t.income, borderRadius: 2 }} />}
                {showOut && <View style={{ flex: 1, height: Math.max(1, (p.expense / max) * H), backgroundColor: t.expense, borderRadius: 2 }} />}
              </Pressable>
            );
          })}
        </View>
        {!only && w > 0 && (
          <Svg width={w} height={H} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
            <Polyline points={line} fill="none" stroke={t.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {points.map((p) => (
          <T key={p.month} size={10} tone={p.month === current ? 'text' : 'faint'} style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
            {SHORT[Number(p.month.slice(5)) - 1]}
          </T>
        ))}
      </View>
      {picked ? (
        <T size={13}>
          {MONTHS_NOM[Number(picked.month.slice(5)) - 1]} {picked.month.slice(0, 4)}:{' '}
          {showIn && <>приход {rub(picked.income)}</>}
          {showIn && showOut && ', '}
          {showOut && <>расход {rub(picked.expense)}</>}
          {!only && <>, капитал {rub(picked.capital)}</>}
        </T>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {showIn && <Legend color={t.income} label={only ? `Приход, в среднем ${rub(avgOf(points, 'income'))} в месяц` : 'Приход'} />}
          {showOut && <Legend color={t.expense} label={only ? `Расход, в среднем ${rub(avgOf(points, 'expense'))} в месяц` : 'Расход'} />}
          {!only && <Legend color={t.accent} label={`Капитал, сейчас ${rub(last.capital)}`} />}
        </View>
      )}
    </View>
  );
}

/* ---------- Структура: бублик + таблица ---------- */

const FALLBACK = '#8A8F9C';

export function StructureView({ list, prev, l, type }: { list: CategoryStat[]; prev?: CategoryStat[]; l: Lookups; type: 'income' | 'expense' }) {
  const t = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const total = list.reduce((s, c) => s + c.amount, 0);
  if (!total) return <T tone="muted">{type === 'expense' ? 'Расходов' : 'Доходов'} за период нет</T>;

  const colorOf = (id: string | null) => l.category(id)?.color ?? FALLBACK;
  const prevMap = new Map((prev ?? []).map((c) => [c.categoryId, c.amount]));
  const R = 70;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = list.map((c) => {
    const key = c.categoryId ?? 'none';
    const len = (c.amount / total) * C;
    const el = (
      <Circle
        key={key}
        r={R}
        cx={90}
        cy={90}
        fill="none"
        stroke={colorOf(c.categoryId)}
        strokeWidth={open === key ? 26 : 20}
        strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${C}`}
        strokeDashoffset={-acc}
        onPress={() => setOpen(open === key ? null : key)}
      />
    );
    acc += len;
    return el;
  });

  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={180} height={180} viewBox="0 0 180 180" style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle r={R} cx={90} cy={90} fill="none" stroke={t.input} strokeWidth={20} />
          {arcs}
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }} pointerEvents="none">
          <T tone="muted" size={12}>{type === 'expense' ? 'Расходы' : 'Доходы'}</T>
          <Money value={total} round size={17} weight="700" />
        </View>
      </View>

      <View>
        {list.map((c) => {
          const key = c.categoryId ?? 'none';
          const cat = l.category(c.categoryId);
          const pct = (c.amount / total) * 100;
          const was = prevMap.get(c.categoryId);
          let delta = null;
          if (prev && was) {
            const d = Math.round(((c.amount - was) / was) * 100);
            if (Math.abs(d) >= 2) {
              const bad = type === 'expense' ? d > 0 : d < 0;
              delta = <T size={11} tone={bad ? 'expense' : 'income'}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}%</T>;
            }
          } else if (prev && !was) {
            delta = <T size={11} tone="faint">новое</T>;
          }
          const noSub = c.amount - c.subs.reduce((x, s) => x + s.amount, 0);
          return (
            <View key={key}>
              <Pressable
                onPress={() => c.subs.length && setOpen(open === key ? null : key)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}
              >
                <CatIcon name={cat?.icon ?? 'dots'} color={colorOf(c.categoryId)} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T numberOfLines={1}>
                    {cat?.name ?? 'Без категории'}
                    {c.subs.length > 0 && <T tone="faint"> ({c.subs.length})</T>}
                  </T>
                  {delta}
                </View>
                <T size={13} tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{pct < 1 ? '<1' : Math.round(pct)}%</T>
                <Money value={c.amount} round size={14} style={{ minWidth: 80, textAlign: 'right' }} />
                {c.subs.length > 0 && <ChevronDown size={16} color={t.faint} style={{ transform: [{ rotate: open === key ? '180deg' : '0deg' }] }} />}
              </Pressable>
              {open === key && c.subs.length > 0 && (
                <View style={{ paddingLeft: 42, paddingBottom: 6, gap: 4 }}>
                  {c.subs.map((s) => (
                    <View key={s.categoryId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <T size={13} tone="muted">{l.category(s.categoryId)?.name ?? '—'}</T>
                      <Money value={s.amount} round size={13} weight="500" />
                    </View>
                  ))}
                  {noSub > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <T size={13} tone="faint">без подкатегории</T>
                      <Money value={noSub} round size={13} weight="500" tone="faint" />
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
