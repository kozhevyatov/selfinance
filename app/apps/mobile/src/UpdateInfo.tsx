import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { ArrowUpCircle, RefreshCw } from 'lucide-react-native';
import { checkVersion, useVersion } from './data';
import { useSession } from './session';
import { useTheme } from './theme';
import { Card, T } from './ui';

const UPDATE_CMD = 'docker compose pull && docker compose up -d';

/** Есть ли обновление сервера, о котором стоит сказать (обновляет сервер только администратор). */
export function useUpdateBadge() {
  const { user } = useSession();
  const { data } = useVersion();
  return !!user?.isAdmin && !!data?.updateAvailable;
}

/** Блок внизу «Ещё»: версия сервера и подсказка про обновление, как в веб-версии. */
export function UpdateInfo() {
  const t = useTheme();
  const { user } = useSession();
  const { data: info } = useVersion();
  const [checking, setChecking] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const admin = !!user?.isAdmin;
  if (!info) return null;

  const check = async () => {
    setChecking(true);
    try {
      await checkVersion();
    } catch {
      /* нет связи — останется прежний ответ */
    } finally {
      setChecking(false);
    }
  };

  const checkBtn = info.enabled && admin && (
    <Pressable onPress={() => void check()} disabled={checking} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <RefreshCw size={13} color={t.accent} />
      <T size={13} tone="accent" weight="600">{checking ? 'Проверяю…' : 'Проверить'}</T>
    </Pressable>
  );

  if (!info.updateAvailable) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
        <T size={13} tone="muted">
          Selfinance {info.current}
          {info.enabled && !info.error && info.latest ? ' · последняя версия' : ''}
          {info.error ? ` · ${info.error.toLowerCase()}` : ''}
        </T>
        {checkBtn}
      </View>
    );
  }

  return (
    <Card style={{ gap: 10, borderWidth: 1, borderColor: t.accent }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <ArrowUpCircle size={22} color={t.accent} />
        <View style={{ flex: 1 }}>
          <T weight="700">Доступна новая версия {info.latest}</T>
          <T size={13} tone="muted">
            У вас {info.current}. {admin ? 'Рекомендуем обновить сервер.' : 'Обновить сервер может администратор.'}
          </T>
        </View>
      </View>

      {info.notes.length > 0 && (
        <>
          <Pressable onPress={() => setShowNotes(!showNotes)} hitSlop={6}>
            <T size={14} tone="accent" weight="600">{showNotes ? 'Скрыть, что нового' : 'Что нового'}</T>
          </Pressable>
          {showNotes &&
            info.notes.map((n) => (
              <View key={n.version} style={{ gap: 4 }}>
                <T weight="700">{n.version}</T>
                {n.items.map((it, i) => (
                  <T key={i} size={13} style={{ lineHeight: 18 }}>• {it}</T>
                ))}
              </View>
            ))}
        </>
      )}

      {admin && (
        <>
          <T size={13} tone="muted">В папке с docker-compose.yml на сервере выполните (текст можно выделить и скопировать):</T>
          <View style={{ backgroundColor: t.input, borderRadius: 10, padding: 10 }}>
            <T selectable size={13} style={{ fontFamily: 'Menlo' }}>{UPDATE_CMD}</T>
          </View>
          <T size={13} tone="muted">Данные в папке data не затрагиваются. Если собираете сами — git pull и docker compose up -d --build.</T>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Pressable onPress={() => void Linking.openURL(`https://github.com/${info.repo}`)} hitSlop={6}>
              <T size={13} tone="accent" weight="600">Страница на GitHub</T>
            </Pressable>
            {checkBtn}
          </View>
        </>
      )}
    </Card>
  );
}
