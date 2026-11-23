import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { ChevronDown, Trash2 } from 'lucide-react-native';
import {
  addDays,
  amountToInput,
  currencySymbol,
  formatMoney,
  getCurrentCurrency,
  isCredit,
  parseAmount,
  sortByUsage,
  todayISO,
  type Account,
  type TxType,
} from '@selfinance/shared';
import { ApiError } from '../api';
import { deleteTx, recurringApi, saveTx, useLookups, useRecurring } from '../data';
import { PERIODS, periodText, REMIND } from '../format';
import { CatIcon } from '../icons';
import { DateStepper, Hint, RoundBtn, Select, Sheet, SwitchRow } from '../kit';
import type { TxSheetOptions } from '../nav';
import { useBudget, useSession } from '../session';
import { KEYS, load, save } from '../storage';
import { useTheme } from '../theme';
import { Button, Chip, Field, Segmented, T } from '../ui';

export function TxSheet({ opts, onClose, onCross }: { opts: TxSheetOptions | null; onClose: () => void; onCross: () => void }) {
  const title = !opts
    ? ''
    : opts.tx
      ? 'Операция'
      : opts.recurring
        ? `Оплата: ${opts.recurring.name}`
        : opts.planned
          ? `${opts.planned.type === 'income' ? 'Поступление' : 'Покупка'}: ${opts.planned.name}`
          : 'Новая операция';
  return (
    <Sheet visible={!!opts} title={title} onClose={onClose} scroll={false}>
      {opts && <TxForm opts={opts} onClose={onClose} onCross={onCross} />}
    </Sheet>
  );
}

