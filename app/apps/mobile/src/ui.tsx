import type { ComponentRef, ReactNode, Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { currencySymbol, getCurrentCurrency, moneyParts } from '@selfinance/shared';
import { radius, useTheme } from './theme';

/* ---------- текст ---------- */

type Tone = 'text' | 'muted' | 'faint' | 'accent' | 'income' | 'expense' | 'frozen' | 'credit' | 'transfer' | 'danger';

export function T({
  tone = 'text',
  size = 15,
  weight,
  style,
  ...rest
}: TextProps & { tone?: Tone; size?: number; weight?: TextStyle['fontWeight'] }) {
  const t = useTheme();
  return <Text {...rest} style={[{ color: t[tone], fontSize: size, fontWeight: weight }, style]} />;
}

/** «12 345,67 ₽» с приглушёнными копейками и табличными цифрами. */
export function Money({
  value: raw,
  sign = 'auto',
  round,
  size = 15,
  weight = '600',
  tone,
  style,
}: {
  value: number;
  sign?: 'auto' | 'always' | 'never';
  size?: number;
  weight?: TextStyle['fontWeight'];
  tone?: Tone;
  style?: StyleProp<TextStyle>;
  /** до целых рублей, без копеек */
  round?: boolean;
}) {
  const t = useTheme();
  const value = round ? Math.round(raw / 100) * 100 : raw;
  const p = moneyParts(value, { sign });
  const color = tone ? t[tone] : t.text;
  return (
    <Text style={[{ color, fontSize: size, fontWeight: weight, fontVariant: ['tabular-nums'] }, style]} numberOfLines={1}>
      {p.sign}
      {p.rub}
      {p.kop && <Text style={{ opacity: 0.55 }}>{p.kop}</Text>}
      <Text style={{ opacity: 0.7 }}>{' ' + currencySymbol(getCurrentCurrency())}</Text>
    </Text>
  );
}

/* ---------- контейнеры ---------- */

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.card,
          borderRadius: radius.panel,
          padding: 16,
          borderWidth: t.dark ? StyleSheet.hairlineWidth : 0,
          borderColor: t.border,
          shadowColor: '#000',
          shadowOpacity: t.dark ? 0 : 0.05,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
          elevation: t.dark ? 0 : 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <T size={17} weight="700">{children}</T>
      {right}
    </View>
  );
}

export function Center({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: t.bg }}>{children}</View>;
}

export function Spinner() {
  const t = useTheme();
  return <ActivityIndicator color={t.accent} />;
}

/* ---------- кнопки и поля ---------- */

export function Button({
  title,
  onPress,
  kind = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'secondary' ? t.input : 'transparent';
  const fg = kind === 'primary' ? t.accentText : kind === 'danger' ? t.danger : kind === 'ghost' ? t.accent : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          minHeight: 50,
          borderRadius: radius.item,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 18,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  style,
  ref,
  ...rest
}: TextInputProps & { label?: string; error?: string; ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label && <T tone="muted" size={13}>{label}</T>}
      <TextInput
        ref={ref}
        placeholderTextColor={t.faint}
        {...rest}
        style={[
          {
            backgroundColor: t.input,
            color: t.text,
            borderRadius: radius.item,
            paddingHorizontal: 14,
            minHeight: 50,
            fontSize: 16,
            borderWidth: 1,
            borderColor: error ? t.danger : 'transparent',
          },
          style,
        ]}
      />
      {error && <T tone="danger" size={13}>{error}</T>}
    </View>
  );
}

/** Переключатель вариантов: «Расход / Доход / Перевод». */
export function Segmented<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: { value: V; label: string; tone?: Tone }[];
  onChange: (v: V) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.input, borderRadius: radius.item, padding: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? t.card : 'transparent',
            }}
          >
            <Text style={{ color: active ? t[o.tone ?? 'text'] : t.muted, fontWeight: active ? '700' : '500', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress: () => void; color?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        minHeight: 38,
        borderRadius: 19,
        justifyContent: 'center',
        backgroundColor: active ? t.accentSoft : t.input,
        borderWidth: 1,
        borderColor: active ? color ?? t.accent : 'transparent',
      }}
    >
      <Text style={{ color: active ? color ?? t.accent : t.text, fontWeight: active ? '600' : '400', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Не удалось загрузить';
  return (
    <View style={{ alignItems: 'center', gap: 12, padding: 16 }}>
      <T tone="muted" style={{ textAlign: 'center' }}>{msg}</T>
      {onRetry && <Button title="Повторить" kind="secondary" onPress={onRetry} />}
    </View>
  );
}

export function Skeleton({ height }: { height: number }) {
  const t = useTheme();
  return <View style={{ height, borderRadius: radius.item, backgroundColor: t.input }} />;
}
