import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, BackHandler, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartColumn, CloudOff, CloudUpload, House, List, Menu, Plus, type LucideIcon } from 'lucide-react-native';
import { isOnline } from '../api';
import { plural } from '../format';
import { flush, takeFailures, useQueue } from '../offline';
import { NavCtx, type Nav, type Route, type Tab, type TxSheetOptions } from '../nav';
import { useBudget } from '../session';
import { useTheme } from '../theme';
import { T } from '../ui';
import { AccountsScreen } from './AccountsScreen';
import { AdminScreen } from './AdminScreen';
import { BudgetsScreen } from './BudgetsScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { CrossSheet } from './CrossSheet';
import { HomeScreen } from './HomeScreen';
import { MoreScreen } from './MoreScreen';
import { OperationsScreen } from './OperationsScreen';
import { PlannedScreen } from './PlannedScreen';
import { RecurringScreen } from './RecurringScreen';
import { SettingsScreen, SettingsSectionScreen } from './SettingsScreen';
import { StatsScreen } from './StatsScreen';
import { TxSheet } from './TxSheet';

export function MainScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { canEdit } = useBudget();
  const [tab, setTabState] = useState<Tab>('home');
  const [stack, setStack] = useState<Route[]>([]);
  const [sheet, setSheet] = useState<TxSheetOptions | null>(null);

  const nav = useMemo<Nav>(
    () => ({
      push: (r) => setStack((s) => [...s, r]),
      pop: () => setStack((s) => s.slice(0, -1)),
      setTab: (tb) => {
        setStack([]);
        setTabState(tb);
      },
      openTx: (o, after) => {
        const open = () => setSheet(o ?? {});
        if (after && Platform.OS === 'ios') setTimeout(open, 450);
        else open();
      },
    }),
    [],
  );

  // кнопка «назад» на Android: закрыть экран поверх вкладок, потом вернуться на главную
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length) {
        nav.pop();
        return true;
      }
      if (tab !== 'home') {
        nav.setTab('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, tab, nav]);

  const closeSheet = useCallback(() => setSheet(null), []);
  const top = stack[stack.length - 1];
  const isCross = !!sheet && (!!sheet.cross || !!sheet.tx?.linkedBudget);

  return (
    <NavCtx.Provider value={nav}>
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
        <OfflineBar />
        {/* вкладки остаются смонтированными — при переключении не теряются прокрутка и фильтры */}
        <Pane visible={!top && tab === 'home'}>
          <HomeScreen />
        </Pane>
        <Pane visible={!top && tab === 'ops'}>
          <OperationsScreen />
        </Pane>
        <Pane visible={!top && tab === 'stats'}>
          <StatsScreen />
        </Pane>
        <Pane visible={!top && tab === 'more'}>
          <MoreScreen />
        </Pane>
        {top && <View style={{ flex: 1 }}>{renderRoute(top)}</View>}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: t.card,
            borderTopWidth: 1,
            borderTopColor: t.border,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 6,
          }}
        >
          <TabBtn icon={House} label="Главная" active={!top && tab === 'home'} onPress={() => nav.setTab('home')} />
          <TabBtn icon={List} label="Операции" active={!top && tab === 'ops'} onPress={() => nav.setTab('ops')} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            {canEdit && (
              <Pressable
                onPress={() => nav.openTx()}
                accessibilityLabel="Добавить операцию"
                style={({ pressed }) => ({
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: t.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: -22,
                  opacity: pressed ? 0.85 : 1,
                  shadowColor: t.accent,
                  shadowOpacity: 0.35,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                })}
              >
                <Plus size={28} color={t.accentText} strokeWidth={2.4} />
              </Pressable>
            )}
          </View>
          <TabBtn icon={ChartColumn} label="Статистика" active={!top && tab === 'stats'} onPress={() => nav.setTab('stats')} />
          <TabBtn icon={Menu} label="Ещё" active={!!top || tab === 'more'} onPress={() => nav.setTab('more')} />
        </View>

        <TxSheet opts={isCross ? null : sheet} onClose={closeSheet} onCross={() => {
          setSheet(null);
          nav.openTx({ cross: true }, true);
        }} />
        <CrossSheet visible={isCross} tx={sheet?.tx} onClose={closeSheet} />
      </View>
    </NavCtx.Provider>
  );
}

function renderRoute(r: Route) {
  switch (r.name) {
    case 'accounts':
      return <AccountsScreen />;
    case 'recurring':
      return <RecurringScreen />;
    case 'planned':
      return <PlannedScreen />;
    case 'categories':
      return <CategoriesScreen />;
    case 'budgets':
      return <BudgetsScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'settings-section':
      return <SettingsSectionScreen section={r.key} />;
    case 'admin':
      return <AdminScreen />;
  }
}

function Pane({ visible, children }: { visible: boolean; children: ReactNode }) {
  return <View style={{ flex: 1, display: visible ? 'flex' : 'none' }}>{children}</View>;
}

function TabBtn({ icon: I, label, active, onPress }: { icon: LucideIcon; label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  const color = active ? t.accent : t.muted;
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' }}>
      <I size={24} color={color} strokeWidth={active ? 2.2 : 1.8} />
      <T size={11} style={{ color }} weight={active ? '600' : '400'} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

/** Плашка: нет связи / изменения ждут отправки. Сообщает, если сервер что-то не принял. */
function OfflineBar() {
  const t = useTheme();
  const { pending, flushing } = useQueue();
  const online = isOnline();

  useEffect(() => {
    const f = takeFailures();
    if (f.length) {
      Alert.alert(
        'Не все изменения удалось отправить',
        f.map((x) => `${x.title}: ${x.message}`).join('\n'),
      );
    }
  });

  if (online && !pending) return null;
  const text = !online
    ? pending
      ? `Нет связи · ${pending} ${plural(pending, 'изменение ждёт', 'изменения ждут', 'изменений ждут')} отправки`
      : 'Нет связи — показаны сохранённые данные'
    : flushing
      ? `Отправляю изменения: ${pending}`
      : `${pending} ${plural(pending, 'изменение ждёт', 'изменения ждут', 'изменений ждут')} отправки`;
  const Icon = online ? CloudUpload : CloudOff;
  return (
    <Pressable
      onPress={() => void flush()}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: t.creditSoft }}
    >
      <Icon size={16} color={t.credit} />
      <T size={13} weight="600" tone="credit" style={{ flex: 1 }} numberOfLines={1}>{text}</T>
    </Pressable>
  );
}
