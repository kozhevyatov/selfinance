import { useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { LockProvider } from './src/lock';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MainScreen } from './src/screens/MainScreen';
import { BudgetProvider, SessionProvider, useSession } from './src/session';
import { KEYS, load, save } from './src/storage';
import { dark, light, ThemeCtx, ThemePrefCtx, type ThemePref } from './src/theme';
import { Button, Center, ErrorBox, Spinner } from './src/ui';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  const scheme = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');
  useEffect(() => {
    load<ThemePref>(KEYS.theme).then((p) => p && setPrefState(p));
  }, []);
  const prefValue = useMemo(
    () => ({
      pref,
      setPref: (p: ThemePref) => {
        setPrefState(p);
        void save(KEYS.theme, p === 'system' ? null : p);
      },
    }),
    [pref],
  );
  const isDark = pref === 'system' ? scheme === 'dark' : pref === 'dark';
  const theme = isDark ? dark : light;
  return (
    <SafeAreaProvider>
      <ThemePrefCtx.Provider value={prefValue}>
        <ThemeCtx.Provider value={theme}>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <SessionProvider>
            <Root />
          </SessionProvider>
        </ThemeCtx.Provider>
      </ThemePrefCtx.Provider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { booting, server, user, signOut } = useSession();

  useEffect(() => {
    if (!booting) void SplashScreen.hideAsync().catch(() => undefined);
  }, [booting]);

  if (booting) return null;
  if (!server) return <ConnectScreen />;
  if (!user) return <LoginScreen />;
  return (
    <LockProvider key={user.id} onTooManyTries={() => void signOut()}>
      <BudgetProvider
        key={user.id}
        fallback={(error, retry) => (
          <Center>
            {error ? (
              <>
                <ErrorBox error={error} onRetry={retry} />
                <Button title="Выйти" kind="ghost" onPress={() => void signOut()} />
              </>
            ) : (
              <Spinner />
            )}
          </Center>
        )}
      >
        <MainScreen />
      </BudgetProvider>
    </LockProvider>
  );
}
