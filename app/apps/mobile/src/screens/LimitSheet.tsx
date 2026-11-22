import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { amountToInput, MONTHS_GEN, parseAmount, type Limits } from '@selfinance/shared';
import { ApiError } from '../api';
import { saveLimits, type Lookups } from '../data';
import { CatIcon } from '../icons';
import { Hint, Select, Sheet, SwitchRow } from '../kit';
import { useBudget } from '../session';
import { radius, useTheme } from '../theme';
import { Button, Field, T } from '../ui';

/** Лимит расходов: общий и по категориям. Изменения действуют с текущего месяца. */
export function LimitSheet({ visible, data, l, month, onClose }: { visible: boolean; data: Limits; l: Lookups; month: string; onClose: () => void }) {
  const t = useTheme();
  const { budgetId, canEdit } = useBudget();
  const initialOverall = data.settings.find((s) => s.categoryId === null)?.amount ?? 0;
  const initialCats = data.settings.filter((s) => s.categoryId !== null);

  const [overall, setOverall] = useState('');
  const [includeRecurring, setIncludeRecurring] = useState(data.includeRecurring);
  const [cats, setCats] = useState<{ categoryId: string; value: string }[]>([]);
  const [adding, setAdding] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // при каждом открытии — свежие значения
  useEffect(() => {
    if (!visible) return;
    setOverall(initialOverall ? amountToInput(initialOverall) : '');
    setIncludeRecurring(data.includeRecurring);
    setCats(initialCats.map((c) => ({ categoryId: c.categoryId as string, value: amountToInput(c.amount) })));
    setAdding('');
    setError(null);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const tops = l.categories.filter((c) => c.type === 'expense' && !c.parentId && !c.isArchived);
  const free = tops.filter((c) => !cats.some((x) => x.categoryId === c.id));

  async function submit() {
    setError(null);
    const set: { categoryId: string | null; amount: number }[] = [];
    const ov = overall.trim() ? parseAmount(overall) : 0;
    if (ov === null || ov < 0) return setError('Проверьте сумму общего лимита');
    if (ov !== initialOverall) set.push({ categoryId: null, amount: ov });
    for (const c of cats) {
      const v = c.value.trim() ? parseAmount(c.value) : 0;
      if (v === null || v < 0) return setError(`Проверьте сумму для «${l.category(c.categoryId)?.name}»`);
      const was = initialCats.find((x) => x.categoryId === c.categoryId)?.amount ?? 0;
      if (v !== was) set.push({ categoryId: c.categoryId, amount: v });
    }
    for (const was of initialCats) {
      if (!cats.some((c) => c.categoryId === was.categoryId)) set.push({ categoryId: was.categoryId, amount: 0 });
    }
    setBusy(true);
    try {
      await saveLimits(budgetId, {
        includeRecurring: includeRecurring !== data.includeRecurring ? includeRecurring : undefined,
        set,
        fromMonth: month,
      });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title="Лимит расходов" onClose={onClose}>
      <Field label="На месяц, всего" value={overall} onChangeText={setOverall} keyboardType="decimal-pad" placeholder="Например, 50 000" />
      <Hint>Оставьте пустым, чтобы убрать лимит.</Hint>
      <SwitchRow
        title="Учитывать обязательные платежи"
        hint="Операции, отмеченные как регулярный платёж (ЖКХ, связь, кредит). Обычно лимит ставят только на повседневные траты."
        value={includeRecurring}
        onChange={setIncludeRecurring}
      />

      <View style={{ gap: 8 }}>
        <T tone="muted" size={13}>Лимиты по категориям</T>
        {cats.map((c, i) => {
          const cat = l.category(c.categoryId);
          return (
            <View key={c.categoryId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <CatIcon name={cat?.icon} color={cat?.color} size={32} />
              <T style={{ flex: 1 }} numberOfLines={1}>{cat?.name ?? '—'}</T>
              <TextInput
                value={c.value}
                onChangeText={(v) => setCats(cats.map((x, j) => (j === i ? { ...x, value: v } : x)))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={t.faint}
                style={{
                  width: 110,
                  minHeight: 42,
                  borderRadius: radius.item,
                  backgroundColor: t.input,
                  color: t.text,
                  paddingHorizontal: 10,
                  textAlign: 'right',
                  fontSize: 16,
                }}
              />
              <Pressable hitSlop={8} onPress={() => setCats(cats.filter((_, j) => j !== i))}>
                <Trash2 size={18} color={t.muted} />
              </Pressable>
            </View>
          );
        })}
        {free.length > 0 && (
          <Select
            value={adding}
            placeholder="+ Добавить категорию"
            options={free.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(id) => {
              setCats([...cats, { categoryId: id, value: '' }]);
              setAdding('');
            }}
          />
        )}
      </View>

      <Hint>
        Изменения действуют с {MONTHS_GEN[Number(month.slice(5)) - 1]} — у прошлых месяцев сохранятся их лимиты. Категорию можно исключить из
        общего лимита в разделе «Категории».
      </Hint>
      {error && <T tone="danger">{error}</T>}
      {canEdit && <Button title="Сохранить" onPress={submit} loading={busy} />}
    </Sheet>
  );
}
