import { useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { addDays, dayTitle } from '@selfinance/shared';
import { radius, useTheme } from './theme';
import { T } from './ui';

/* ---------- окно снизу (на iOS — карточка, на Android — на весь экран) ---------- */

export function Sheet({
  visible,
  title,
  onClose,
  right,
  children,
  scroll = true,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const kbPad = useAndroidKeyboardPad(rootRef, visible);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: t.card }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
      >
        <View ref={rootRef} style={{ flex: 1, paddingBottom: kbPad }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 16,
              paddingTop: Platform.OS === 'ios' ? 14 : insets.top + 8,
              paddingBottom: 8,
            }}
          >
            <T size={18} weight="700" style={{ flex: 1 }} numberOfLines={1}>{title}</T>
            {right}
            <RoundBtn onPress={onClose}>
              <X size={20} color={t.text} />
            </RoundBtn>
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Android: окно Modal рисуется «от края до края», и система больше не сжимает его под клавиатуру —
 * клавиатура просто перекрывает низ окна. Поэтому сами считаем, сколько окна закрыто клавиатурой,
 * и отдаём это как нижний отступ: прокрутка уменьшается, и поле ввода оказывается над клавиатурой.
 * Если система всё же сжала окно (старые устройства), перекрытие получится нулевым — двойного отступа не будет.
 */
function useAndroidKeyboardPad(ref: RefObject<ComponentRef<typeof View> | null>, active: boolean) {
  const insets = useSafeAreaInsets();
  const [pad, setPad] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android' || !active) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      // клавиатура в событии — без навигационной полосы, а окно уходит под неё
      const kb = e.endCoordinates.height + insets.bottom;
      const kbTop = Dimensions.get('screen').height - kb;
      const node = ref.current;
      if (!node) return setPad(kb);
      node.measureInWindow((_x, y, _w, h) => setPad(h > 0 ? Math.max(0, Math.round(y + h - kbTop)) : kb));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setPad(0));
    return () => {
      show.remove();
      hide.remove();
      setPad(0);
    };
  }, [active, insets.bottom]); // eslint-disable-line react-hooks/exhaustive-deps
  return pad;
}

export function RoundBtn({ children, onPress, disabled }: { children: ReactNode; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: t.input,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

/* ---------- заголовок экрана со стрелкой «назад» ---------- */

export function PageHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6 }}>
      {onBack && (
        <Pressable onPress={onBack} hitSlop={10} style={{ padding: 4 }}>
          <ChevronLeft size={28} color={t.accent} />
        </Pressable>
      )}
      <T size={onBack ? 22 : 26} weight="700" style={{ flex: 1, paddingLeft: onBack ? 0 : 4 }} numberOfLines={1}>
        {title}
      </T>
      {right}
    </View>
  );
}

/* ---------- переключатель с подписью ---------- */

export function SwitchRow({ title, hint, value, onChange, disabled }: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => !disabled && onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <T weight="600">{title}</T>
        {hint && <T tone="muted" size={13}>{hint}</T>}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: t.accent, false: t.border }} thumbColor="#fff" />
    </Pressable>
  );
}

/* ---------- выбор из списка (раскрывается на месте, без второго окна) ---------- */

export interface Option<V> {
  value: V;
  label: string;
  hint?: string;
  indent?: boolean;
}

