import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type TextInput } from 'react-native';
import type { AuthResponse } from '@selfinance/shared';
import { ApiError, deviceName, post } from '../api';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { Button, Field, T } from '../ui';

export function LoginScreen() {
  const t = useTheme();
  const { server, signIn, disconnect } = useSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const passRef = useRef<ComponentRef<typeof TextInput>>(null);

  async function submit() {
    setError(null);
    setFields({});
    if (!login.trim()) return setFields({ login: 'Укажите email или телефон' });
    if (!password) return setFields({ password: 'Укажите пароль' });
    setBusy(true);
    try {
      const auth = await post<AuthResponse>('/auth/login', { login: login.trim(), password, deviceName: deviceName() });
      await signIn(auth);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
      } else setError('Не удалось войти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6, marginBottom: 8 }}>
          <T size={26} weight="700">Вход</T>
          <T tone="muted" numberOfLines={1}>{server?.replace(/^https?:\/\//, '')}</T>
        </View>
        <Field
          label="Email или телефон"
          value={login}
          onChangeText={setLogin}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          keyboardType="email-address"
          returnKeyType="next"
          onSubmitEditing={() => passRef.current?.focus()}
          error={fields.login}
        />
        <Field
          ref={passRef}
          label="Пароль"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={fields.password}
        />
        {error && !Object.keys(fields).length && <T tone="danger">{error}</T>}
        <Button title="Войти" onPress={submit} loading={busy} />
        <Button title="Другой сервер" kind="ghost" onPress={() => void disconnect()} />
        <T tone="faint" size={13} style={{ textAlign: 'center' }}>
          Регистрация и восстановление пароля — в веб-версии.
        </T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
