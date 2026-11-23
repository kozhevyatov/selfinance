import { Platform } from 'react-native';
import * as QuickActions from 'expo-quick-actions';

/** Быстрые действия при долгом нажатии на иконку приложения. */
export type QuickKind = 'expense' | 'income';

const ITEMS: { id: QuickKind; title: string; icon: string }[] = [
  { id: 'expense', title: 'Добавить расход', icon: 'symbol:minus.circle' },
  { id: 'income', title: 'Добавить доход', icon: 'symbol:plus.circle' },
];

export function setupQuickActions() {
  void QuickActions.setItems(
    ITEMS.map((i) => ({
      id: i.id,
      title: i.title,
      icon: Platform.OS === 'ios' ? i.icon : undefined,
      params: { kind: i.id },
    })),
  ).catch(() => undefined);
}

export function clearQuickActions() {
  void QuickActions.setItems([]).catch(() => undefined);
}

const handled = new Set<unknown>();

/** Действие, с которым открыли приложение, и последующие нажатия. */
export function onQuickAction(fn: (kind: QuickKind) => void) {
  const handle = (a: QuickActions.Action | null | undefined) => {
    if (!a || handled.has(a)) return;
    handled.add(a);
    if (a.id === 'expense' || a.id === 'income') fn(a.id);
  };
  handle(QuickActions.initial);
  const sub = QuickActions.addListener(handle);
  return () => sub.remove();
}
