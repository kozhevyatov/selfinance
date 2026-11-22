import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Archive, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react-native';
import type { Category } from '@selfinance/shared';
import { ApiError } from '../api';
import { categoriesApi, useCategories } from '../data';
import { CatIcon, ICONS } from '../icons';
import { Hint, PageHeader, RoundBtn, Select, Sheet, SwitchRow } from '../kit';
import { useNav } from '../nav';
import { useBudget } from '../session';
import { useTheme } from '../theme';
import { Button, Card, Chip, Field, Segmented, Skeleton, T } from '../ui';

const PALETTE = [
  '#16A34A', '#65A30D', '#059669', '#0D9488', '#0F9F9F', '#0891B2', '#0284C7', '#2563EB', '#4F46E5', '#7C3AED', '#9333EA',
  '#C026D3', '#DB2777', '#BE185D', '#E11D48', '#DC2626', '#EA580C', '#E8892E', '#CA8A04', '#A16207', '#6B7280', '#334155',
];
const PICKABLE = Object.keys(ICONS).filter((k) => k !== 'swap' && k !== 'adjust');

type Editing = { cat: Category | null; type: 'income' | 'expense'; parentId: string | null };

export function CategoriesScreen() {
  const t = useTheme();
  const nav = useNav();
  const { budgetId, canEdit } = useBudget();
  const { data: all = [], loading } = useCategories();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [moving, setMoving] = useState(false);

  const visible = all.filter((c) => c.type === type && (showArchived || !c.isArchived)).sort((a, b) => a.sort - b.sort);
  const tops = visible.filter((c) => !c.parentId);
  const subsOf = (id: string) => visible.filter((c) => c.parentId === id);
  const archivedCount = all.filter((c) => c.type === type && c.isArchived).length;

  /** Вверх/вниз среди соседей: перенумеровываем sort по порядку. */
  async function move(list: Category[], index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const order = [...list];
    [order[index], order[j]] = [order[j], order[index]];
    setMoving(true);
    try {
      await Promise.all(order.map((c, i) => (c.sort !== i ? categoriesApi(budgetId).save({ sort: i }, c.id) : null)));
    } finally {
      setMoving(false);
    }
  }

  const row = (c: Category, list: Category[], i: number, sub = false) => (
    <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingLeft: sub ? 30 : 0, opacity: c.isArchived ? 0.5 : 1 }}>
      <Pressable
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
        disabled={!canEdit}
        onPress={() => setEditing({ cat: c, type, parentId: c.parentId })}
      >
        <CatIcon name={c.icon} color={c.color} size={sub ? 30 : 38} />
        <View style={{ flex: 1 }}>
          <T weight={sub ? '400' : '600'} numberOfLines={1}>{c.name}</T>
          {(c.isArchived || c.excludeFromLimit) && (
            <T size={12} tone="muted">{[c.isArchived && 'в архиве', c.excludeFromLimit && 'не в лимите'].filter(Boolean).join(' · ')}</T>
          )}
        </View>
      </Pressable>
      {canEdit && (
        <View style={{ flexDirection: 'row' }}>
          <Pressable hitSlop={4} disabled={i === 0 || moving} onPress={() => void move(list, i, -1)} style={{ padding: 6, opacity: i === 0 ? 0.25 : 1 }}>
            <ArrowUp size={18} color={t.muted} />
          </Pressable>
          <Pressable hitSlop={4} disabled={i === list.length - 1 || moving} onPress={() => void move(list, i, 1)} style={{ padding: 6, opacity: i === list.length - 1 ? 0.25 : 1 }}>
            <ArrowDown size={18} color={t.muted} />
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <PageHeader
        title="Категории"
        onBack={nav.pop}
        right={
          canEdit ? (
            <Pressable hitSlop={8} onPress={() => setEditing({ cat: null, type, parentId: null })} style={{ padding: 6 }}>
              <Plus size={24} color={t.accent} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'expense', label: 'Расходы', tone: 'expense' },
            { value: 'income', label: 'Доходы', tone: 'income' },
          ]}
        />
        {archivedCount > 0 && (
          <View style={{ flexDirection: 'row' }}>
            <Chip label={`Архив (${archivedCount})`} active={showArchived} onPress={() => setShowArchived(!showArchived)} />
          </View>
        )}
        <Card>
          {loading ? (
            <Skeleton height={300} />
          ) : tops.length ? (
            tops.map((tp, i) => {
              const subs = subsOf(tp.id);
              return (
                <View key={tp.id}>
                  {row(tp, tops, i)}
                  {subs.map((s, j) => row(s, subs, j, true))}
                </View>
              );
            })
          ) : (
            <T tone="muted">Категорий пока нет</T>
          )}
          <Hint style={{ marginTop: 12 }}>
            Категории необязательны. Удалённая категория, по которой уже есть операции, уходит в архив — история не теряется.
          </Hint>
        </Card>
      </ScrollView>

      <CategorySheet
        key={editing ? editing.cat?.id ?? `new-${editing.parentId ?? ''}` : 'none'}
        editing={editing}
        all={all}
        onClose={() => setEditing(null)}
        onAddSub={(p) => {
          setEditing(null);
          setTimeout(() => setEditing({ cat: null, type: p.type, parentId: p.id }), 450);
        }}
      />
    </View>
  );
}

