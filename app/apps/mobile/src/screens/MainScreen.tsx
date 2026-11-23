import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { todayISO } from '@selfinance/shared';
import { Alert, BackHandler, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartColumn, ChevronRight, CloudOff, CloudUpload, House, List, Menu, Plus, Users, type LucideIcon } from 'lucide-react-native';
import { isOnline } from '../api';
import { plural } from '../format';
import { useIncomingInvites, useLimits, useRecurring } from '../data';
import { useLock } from '../lock';
import { checkLimit, onPaymentTap, schedulePayments } from '../notify';
import { onQuickAction, setupQuickActions, type QuickKind } from '../quick';
import { flush, takeFailures, useQueue } from '../offline';
import { NavCtx, type Nav, type Route, type Tab, type TxSheetOptions } from '../nav';
import { useBudget, useSession } from '../session';
import { useTheme } from '../theme';
import { T } from '../ui';
import { useUpdateBadge } from '../UpdateInfo';
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
  const updateBadge = useUpdateBadge();
  const { locked } = useLock();
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

  useSystemHooks(nav, locked, canEdit);

  const closeSheet = useCallback(() => setSheet(null), []);
  const top = stack[stack.length - 1];
  const isCross = !!sheet && (!!sheet.cross || !!sheet.tx?.linkedBudget);

  return (
    <NavCtx.Provider value={nav}>
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
        <OfflineBar />
        {top?.name !== 'budgets' && <InviteBar onPress={() => nav.push({ name: 'budgets' })} />}
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
          <TabBtn icon={Menu} label="Ещё" active={!!top || tab === 'more'} dot={updateBadge} onPress={() => nav.setTab('more')} />
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

function TabBtn({ icon: I, label, active, onPress, dot }: { icon: LucideIcon; label: string; active: boolean; onPress: () => void; dot?: boolean }) {
  const t = useTheme();
  const color = active ? t.accent : t.muted;
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' }}>
      <View>
        <I size={24} color={color} strokeWidth={active ? 2.2 : 1.8} />
        {dot && (
          <View
            accessibilityLabel="Есть обновление сервера"
            style={{ position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 5, backgroundColor: t.danger, borderWidth: 1.5, borderColor: t.card }}
          />
        )}
      </View>
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

/** Напоминание о приглашении в общий бюджет — на всех экранах, кроме «Бюджетов». */
function InviteBar({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  const { user } = useSession();
  const { data = [] } = useIncomingInvites(!!user?.canShare);
  if (!data.length) return null;
  const text = data.length === 1 ? `Вас пригласили в бюджет «${data[0].budgetName}»` : `Приглашений в общие бюджеты: ${data.length}`;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: t.accentSoft, opacity: pressed ? 0.7 : 1 })}
    >
      <Users size={16} color={t.accent} />
      <T size={13} weight="600" tone="accent" style={{ flex: 1 }} numberOfLines={1}>{text}</T>
      <T size={13} weight="700" tone="accent">Ответить</T>
      <ChevronRight size={16} color={t.accent} />
    </Pressable>
  );
}

/**
 * Связь с системой: быстрые действия на иконке, напоминания о платежах и лимите.
 * Пока приложение заблокировано ПИН-кодом, действие ждёт разблокировки.
 */
function useSystemHooks(nav: Nav, locked: boolean, canEdit: boolean) {
  const { user } = useSession();
  const { budget, budgets, budgetId } = useBudget();
  const month = todayISO(user?.timezone).slice(0, 7);
  const recurring = useRecurring();
  const limits = useLimits(month);
  const [pending, setPending] = useState<{ quick?: QuickKind; recurringId?: string } | null>(null);
  const rulesRef = useRef(recurring.data);
  rulesRef.current = recurring.data;

  useEffect(() => {
    setupQuickActions();
    const offQuick = onQuickAction((quick) => setPending({ quick }));
    const offTap = onPaymentTap((recurringId) => setPending({ recurringId }));
    return () => {
      offQuick();
      offTap();
    };
  }, []);

  // выполнить отложенное действие, когда приложение разблокировано (и данные правила на месте)
  useEffect(() => {
    if (!pending || locked) return;
    if (pending.quick) {
      setPending(null);
      if (canEdit) nav.openTx({ type: pending.quick });
      return;
    }
    if (pending.recurringId) {
      const rule = rulesRef.current?.find((r) => r.id === pending.recurringId);
      if (!rule && recurring.loading) return; // подождём список правил
      setPending(null);
      if (rule && canEdit) nav.openTx({ recurring: rule });
      else nav.push({ name: 'recurring' });
    }
  }, [pending, locked, canEdit, nav, recurring.loading, recurring.data]);

  // расписание напоминаний пересобирается при каждом обновлении данных
  useEffect(() => {
    if (recurring.data) void schedulePayments(recurring.data, budgets.length > 1 ? budget.name : null);
  }, [recurring.data, budget.name, budgets.length]);

  useEffect(() => {
    void checkLimit(limits.data, budgetId);
  }, [limits.data, budgetId]);
}