function TxForm({ opts, onClose, onCross }: { opts: TxSheetOptions; onClose: () => void; onCross: () => void }) {
  const t = useTheme();
  const { user } = useSession();
  const { budgetId, budgets, canEdit } = useBudget();
  const l = useLookups();
  const { data: rules = [] } = useRecurring();
  const today = todayISO(user?.timezone);
  const edit = opts.tx;
  const pay = opts.recurring;
  const plan = edit ? undefined : opts.planned;
  const canCross = !edit && budgets.filter((b) => b.role !== 'viewer').length > 1;

  // счета по частоте использования: самые ходовые — первыми
  const active = useMemo(() => sortByUsage(l.accounts.filter((a) => !a.isArchived)), [l.accounts]);
  const defaultAcc = (preferred?: string | null) =>
    active.find((a) => a.id === preferred)?.id ?? active.find((a) => !a.isFrozen && !isCredit(a))?.id ?? active[0]?.id ?? '';

  const [type, setType] = useState<TxType>(edit?.type ?? pay?.type ?? (plan ? plan.type ?? 'expense' : opts.type) ?? 'expense');
  const [amountStr, setAmountStr] = useState(edit ? amountToInput(edit.amount) : pay ? amountToInput(pay.amount) : plan ? amountToInput(plan.amount) : '');
  const [categoryId, setCategoryId] = useState<string | null>(edit?.categoryId ?? pay?.categoryId ?? plan?.categoryId ?? null);
  const [accountId, setAccountId] = useState(edit?.accountId ?? pay?.accountId ?? opts.accountId ?? plan?.accountId ?? '');
  const [toAccountId, setToAccountId] = useState(edit?.toAccountId ?? opts.toAccountId ?? '');
  const [date, setDate] = useState(edit?.date ?? today);
  const linkedRule = rules.find((r) => r.id === (edit?.recurringId ?? pay?.id));
  const [comment, setComment] = useState(
    edit?.comment ??
      (pay
        ? pay.name !== l.category(pay.categoryId)?.name ? pay.name : ''
        : plan
          ? plan.name !== l.category(plan.categoryId)?.name ? plan.name : ''
          : ''),
  );
  const [isRecurring, setIsRecurring] = useState(!!(edit?.recurringId || pay));
  const [ruleName, setRuleName] = useState(linkedRule?.name ?? '');
  const [ruleInterval, setRuleInterval] = useState(linkedRule?.intervalMonths ?? 1);
  const [ruleRemind, setRuleRemind] = useState(linkedRule?.remindDays ?? 3);
  useEffect(() => {
    if (!linkedRule) return;
    setRuleName(linkedRule.name);
    setRuleInterval(linkedRule.intervalMonths ?? 1);
    setRuleRemind(linkedRule.remindDays);
  }, [linkedRule?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const touchedAcc = useRef(!!(edit || pay?.accountId || opts.accountId || plan?.accountId));

  // счёт по умолчанию — последний использованный в этом бюджете
  useEffect(() => {
    if (touchedAcc.current || !active.length) return;
    load<string>(KEYS.lastAccount(budgetId)).then((last) => {
      if (touchedAcc.current) return;
      const acc = defaultAcc(last);
      setAccountId(acc);
      if (type === 'transfer') setToAccountId((cur) => cur || active.find((a) => a.id !== acc)?.id || '');
    });
  }, [active.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // перевод, открытый с экрана счёта: «куда» по умолчанию — другой счёт
  useEffect(() => {
    if (type === 'transfer' && !toAccountId && active.length > 1) setToAccountId(active.find((a) => a.id !== accountId)?.id ?? '');
  }, [type, active.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const amount = parseAmount(amountStr);
  const isExpr = /[+\-*/]/.test(amountStr.replace(/^-/, ''));

  const catType = type === 'income' ? 'income' : 'expense';
  const tops = useMemo(
    () => l.categories.filter((c) => c.type === catType && !c.parentId && (!c.isArchived || c.id === categoryId)).sort((a, b) => a.sort - b.sort),
    [l.categories, catType, categoryId],
  );
  const selected = l.category(categoryId);
  const selectedTop = selected?.parentId ? l.category(selected.parentId) : selected;
  const subs = selectedTop
    ? l.categories.filter((c) => c.parentId === selectedTop.id && (!c.isArchived || c.id === categoryId)).sort((a, b) => a.sort - b.sort)
    : [];

  const subCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of l.categories) if (c.parentId && !c.isArchived) m.set(c.parentId, (m.get(c.parentId) ?? 0) + 1);
    return m;
  }, [l.categories]);

  const switchType = (next: TxType) => {
    setType(next);
    if (selected && selected.type !== (next === 'income' ? 'income' : 'expense')) setCategoryId(null);
    if (next === 'transfer' && !toAccountId) setToAccountId(active.find((a) => a.id !== accountId)?.id ?? '');
  };

  const pickAccount = (id: string) => {
    touchedAcc.current = true;
    setAccountId(id);
    if (type === 'transfer' && id === toAccountId) setToAccountId(active.find((a) => a.id !== id)?.id ?? '');
  };

  // регулярные доходы в окне операции не заводим; уже привязанный доход оставляем как есть
  const regularAllowed = type === 'expense' || (type === 'income' && !!(edit?.recurringId ?? pay?.id));

  async function doSave(unlink: boolean) {
    const ruleId = edit?.recurringId ?? pay?.id ?? null;
    setBusy(true);
    try {
      const saved = await saveTx(
        budgetId,
        {
          type,
          amount: amount!,
          date,
          accountId: accountId || null,
          toAccountId: type === 'transfer' ? toAccountId || null : null,
          categoryId: type === 'income' || type === 'expense' ? categoryId : null,
          comment: comment.trim() || null,
          recurringId: unlink ? null : ruleId,
          ...(plan ? { plannedId: plan.id } : {}),
        },
        edit?.id,
      );
      const rapi = recurringApi(budgetId);
      if (unlink && ruleId) await rapi.removeQueued(ruleId);
      else if (isRecurring && regularAllowed && !ruleId) {
        await rapi.saveQueued({ transactionId: saved.id, name: ruleName.trim() || undefined, intervalMonths: ruleInterval, remindDays: ruleRemind });
      } else if (isRecurring && ruleId && linkedRule) {
        const patch: { name?: string; intervalMonths?: number; remindDays?: number } = {};
        if (ruleName.trim() && ruleName.trim() !== linkedRule.name) patch.name = ruleName.trim();
        if (ruleInterval !== (linkedRule.intervalMonths ?? 1)) patch.intervalMonths = ruleInterval;
        if (ruleRemind !== linkedRule.remindDays) patch.remindDays = ruleRemind;
        if (Object.keys(patch).length) await rapi.saveQueued(patch, ruleId);
      }
      if (accountId && type !== 'transfer') void save(KEYS.lastAccount(budgetId), accountId);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
      } else setError('Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    setError(null);
    setFields({});
    if (amount === null || amount === 0 || (type !== 'adjustment' && amount < 0)) return setFields({ amount: 'Введите сумму' });
    if (type === 'transfer') {
      if (active.length < 2) return setError('Для перевода нужен второй счёт — добавьте его в разделе «Счета»');
      if (!accountId || !toAccountId || accountId === toAccountId) return setError('Выберите разные счета');
    }
    const ruleId = edit?.recurringId ?? pay?.id ?? null;
    const unlink = !!ruleId && (!isRecurring || !regularAllowed);
    if (unlink) {
      Alert.alert(`Отключить регулярный платёж${linkedRule ? ` «${linkedRule.name}»` : ''}?`, 'Напоминаний больше не будет.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Отключить', style: 'destructive', onPress: () => void doSave(true) },
      ]);
      return;
    }
    void doSave(false);
  }

  function onDelete() {
    if (!edit) return;
    Alert.alert('Удалить операцию?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTx(budgetId, edit.id);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось удалить');
          }
        },
      },
    ]);
  }

  const showAccount = active.length > 1 || type === 'transfer' || type === 'adjustment';
  const sym = currencySymbol(getCurrentCurrency());
  const amountColor = type === 'income' ? t.income : type === 'expense' ? t.expense : t.text;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 48 }}>
      {plan ? (
        <Hint>
          {plan.type === 'income'
            ? 'Проверьте сумму и сохраните — доход запишется, а план закроется.'
            : 'Проверьте сумму и сохраните — расход запишется, а план закроется.'}
        </Hint>
      ) : type === 'adjustment' ? (
        <Hint>Корректировка баланса счёта. Сумма со знаком: минус уменьшает остаток.</Hint>
      ) : (
        <Segmented
          value={type as 'expense' | 'income' | 'transfer'}
          onChange={switchType}
          options={[
            { value: 'expense', label: 'Расход', tone: 'expense' },
            { value: 'income', label: 'Доход', tone: 'income' },
            { value: 'transfer', label: 'Перевод' },
          ]}
        />
      )}

      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            value={amountStr}
            onChangeText={setAmountStr}
            placeholder="0"
            placeholderTextColor={t.faint}
            autoFocus={!edit && !pay && !plan}
            editable={canEdit}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : type === 'adjustment' ? 'numeric' : 'decimal-pad'}
            returnKeyType="done"
            style={{
              flex: 1,
              fontSize: amountStr.length > 11 ? 30 : 40,
              fontWeight: '700',
              color: amountColor,
              fontVariant: ['tabular-nums'],
              paddingVertical: 4,
            }}
          />
          <T size={32} tone="muted" weight="600">{sym}</T>
        </View>
        {fields.amount ? (
          <T tone="danger" size={13}>{fields.amount}</T>
        ) : isExpr && amount !== null ? (
          <T tone="muted">= {formatMoney(amount)}</T>
        ) : amountStr && amount === null ? (
          <T tone="danger" size={13}>Не получается посчитать</T>
        ) : null}
      </View>

      {(type === 'income' || type === 'expense') && (
        <View style={{ gap: 10 }}>
          <T tone="muted" size={13}>Категория{fields.categoryId ? ` — ${fields.categoryId}` : ''}</T>
          <View style={{ rowGap: 12 }}>
            {/* категории рядами по CAT_COLS; подкатегории раскрываются сразу под рядом выбранной категории */}
            {chunk(tops, CAT_COLS).map((row, ri) => {
              const col = selectedTop ? row.findIndex((c) => c.id === selectedTop.id) : -1;
              return (
                <View key={ri} style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row' }}>
                    {row.map((c) => {
                      const on = selectedTop?.id === c.id;
                      const hasSubs = (subCount.get(c.id) ?? 0) > 0;
                      const tint = c.color || t.accent;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => setCategoryId(on && selected?.id === c.id ? null : c.id)}
                          style={{ width: `${100 / CAT_COLS}%`, alignItems: 'center', gap: 6 }}
                        >
                          <View style={{ borderRadius: 26, borderWidth: 2, borderColor: on ? tint : 'transparent', padding: 2 }}>
                            <CatIcon name={c.icon} color={c.color} size={44} />
                            {hasSubs && (
                              <View
                                style={{
                                  position: 'absolute',
                                  right: -4,
                                  bottom: -4,
                                  width: 20,
                                  height: 20,
                                  borderRadius: 10,
                                  backgroundColor: on ? tint : t.card,
                                  borderWidth: 1.5,
                                  borderColor: on ? t.card : t.border,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <ChevronDown
                                  size={13}
                                  strokeWidth={2.6}
                                  color={on ? '#fff' : t.muted}
                                  style={on && subs.length ? { transform: [{ rotate: '180deg' }] } : undefined}
                                />
                              </View>
                            )}
                          </View>
                          <T size={12} numberOfLines={2} style={{ textAlign: 'center', paddingHorizontal: 2 }} weight={on ? '600' : '400'}>
                            {c.name}
                          </T>
                        </Pressable>
                      );
                    })}
                  </View>
                  {col >= 0 && subs.length > 0 && selectedTop && (
                    <SubsPanel
                      color={selectedTop.color || t.accent}
                      arrowLeft={`${((col + 0.5) / CAT_COLS) * 100}%`}
                      title={`${selectedTop.name}: подкатегория`}
                    >
                      {subs.map((s) => (
                        <Chip
                          key={s.id}
                          label={s.name}
                          active={selected?.id === s.id}
                          onPress={() => setCategoryId(selected?.id === s.id ? selectedTop.id : s.id)}
                          color={selectedTop.color ?? undefined}
                        />
                      ))}
                    </SubsPanel>
                  )}
                </View>
              );
            })}
            {!tops.length && <T tone="faint">Категорий нет — операция попадёт в «Без категории»</T>}
          </View>
        </View>
      )}

      {showAccount && (
        <AccountChips label={type === 'transfer' ? 'Откуда' : 'Счёт'} accounts={active} value={accountId} onChange={pickAccount} />
      )}
      {type === 'transfer' && (
        <AccountChips label="Куда" accounts={active.filter((a) => a.id !== accountId)} value={toAccountId} onChange={setToAccountId} />
      )}
      {type === 'transfer' && active.length < 2 && <Hint>Для перевода нужен второй счёт — добавьте его в разделе «Счета».</Hint>}
      {type === 'transfer' && canCross && (
        <Pressable onPress={onCross} hitSlop={6}>
          <T tone="accent" weight="600">Перевести в другой бюджет →</T>
        </Pressable>
      )}
      {(fields.toAccountId || fields.accountId) && <T tone="danger" size={13}>{fields.toAccountId || fields.accountId}</T>}

      <View style={{ gap: 8 }}>
        <T tone="muted" size={13}>Дата</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[0, -1, -2].map((d) => {
            const v = addDays(today, d);
            return <Chip key={d} label={d === 0 ? 'Сегодня' : d === -1 ? 'Вчера' : 'Позавчера'} active={date === v} onPress={() => setDate(v)} />;
          })}
        </View>
        <DateStepper date={date} today={today} onChange={setDate} />
      </View>

      {!plan && (type === 'expense' || (type === 'income' && !!linkedRule)) && (
        <View style={{ gap: 12 }}>
          <SwitchRow
            title="Регулярный платёж"
            hint={linkedRule ? `«${linkedRule.name}», ${periodText(linkedRule)}` : 'Напомню за несколько дней до следующего платежа'}
            value={isRecurring}
            onChange={setIsRecurring}
          />
          {isRecurring && (
            <View style={{ gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: t.border }}>
              <Field
                label="Название"
                value={ruleName}
                onChangeText={setRuleName}
                maxLength={100}
                placeholder={comment.trim() || selected?.name || 'Например, Интернет'}
              />
              <Select label="Период" value={ruleInterval} options={PERIODS.map((p) => ({ value: p.months, label: p.label }))} onChange={setRuleInterval} />
              <Select label="Напоминать" value={ruleRemind} options={REMIND} onChange={setRuleRemind} />
              <T size={12} tone="muted">
                Следующий платёж — {Number(date.slice(8))}-го числа, {PERIODS.find((p) => p.months === ruleInterval)?.label.toLowerCase()}, считая от даты
                этой операции.
              </T>
            </View>
          )}
        </View>
      )}

      <Field label="Комментарий" value={comment} onChangeText={setComment} placeholder="Необязательно" maxLength={500} error={fields.comment} />

      {error && <T tone="danger">{error}</T>}
      {canEdit ? (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {edit && (
            <RoundBtn onPress={onDelete}>
              <Trash2 size={20} color={t.danger} />
            </RoundBtn>
          )}
          <Button title={edit ? 'Сохранить' : 'Добавить'} onPress={submit} loading={busy} style={{ flex: 1 }} />
        </View>
      ) : (
        <Hint>У вас доступ только для просмотра этого бюджета.</Hint>
      )}
    </ScrollView>
  );
}

