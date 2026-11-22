import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, SectionList, TextInput, View } from 'react-native';
import { ChevronLeft, ChevronRight, Repeat, Search, SlidersHorizontal } from 'lucide-react-native';
import { monthRange, monthTitle, shiftMonth, todayISO, type TxType } from '@selfinance/shared';
import { useLookups, useTxFeed, type TxFilters } from '../data';
import { Select, type Option } from '../kit';
import { useNav } from '../nav';
import { useSession } from '../session';
import { radius, useTheme } from '../theme';
import { DayHeader, groupByDay, TxRow } from '../TxList';
import { Chip, ErrorBox, T } from '../ui';

const TYPES: { value: TxType | ''; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
  { value: 'transfer', label: 'Переводы' },
];

export function OperationsScreen() {
  const t = useTheme();
  const nav = useNav();
  const { user } = useSession();
  const today = todayISO(user?.timezone);
  const curMonth = today.slice(0, 7);
  const l = useLookups();
  const [month, setMonth] = useState<string | null>(curMonth);
  const [type, setType] = useState<TxType | ''>('');
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // поиск — с небольшой задержкой, чтобы не дёргать сервер на каждую букву
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim().length >= 2 ? text.trim() : ''), 400);
    return () => clearTimeout(id);
  }, [text]);

  const filters = useMemo<TxFilters>(() => {
    const f: TxFilters = {};
    if (month) Object.assign(f, monthRange(month));
    if (type) f.type = type;
    if (account) f.account = account;
    if (category) f.category = category;
    if (q) f.q = q;
    return f;
  }, [month, type, account, category, q]);

  const feed = useTxFeed(filters);
  const sections = useMemo(() => groupByDay(feed.items).map((g) => ({ key: g.date, date: g.date, total: g.total, data: g.items })), [feed.items]);

  const tops = l.categories.filter((c) => !c.parentId);
  const catOptions: Option<string>[] = [
    { value: '', label: 'Все категории' },
    { value: 'none', label: 'Без категории' },
    ...tops.filter((c) => c.type === 'expense').map((c) => ({ value: c.id, label: c.name, hint: 'расход' })),
    ...tops.filter((c) => c.type === 'income').map((c) => ({ value: c.id, label: c.name, hint: 'доход' })),
  ];
  const filtered = !!(account || category);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T size={26} weight="700" style={{ flex: 1 }}>Операции</T>
          <Pressable hitSlop={8} onPress={() => nav.push({ name: 'recurring' })} style={{ padding: 6 }}>
            <Repeat size={22} color={t.accent} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable hitSlop={8} onPress={() => setMonth(shiftMonth(month ?? curMonth, -1))} style={{ padding: 6 }}>
            <ChevronLeft size={22} color={t.text} />
          </Pressable>
          <T weight="700" size={16}>{month ? monthTitle(month) : 'Всё время'}</T>
          <Pressable
            hitSlop={8}
            disabled={!month || month >= curMonth}
            onPress={() => month && setMonth(shiftMonth(month, 1))}
            style={{ padding: 6, opacity: !month || month >= curMonth ? 0.3 : 1 }}
          >
            <ChevronRight size={22} color={t.text} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: t.card,
              borderRadius: radius.item,
              paddingHorizontal: 12,
              minHeight: 44,
            }}
          >
            <Search size={18} color={t.muted} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Поиск по комментарию"
              placeholderTextColor={t.faint}
              style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 10 }}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          <Pressable
            onPress={() => setShowFilters(!showFilters)}
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.item,
              backgroundColor: filtered ? t.accentSoft : t.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SlidersHorizontal size={20} color={filtered ? t.accent : t.text} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {TYPES.map((o) => (
            <Chip key={o.value || 'all'} label={o.label} active={type === o.value} onPress={() => setType(o.value)} />
          ))}
          <Chip label="Всё время" active={month === null} onPress={() => setMonth(month ? null : curMonth)} />
        </ScrollView>
        {showFilters && (
          <View style={{ gap: 10, paddingBottom: 6 }}>
            {l.multiAccount && (
              <Select
                value={account}
                options={[{ value: '', label: 'Все счета' }, ...l.accounts.map((a) => ({ value: a.id, label: a.name + (a.isArchived ? ' (архив)' : '') }))]}
                onChange={setAccount}
              />
            )}
            <Select value={category} options={catOptions} onChange={setCategory} />
          </View>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(tx) => tx.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        renderSectionHeader={({ section }) => <DayHeader date={section.date} total={section.total} today={today} />}
        renderItem={({ item }) => <TxRow tx={item} l={l} onPress={() => nav.openTx({ tx: item })} pending={feed.pendingIds.has(item.id)} />}
        onEndReached={() => void feed.loadMore()}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={feed.loading && feed.items.length > 0} onRefresh={feed.reload} tintColor={t.accent} />}
        ListEmptyComponent={
          feed.loading ? (
            <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
          ) : feed.error ? (
            <ErrorBox error={feed.error} onRetry={feed.reload} />
          ) : (
            <T tone="muted" style={{ textAlign: 'center', marginTop: 40 }}>
              {q || type || filtered ? 'Ничего не найдено' : 'Операций за этот период нет'}
            </T>
          )
        }
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator color={t.accent} style={{ marginVertical: 16 }} /> : undefined}
      />
    </View>
  );
}
