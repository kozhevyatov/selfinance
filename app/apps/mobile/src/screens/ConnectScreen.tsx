import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { ApiError, normalizeServer, probeServer } from '../api';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { Button, Field, T } from '../ui';

/** Первый запуск: куда подключаться. Selfinance — self-hosted, у каждого свой сервер. */
export function ConnectScreen() {
  const t = useTheme();
  const { connect } = useSession();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    const url = normalizeServer(value);
    if (!url) return setError('Введите адрес сервера');
    setBusy(true);
    setError(undefined);
    try {
      const meta = await probeServer(url);
      if (!meta.setupDone) {
        setError('Сервер ещё не настроен. Откройте этот адрес в браузере и пройдите мастер настройки.');
        return;
      }
      await connect(url);
    } catch (e) {
      // https не ответил — возможно, сервер в домашней сети без сертификата
      if (url.startsWith('https://') && !/^https?:\/\//i.test(value.trim())) {
        try {
          const http = url.replace('https://', 'http://');
          const meta = await probeServer(http);
          if (meta.setupDone) return await connect(http);
        } catch {
          /* покажем исходную ошибку */
        }
      }
      setError(e instanceof ApiError ? e.message : 'Не удалось подключиться');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: '#4338CA', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={36} color="#fff" strokeWidth={1.8} />
          </View>
          <T size={26} weight="700">Selfinance</T>
          <T tone="muted" style={{ textAlign: 'center' }}>
            Укажите адрес вашего сервера Selfinance — тот же, что вы открываете в браузере.
          </T>
        </View>
        <Field
          label="Адрес сервера"
          placeholder="money.example.ru или 192.168.1.10:1444"
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={error}
        />
        <Button title="Подключиться" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