function CategorySheet({
  editing,
  all,
  onClose,
  onAddSub,
}: {
  editing: Editing | null;
  all: Category[];
  onClose: () => void;
  onAddSub: (parent: Category) => void;
}) {
  const t = useTheme();
  const { budgetId } = useBudget();
  const cat = editing?.cat ?? null;
  const parent = all.find((c) => c.id === (cat?.parentId ?? editing?.parentId));
  const [name, setName] = useState(cat?.name ?? '');
  const [icon, setIcon] = useState(cat?.icon ?? parent?.icon ?? 'dots');
  const [color, setColor] = useState(cat?.color ?? parent?.color ?? PALETTE[4]);
  const [parentId, setParentId] = useState<string>(cat?.parentId ?? editing?.parentId ?? '');
  const [excludeFromLimit, setExcludeFromLimit] = useState(cat?.excludeFromLimit ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const api = categoriesApi(budgetId);

  if (!editing) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;

  const hasChildren = !!cat && all.some((c) => c.parentId === cat.id && !c.isArchived);
  const parents = all.filter((c) => c.type === editing.type && !c.parentId && c.id !== cat?.id && !c.isArchived);
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Не получилось');

  async function submit() {
    setError(null);
    if (!name.trim()) return setError('Укажите название');
    setBusy(true);
    try {
      await api.save(
        {
          ...(cat ? {} : { type: editing!.type }),
          name: name.trim(),
          icon,
          color,
          parentId: parentId || null,
          ...(cat && !cat.parentId ? { excludeFromLimit } : {}),
        },
        cat?.id,
      );
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const onDelete = () =>
    cat &&
    Alert.alert(hasChildren ? `Удалить «${cat.name}» вместе с подкатегориями?` : `Удалить «${cat.name}»?`, undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          api.remove(cat.id).then((r) => {
            if (r.archived) Alert.alert('По категории есть операции, поэтому она перенесена в архив');
            onClose();
          }, fail),
      },
    ]);

  return (
    <Sheet
      visible
      title={cat ? cat.name : parent ? `Подкатегория в «${parent.name}»` : 'Новая категория'}
      onClose={onClose}
      right={cat ? <RoundBtn onPress={onDelete}><Trash2 size={20} color={t.danger} /></RoundBtn> : undefined}
    >
      <View style={{ alignItems: 'center' }}>
        <CatIcon name={icon} color={color} size={60} />
      </View>
      <Field label="Название" value={name} onChangeText={setName} maxLength={100} autoFocus={!cat} />

      <View style={{ gap: 8 }}>
        <T tone="muted" size={13}>Иконка</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PICKABLE.map((k) => (
            <Pressable
              key={k}
              onPress={() => setIcon(k)}
              style={{ borderRadius: 22, borderWidth: 2, borderColor: icon === k ? color : 'transparent', padding: 1 }}
            >
              <CatIcon name={k} color={icon === k ? color : null} size={38} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <T tone="muted" size={13}>Цвет</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {PALETTE.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: 3, borderColor: color === c ? t.text : 'transparent' }}
            />
          ))}
        </View>
      </View>

      {!hasChildren && (
        <Select
          label="Где находится"
          value={parentId}
          options={[{ value: '', label: 'Отдельная категория' }, ...parents.map((p) => ({ value: p.id, label: `Внутри «${p.name}»` }))]}
          onChange={setParentId}
        />
      )}

      {cat && !cat.parentId && cat.type === 'expense' && (
        <SwitchRow
          title="Не учитывать в лимите"
          hint="Траты этой категории не идут в общий лимит месяца"
          value={excludeFromLimit}
          onChange={setExcludeFromLimit}
        />
      )}

      {cat && !cat.parentId && !cat.isArchived && (
        <Button title="Добавить подкатегорию" kind="secondary" icon={<Plus size={18} color={t.text} />} onPress={() => onAddSub(cat)} />
      )}

      {error && <T tone="danger">{error}</T>}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {cat && (
          <Button
            title={cat.isArchived ? 'Вернуть' : 'В архив'}
            kind="secondary"
            icon={<Archive size={18} color={t.text} />}
            onPress={() => api.save({ isArchived: !cat.isArchived }, cat.id).then(onClose, fail)}
          />
        )}
        <Button title={cat ? 'Сохранить' : 'Добавить'} onPress={submit} loading={busy} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}
