import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Plus, RotateCcw, Trash2 } from 'lucide-react-native';
import type { Planned } from '@selfinance/shared';
import { plannedApi, useLookups, usePlanned, type Lookups } from '../data';
import { shortDate } from '../format';
import { CatIcon } from '../icons';
import { PageHeader } from '../kit';
import { useNav } from '../nav';
import { useBudget } from '../session';
import { useTheme } from '../theme';
import { Button, Card, Money, SectionTitle, Skeleton, T } from '../ui';
import { PlanRow } from '../widgets';
import { ForecastSheet, usePlanSheets } from './PlanSheets';

export function PlannedScreen() {
  const t = useTheme();
  const nav = useNav();
  const { data } = usePlanned();
  const l = useLookups();
  const { canEdit } = useBudget();
  const s = usePlanSheets(l);
  const [forecast, setForecast] = useState(false);

  const items = data?.items ?? [];
  const dated = items.filter((p) => p.date);
  const undated = items.filter((p) => !p.date);
  const total = items.filter((p) => p.type !== 'income').reduce((sum, p) => sum + p.amount, 0);
  const incomeTotal = items.filter((p) => p.type === 'income').reduce((sum, p) => sum + p.amount, 0);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PageHeader
        title="Планы"
        onBack={nav.pop}
        right={
          canEdit ? (
            <Pressable hitSlop={8} onPress={() => s.create()} style={{ padding: 6 }}>
              <Plus size={24} color={t.accent} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {data && items.length > 0 && (
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
              <Stat label="Свободно сейчас"><Money value={data.free} round size={18} /></Stat>
              {total > 0 && <Stat label="Запланировано расходов"><Money value={total} round size={18} tone="expense" /></Stat>}
              {incomeTotal > 0 && <Stat label="Ожидается доходов"><Money value={incomeTotal} round size={18} tone="income" /></Stat>}
              {data.afterPlans !== null && (
                <Pressable onPress={() => setForecast(true)} style={{ width: '50%' }}>
                  <T tone="muted" size={13}>После планов{data.horizon ? ` (до ${shortDate(data.horizon)})` : ''}</T>
                  <Money value={data.afterPlans} round size={18} tone={data.afterPlans < 0 ? 'expense' : 'text'} />
                  <T tone="accent" size={12} weight="600">Как посчитано ›</T>
                </Pressable>
              )}
            </View>
          </Card>
        )}

        <Card>
          <SectionTitle>Запланированные расходы и доходы</SectionTitle>
          {!data || !l.ready ? (
            <Skeleton height={200} />
          ) : items.length ? (
            <>
              {dated.map((p) => <PlanRow key={p.id} p={p} l={l} onPress={() => s.open(p)} />)}
              {undated.length > 0 && (
                <>
                  <T tone="muted" size={13} weight="700" style={{ marginTop: 10 }}>Когда-нибудь</T>
                  {undated.map((p) => <PlanRow key={p.id} p={p} l={l} onPress={() => s.open(p)} />)}
                </>
              )}
            </>
          ) : (
            <View style={{ gap: 12 }}>
              <T tone="muted">
                Запишите будущую покупку — она будет висеть на главной как напоминание и покажет, хватает ли на неё свободных денег с учётом регулярных
                платежей. Ожидаемые доходы (премию, возврат долга) тоже можно запланировать — они войдут в прогноз.
              </T>
              {canEdit && (
                <>
                  <Button title="Запланировать расход" onPress={() => s.create('expense')} />
                  <Button title="Запланировать доход" kind="secondary" onPress={() => s.create('income')} />
                </>
              )}
            </View>
          )}
        </Card>

        {data && data.history.length > 0 && (
          <Card>
            <SectionTitle>Выполненные и отменённые</SectionTitle>
            {data.history.map((p) => <HistoryRow key={p.id} p={p} l={l} canEdit={canEdit} />)}
          </Card>
        )}
      </ScrollView>

      {s.sheets}
      {data && <ForecastSheet visible={forecast} data={data} onClose={() => setForecast(false)} />}
    </View>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ width: '50%', paddingRight: 8 }}>
      <T tone="muted" size={13}>{label}</T>
      {children}
    </View>
  );
}

function HistoryRow({ p, l, canEdit }: { p: Planned; l: Lookups; canEdit: boolean }) {
  const t = useTheme();
  const { budgetId } = useBudget();
  const cat = l.category(p.categoryId);
  const color = cat?.color ?? (cat?.parentId ? l.category(cat.parentId)?.color : null) ?? null;
  const when = p.doneAt ? shortDate(p.doneAt.slice(0, 10)) : '';
  const act = (a: 'restore' | 'delete') =>
    plannedApi(budgetId)
      .action(p.id, a)
      .catch((e) => Alert.alert('Не получилось', e instanceof Error ? e.message : undefined));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, opacity: p.status === 'cancelled' ? 0.6 : 1 }}>
      <CatIcon name={cat?.icon ?? 'dots'} color={color} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="500" numberOfLines={1}>{p.name}</T>
        <T size={13} tone="muted">{p.status === 'done' ? `${p.type === 'income' ? 'получено' : 'куплено'} ${when}` : `отменён ${when}`}</T>
      </View>
      <Money value={p.type === 'income' ? p.amount : -p.amount} sign={p.type === 'income' ? 'always' : 'auto'} tone={p.type === 'income' ? 'income' : 'text'} />
      {canEdit && (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {p.status === 'cancelled' && (
            <Pressable hitSlop={6} onPress={() => void act('restore')} style={{ padding: 6 }}>
              <RotateCcw size={18} color={t.accent} />
            </Pressable>
          )}
          <Pressable
            hitSlop={6}
            style={{ padding: 6 }}
            onPress={() =>
              Alert.alert(`Удалить «${p.name}» из истории?`, 'Операция покупки останется.', [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Удалить', style: 'destructive', onPress: () => void act('delete') },
              ])
            }
          >
            <Trash2 size={18} color={t.muted} />
          </Pressable>
        </View>
      )}
    </View>
  );
}