function AccountChips({ label, accounts, value, onChange }: { label: string; accounts: Account[]; value: string; onChange: (id: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <T tone="muted" size={13}>{label}</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
        {accounts.map((a) => (
          <Chip
            key={a.id}
            label={a.name + (a.isFrozen ? ' ❄' : '')}
            active={a.id === value}
            onPress={() => onChange(a.id)}
            color={isCredit(a) ? t.credit : a.isFrozen ? t.frozen : undefined}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const CAT_COLS = 4;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** полупрозрачный цвет из #rrggbb (для подложки панели подкатегорий) */
function alpha(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

/** блок подкатегорий со стрелкой-«хвостиком», указывающей на выбранную категорию */
function SubsPanel({ color, arrowLeft, title, children }: { color: string; arrowLeft: `${number}%`; title: string; children: ReactNode }) {
  const t = useTheme();
  const bg = t.card;
  const tint = alpha(color, t.dark ? 0.16 : 0.1);
  const border = alpha(color, 0.4);
  return (
    <View style={{ marginTop: 2 }}>
      <View
        style={{
          position: 'absolute',
          top: -7,
          left: arrowLeft,
          marginLeft: -7,
          width: 14,
          height: 14,
          transform: [{ rotate: '45deg' }],
          backgroundColor: bg,
          borderLeftWidth: 1.5,
          borderTopWidth: 1.5,
          borderColor: border,
          borderTopLeftRadius: 3,
          zIndex: 1,
        }}
      >
        <View style={{ flex: 1, backgroundColor: tint }} />
      </View>
      <View style={{ borderRadius: 14, borderWidth: 1.5, borderColor: border, backgroundColor: bg, overflow: 'hidden' }}>
        <View style={{ backgroundColor: tint, padding: 12, gap: 8 }}>
          <T size={12} tone="muted" weight="500">{title}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
        </View>
      </View>
    </View>
  );
}
