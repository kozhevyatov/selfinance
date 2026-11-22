import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, SectionList, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { todayISO, type Transaction, type TxType } from '@selfinance/shared';
import { useLookups, useTxFeed } from '../data';
import { useSession } from '../session';
import { radius, useTheme } from '../theme';
import { DayHeader, groupByDay, TxRow } from '../TxList';
import { Chip, ErrorBox, T } from '../ui';

const TYPES: { value: TxType | ''; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
  { value: 'transfer', label: 'Переводы' },
  { value: 'adjustment', label: 'Корректировки' },
];

export function OperationsScreen({ onOpenTx }: { onOpenTx: (tx: Transaction) => void }) {
  const t = useTheme();
  const { user } = useSession();
  const today = todayISO(user?.timezone);
  const l = useLookups();
  const [type, setType] = useState<TxType | ''>('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');

  // поиск по комментарию — с небольшой задержкой, чтобы не дёргать сервер на каждую букву
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 400);
    return () => clearTimeout(id);
  }, [text]);

  const feed = useTxFeed({ type: type || undefined, q: q || undefined });
  const sections = useMemo(
    () => groupByDay(feed.items).map((g) => ({ key: g.date, date: g.date, total: g.total, data: g.items })),
    [feed.items],
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
        <T size={26} weight="700">Операции</T>
        <View
          style={{
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {TYPES.map((o) => (
            <Chip key={o.value || 'all'} label={o.label} active={type === o.value} onPress={() => setType(o.value)} />
          ))}
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(tx) => tx.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        renderSectionHeader={({ section }) => <DayHeader date={section.date} total={section.total} today={today} />}
        renderItem={({ item }) => <TxRow tx={item} l={l} onPress={() => onOpenTx(item)} />}
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
              {q || type ? 'Ничего не найдено' : 'Операций пока нет'}
            </T>
          )
        }
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator color={t.accent} style={{ marginVertical: 16 }} /> : undefined}
      />
    </View>
  );
}