export function Select<V extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Не выбрано',
  disabled,
}: {
  label?: string;
  value: V;
  options: Option<V>[];
  onChange: (v: V) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 6 }}>
      {label && <T tone="muted" size={13}>{label}</T>}
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={{
          backgroundColor: t.input,
          borderRadius: radius.item,
          minHeight: 50,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <T style={{ flex: 1 }} tone={cur ? 'text' : 'faint'} numberOfLines={1}>{cur?.label ?? placeholder}</T>
        {!disabled && <ChevronDown size={18} color={t.muted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />}
      </Pressable>
      {open && (
        <View style={{ borderRadius: radius.item, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
          {options.map((o, i) => {
            const on = o.value === value;
            return (
              <Pressable
                key={String(o.value) + i}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 46,
                  paddingVertical: 8,
                  paddingLeft: o.indent ? 32 : 14,
                  paddingRight: 14,
                  backgroundColor: pressed ? t.input : t.card,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: t.border,
                })}
              >
                <View style={{ flex: 1 }}>
                  <T weight={on ? '600' : '400'} tone={on ? 'accent' : 'text'}>{o.label}</T>
                  {o.hint && <T size={12} tone="muted">{o.hint}</T>}
                </View>
                {on && <Check size={18} color={t.accent} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/* ---------- пункт меню ---------- */

export function MenuRow({
  icon,
  title,
  hint,
  onPress,
  danger,
  right,
  disabled,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8, opacity: disabled ? 0.5 : pressed ? 0.6 : 1 })}
    >
      {icon && (
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: danger ? t.danger + '1F' : t.input, alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="600" tone={danger ? 'danger' : 'text'}>{title}</T>
        {hint && <T tone="muted" size={13}>{hint}</T>}
      </View>
      {right ?? (onPress && !danger ? <ChevronRight size={18} color={t.faint} /> : null)}
    </Pressable>
  );
}

export function Hint({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <T tone="muted" size={13} style={{ lineHeight: 18 }}>{children}</T>
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border, marginVertical: 4 }} />;
}

/* ---------- выбор даты: стрелки по дням и системный календарь по нажатию ---------- */

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function DateStepper({ date, today, onChange, min, max }: { date: string; today: string; onChange: (d: string) => void; min?: string; max?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false); // календарь на iOS раскрывается прямо под строкой
  const clamp = (d: string) => (min && d < min ? min : max && d > max ? max : d);

  const openCalendar = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(date),
        mode: 'date',
        minimumDate: min ? toDate(min) : undefined,
        maximumDate: max ? toDate(max) : undefined,
        onChange: (e: DateTimePickerEvent, d?: Date) => {
          if (e.type === 'set' && d) onChange(clamp(toIso(d)));
        },
      });
    } else setOpen((o) => !o);
  };

  const btn = (child: ReactNode, fn: () => void, off?: boolean) => (
    <Pressable hitSlop={6} onPress={fn} disabled={off} style={{ padding: 10, opacity: off ? 0.3 : 1 }}>
      {child}
    </Pressable>
  );
  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: t.input,
          borderRadius: radius.item,
          minHeight: 48,
          paddingHorizontal: 2,
        }}
      >
        {btn(<ChevronLeft size={20} color={t.text} />, () => onChange(clamp(addDays(date, -1))), !!min && date <= min)}
        <Pressable
          onPress={openCalendar}
          accessibilityLabel="Выбрать дату в календаре"
          style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, opacity: pressed ? 0.6 : 1 })}
        >
          <CalendarDays size={17} color={t.accent} />
          <T weight="600" numberOfLines={1}>{dayTitle(date, today)}</T>
        </Pressable>
        {btn(<ChevronRight size={20} color={t.text} />, () => onChange(clamp(addDays(date, 1))), !!max && date >= max)}
      </View>
      {open && Platform.OS === 'ios' && (
        <View style={{ backgroundColor: t.input, borderRadius: radius.item, overflow: 'hidden' }}>
          <DateTimePicker
            value={toDate(date)}
            mode="date"
            display="inline"
            locale="ru-RU"
            accentColor={t.accent}
            themeVariant={t.dark ? 'dark' : 'light'}
            minimumDate={min ? toDate(min) : undefined}
            maximumDate={max ? toDate(max) : undefined}
            onChange={(_e: DateTimePickerEvent, d?: Date) => {
              if (d) {
                onChange(clamp(toIso(d)));
                setOpen(false);
              }
            }}
          />
        </View>
      )}
    </View>
  );
}
