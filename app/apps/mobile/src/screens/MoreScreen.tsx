import { Alert, Linking, ScrollView, View } from 'react-native';
import Constants from 'expo-constants';
import { CalendarClock, Check, ExternalLink, LogOut, Repeat, Server, Settings, Tag, Users, Wallet } from 'lucide-react-native';
import { formatPhone, type Meta } from '@selfinance/shared';
import { get } from '../api';
import { pendingNote } from '../offline';
import { Divider, MenuRow } from '../kit';
import { useNav, type Route } from '../nav';
import { useQuery } from '../query';
import { useBudget, useSession } from '../session';
import { useTheme } from '../theme';
import { UpdateInfo } from '../UpdateInfo';
import { Card, SectionTitle, T } from '../ui';

export function MoreScreen() {
  const t = useTheme();
  const nav = useNav();
  const { user, server, signOut, disconnect } = useSession();
  const { budgets, budgetId, setBudgetId } = useBudget();
  const meta = useQuery('meta', () => get<Meta>('/meta'));
  const appVersion = Constants.expoConfig?.version ?? '';
  const login = user?.email ?? (user?.phone ? formatPhone(user.phone) : '');

  const items: { route: Route; label: string; hint: string; icon: typeof Wallet; show?: boolean }[] = [
    { route: { name: 'accounts' }, label: 'Счета', hint: 'Банки, наличные, накопления', icon: Wallet },
    { route: { name: 'recurring' }, label: 'Регулярные платежи', hint: 'Напоминания о ежемесячных платежах', icon: Repeat },
    { route: { name: 'planned' }, label: 'Планы', hint: 'Запланированные покупки и ожидаемые доходы', icon: CalendarClock },
    { route: { name: 'categories' }, label: 'Категории', hint: 'Добавить, изменить, удалить', icon: Tag },
    { route: { name: 'budgets' }, label: 'Бюджеты', hint: 'Личный и семейные', icon: Users, show: !!user?.canShare },
    { route: { name: 'settings' }, label: 'Настройки', hint: 'Профиль, пароль, оформление', icon: Settings },
  ];

  const confirm = (title: string, msg: string | undefined, action: () => void) =>
    Alert.alert(title, msg, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Да', style: 'destructive', onPress: action },
    ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
      <T size={26} weight="700">Ещё</T>

      <Card style={{ paddingVertical: 6 }}>
        <MenuRow
          icon={<T weight="700" tone="accent">{user?.name.slice(0, 1).toUpperCase()}</T>}
          title={user?.name ?? ''}
          hint={login ? `${login} · профиль и пароль` : 'Профиль и пароль'}
          onPress={() => nav.push({ name: 'settings-section', key: 'profile' })}
        />
        {items
          .filter((i) => i.show !== false)
          .map(({ route, label, hint, icon: I }) => (
            <View key={label}>
              <Divider />
              <MenuRow icon={<I size={19} color={t.text} />} title={label} hint={hint} onPress={() => nav.push(route)} />
            </View>
          ))}
      </Card>

      {budgets.length > 1 && (
        <Card style={{ paddingVertical: 10 }}>
          <SectionTitle>Открыть бюджет</SectionTitle>
          {budgets.map((b) => (
            <MenuRow
              key={b.id}
              title={b.name}
              hint={b.type === 'personal' ? 'Личный' : b.role === 'owner' ? 'Общий, вы владелец' : b.role === 'viewer' ? 'Общий, просмотр' : 'Общий'}
              onPress={() => setBudgetId(b.id)}
              right={b.id === budgetId ? <Check size={20} color={t.accent} /> : <View />}
            />
          ))}
        </Card>
      )}

      <Card style={{ paddingVertical: 6 }}>
        <MenuRow
          icon={<Server size={19} color={t.text} />}
          title={server?.replace(/^https?:\/\//, '') ?? ''}
          hint={`${meta.data ? `Selfinance ${meta.data.version}` : meta.error ? 'нет связи с сервером' : '…'}${appVersion ? ` · приложение ${appVersion}` : ''}`}
        />
        <Divider />
        <MenuRow
          icon={<ExternalLink size={19} color={t.accent} />}
          title="Открыть веб-версию"
          hint="В браузере"
          onPress={() => server && void Linking.openURL(server)}
        />
        <Divider />
        <MenuRow
          icon={<LogOut size={19} color={t.danger} />}
          title="Выйти"
          danger
          onPress={() => confirm('Выйти из аккаунта?', pendingNote(), () => void signOut())}
        />
        <Divider />
        <MenuRow
          icon={<Server size={19} color={t.danger} />}
          title="Сменить сервер"
          danger
          onPress={() => confirm('Отключиться от сервера?', ['Нужно будет снова ввести адрес и войти.', pendingNote()].filter(Boolean).join(' '), () => void disconnect())}
        />
      </Card>

      <UpdateInfo />
    </ScrollView>
  );
}
