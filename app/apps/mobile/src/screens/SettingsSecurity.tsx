import { useEffect, useState } from 'react';
import { Alert, Linking, Modal } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Divider, Hint, Select, SwitchRow } from '../kit';
import { bioLabel, biometricKind, LOCK_TIMEOUTS, PinPad, useLock, type BioKind } from '../lock';
import { askPermission, loadNotify, NOTIFY_HOURS, saveNotify, type NotifySettings } from '../notify';
import { invalidateAll } from '../query';
import { Button, T } from '../ui';

/* ---------- защита: ПИН-код и Face ID / отпечаток ---------- */

export function SecuritySection() {
  const { settings, setPin, update, disable } = useLock();
  const [bio, setBio] = useState<BioKind>(null);
  const [pinFor, setPinFor] = useState<'enable' | 'change' | null>(null);

  useEffect(() => {
    void biometricKind().then(setBio);
  }, []);

  const toggleBio = async (on: boolean) => {
    if (on) {
      // проверяем сразу, что биометрия работает и это владелец
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: `Включить вход по ${bioLabel(bio)}`, cancelLabel: 'Отмена', disableDeviceFallback: true }).catch(() => null);
      if (!r?.success) return;
    }
    await update({ biometric: on });
  };

  return (
    <>
      <SwitchRow
        title="ПИН-код при входе"
        hint="Приложение спросит 4 цифры при открытии"
        value={settings.enabled}
        onChange={(on) => {
          if (on) setPinFor('enable');
          else
            Alert.alert('Выключить ПИН-код?', 'Приложение будет открываться без проверки.', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Выключить', style: 'destructive', onPress: () => void disable() },
            ]);
        }}
      />
      {settings.enabled && (
        <>
          <Divider />
          {bio ? (
            <SwitchRow
              title={bio === 'face' ? 'Face ID' : 'Отпечаток пальца'}
              hint="Входить без ПИН-кода. ПИН останется запасным вариантом"
              value={settings.biometric}
              onChange={(on) => void toggleBio(on)}
            />
          ) : (
            <Hint>Face ID или отпечаток не настроены в телефоне — вход только по ПИН-коду.</Hint>
          )}
          <Divider />
          <Select
            label="Снова спрашивать после сворачивания"
            value={settings.timeoutMin}
            options={LOCK_TIMEOUTS}
            onChange={(v) => void update({ timeoutMin: v })}
          />
          <Button title="Сменить ПИН-код" kind="ghost" onPress={() => setPinFor('change')} />
        </>
      )}
      <Hint>После 5 неверных ПИН-кодов подряд приложение выйдет из аккаунта — нужно будет войти по паролю. Неотправленные изменения при этом сохранятся.</Hint>

      <PinSetup
        visible={!!pinFor}
        onCancel={() => setPinFor(null)}
        onDone={async (pin) => {
          await setPin(pin);
          setPinFor(null);
        }}
      />
    </>
  );
}

function PinSetup({ visible, onCancel, onDone }: { visible: boolean; onCancel: () => void; onDone: (pin: string) => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setFirst(null);
      setError(null);
    }
  }, [visible]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <PinPad
        key={first ?? 'new'}
        title={first ? 'Повторите ПИН-код' : 'Придумайте ПИН-код'}
        hint={first ? undefined : '4 цифры для входа в приложение'}
        error={error}
        onCancel={onCancel}
        onDone={(pin) => {
          if (!first) {
            setError(null);
            setFirst(pin);
            return 'reset';
          }
          if (pin !== first) {
            setFirst(null);
            setError('ПИН-коды не совпали, попробуйте ещё раз');
            return 'reset';
          }
          onDone(pin);
          return undefined;
        }}
      />
    </Modal>
  );
}

/* ---------- напоминания ---------- */

export function NotificationsSection() {
  const [s, setS] = useState<NotifySettings | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    void loadNotify().then(setS);
  }, []);
  if (!s) return null;

  const change = async (patch: Partial<NotifySettings>) => {
    const next = { ...s, ...patch };
    if ((patch.payments || patch.limit) && !(await askPermission())) {
      setDenied(true);
      return;
    }
    setDenied(false);
    setS(next);
    await saveNotify(next);
    invalidateAll(); // пересобрать расписание по свежим данным
  };

  return (
    <>
      <SwitchRow
        title="Регулярные платежи"
        hint="Напомнить за столько дней, сколько указано в правиле, и в день платежа"
        value={s.payments}
        onChange={(v) => void change({ payments: v })}
      />
      {s.payments && (
        <Select label="Время напоминания" value={s.hour} options={NOTIFY_HOURS} onChange={(v) => void change({ hour: v })} />
      )}
      <Divider />
      <SwitchRow
        title="Лимит месяца"
        hint="Сообщить, когда потрачено 80% и когда лимит превышен"
        value={s.limit}
        onChange={(v) => void change({ limit: v })}
      />
      {denied && (
        <>
          <T tone="danger">Уведомления запрещены для Selfinance в настройках телефона.</T>
          <Button title="Открыть настройки телефона" kind="ghost" onPress={() => void Linking.openSettings()} />
        </>
      )}
      <Hint>Напоминания приходят по текущему бюджету и обновляются, когда вы открываете приложение. Нажатие на напоминание о платеже открывает оплату.</Hint>
    </>
  );
}
