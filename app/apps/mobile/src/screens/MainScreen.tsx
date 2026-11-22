import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ellipsis, House, List, Plus } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { Transaction } from '@selfinance/shared';
import { useBudget } from '../session';
import { useTheme } from '../theme';
import { T } from '../ui';
import { HomeScreen } from './HomeScreen';
import { MoreScreen } from './MoreScreen';
import { OperationsScreen } from './OperationsScreen';
import { TxSheet, type TxSheetOptions } from './TxSheet';

type Tab = 'home' | 'ops' | 'more';

export function MainScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { canEdit } = useBudget();
  const [tab, setTab] = useState<Tab>('home');
  const [sheet, setSheet] = useState<TxSheetOptions | null>(null);

  const openTx = (tx: Transaction) => setSheet({ tx });
  const add = () => setSheet({});

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {/* вкладки остаются смонтированными — при переключении не теряется прокрутка и фильтры */}
      <Pane visible={tab === 'home'}>
        <HomeScreen onOpenTx={openTx} onAdd={add} onAllOps={() => setTab('ops')} />
      </Pane>
      <Pane visible={tab === 'ops'}>
        <OperationsScreen onOpenTx={openTx} />
      </Pane>
      <Pane visible={tab === 'more'}>
        <MoreScreen />
      </Pane>

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
        <TabBtn icon={House} label="Главная" active={tab === 'home'} onPress={() => setTab('home')} />
        <TabBtn icon={List} label="Операции" active={tab === 'ops'} onPress={() => setTab('ops')} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          {canEdit && (
            <Pressable
              onPress={add}
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
        <TabBtn icon={Ellipsis} label="Ещё" active={tab === 'more'} onPress={() => setTab('more')} />
      </View>

      <TxSheet opts={sheet} onClose={() => setSheet(null)} />
    </View>
  );
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
      <T size={11} style={{ color }} weight={active ? '600' : '400'}>{label}</T>
    </Pressable>
  );
}
