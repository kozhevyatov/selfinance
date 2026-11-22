import type { ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import Constants from 'expo-constants';
import { Check, ExternalLink, LogOut, Server } from 'lucide-react-native';
import { formatPhone, type Meta } from '@selfinance/shared';
import { get } from '../api';
import { useQuery } from '../query';
import { useBudget, useSession } from '../session';
import { useTheme } from '../theme';
import { Card, SectionTitle, T } from '../ui';

export function MoreScreen() {
  const t = useTheme();
  const { user, server, signOut, disconnect } = useSession();
  const { budgets, budgetId, setBudgetId } = useBudget();
  const meta = useQuery('meta', () => get<Meta>('/meta'));
  const appVersion = Constants.expoConfig?.version ?? '';
  const login = user?.email ?? (user?.phone ? formatPhone(user.phone) : '');

  const confirm = (title: string, action: () => void) =>
    Alert.alert(title, undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Да', style: 'destructive', onPress: action },
    ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
      <T size={26} weight="700">Ещё</T>

      <Card>
        <T size={18} weight="700">{user?.name}</T>
        {!!login && <T tone="muted">{login}</T>}
      </Card>

      {budgets.length > 1 && (
        <Card>
          <SectionTitle>Бюджет</SectionTitle>
          {budgets.map((b) => (
            <Row key={b.id} onPress={() => setBudgetId(b.id)}>
              <View style={{ flex: 1 }}>
                <T weight={b.id === budgetId ? '700' : '400'}>{b.name}</T>
                <T tone="muted" size={13}>
                  {b.type === 'personal' ? 'Личный' : b.role === 'owner' ? 'Общий, вы владелец' : b.role === 'viewer' ? 'Общий, просмотр' : 'Общий'}
                </T>
              </View>
              {b.id === budgetId && <Check size={20} color={t.accent} />}
            </Row>
          ))}
        </Card>
      )}

      <Card>
        <SectionTitle>Сервер</SectionTitle>
        <Row>
          <Server size={20} color={t.muted} />
          <View style={{ flex: 1 }}>
            <T numberOfLines={1}>{server?.replace(/^https?:\/\//, '')}</T>
            <T tone="muted" size={13}>
              {meta.data ? `Selfinance ${meta.data.version}` : meta.error ? 'нет связи' : '…'}
              {appVersion ? ` · приложение ${appVersion}` : ''}
            </T>
          </View>
        </Row>
        <Row onPress={() => server && void Linking.openURL(server)}>
          <ExternalLink size={20} color={t.accent} />
          <View style={{ flex: 1 }}>
            <T tone="accent">Открыть веб-версию</T>
            <T tone="muted" size={13}>Счета, статистика, планы, категории и настройки — пока там</T>
          </View>
        </Row>
      </Card>

      <Card>
        <Row onPress={() => confirm('Выйти из аккаунта?', () => void signOut())}>
          <LogOut size={20} color={t.danger} />
          <T tone="danger">Выйти</T>
        </Row>
        <Row onPress={() => confirm('Отключиться от сервера? Нужно будет снова ввести адрес и войти.', () => void disconnect())}>
          <Server size={20} color={t.danger} />
          <T tone="danger">Сменить сервер</T>
        </Row>
      </Card>
    </ScrollView>
  );
}

function Row({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}
    >
      {children}
    </Pressable>
  );
}
