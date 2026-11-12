import { useState, type FormEvent } from 'react';
import { Archive, ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import type { Category } from '@selfinance/shared';
import { TopBar } from '../components/Layout';
import { ApiError } from '../lib/api';
import { useBudget } from '../lib/budget';
import { CatIcon, ICONS } from '../lib/icons';
import { useCategories, useDeleteCategory, useSaveCategory } from '../lib/queries';

const PALETTE = ['#16A34A', '#0D9488', '#0891B2', '#2563EB', '#4F46E5', '#7C3AED', '#9333EA', '#DB2777', '#E11D48', '#DC2626', '#E8892E', '#CA8A04', '#0F9F9F', '#6B7280'];

type Editing = { cat: Category | null; type: 'income' | 'expense'; parentId: string | null };

export function CategoriesPage() {
  const { data: all = [], isLoading } = useCategories();
  const save = useSaveCategory();
  const { canEdit } = useBudget();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  const visible = all.filter((c) => c.type === type && (showArchived || !c.isArchived));
  const tops = visible.filter((c) => !c.parentId);
  const subsOf = (id: string) => visible.filter((c) => c.parentId === id);
  const archivedCount = all.filter((c) => c.type === type && c.isArchived).length;

  /** Перемещение вверх/вниз среди соседей: перенумеровываем sort по порядку. */
  async function move(list: Category[], index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const order = [...list];
    [order[index], order[j]] = [order[j], order[index]];
    await Promise.all(order.map((c, i) => (c.sort !== i ? save.mutateAsync({ id: c.id, data: { sort: i } }) : null)));
  }

  const row = (c: Category, list: Category[], i: number, sub = false) => (
    <div key={c.id} className={'cat-line' + (sub ? ' sub' : '') + (c.isArchived ? ' archived' : '')}>
      <button type="button" className="cat-line-main" onClick={canEdit ? () => setEditing({ cat: c, type, parentId: c.parentId }) : undefined}>
        <span className={'cat-ic' + (sub ? ' sm' : '')} style={{ ['--c' as string]: c.color ?? 'var(--ink-2)' }}>
          <CatIcon name={c.icon} size={sub ? 16 : 19} />
        </span>
        <span className="cat-line-name">
          {c.name}
          {c.isArchived && <small> в архиве</small>}
          {c.excludeFromLimit && <small> не в лимите</small>}
        </span>
      </button>
      {canEdit && (
        <span className="cat-line-tools">
          <button type="button" className="icon-btn" aria-label="Выше" disabled={i === 0 || save.isPending} onClick={() => move(list, i, -1)}><ArrowUp size={15} /></button>
          <button type="button" className="icon-btn" aria-label="Ниже" disabled={i === list.length - 1 || save.isPending} onClick={() => move(list, i, 1)}><ArrowDown size={15} /></button>
        </span>
      )}
    </div>
  );

  return (
    <>
      <TopBar title="Категории" />
      <div className="filters-row" style={{ marginBottom: 20 }}>
        <div className="segmented" style={{ width: 260 }}>
          <button type="button" aria-pressed={type === 'expense'} onClick={() => setType('expense')}>Расходы</button>
          <button type="button" aria-pressed={type === 'income'} onClick={() => setType('income')}>Доходы</button>
        </div>
        {archivedCount > 0 && (
          <button className="chip" aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}>
            Архив ({archivedCount})
          </button>
        )}
      </div>

      <section className="panel" style={{ maxWidth: 720 }}>
        <div className="panel-head">
          <h2>{type === 'expense' ? 'Категории расходов' : 'Категории доходов'}</h2>
          {canEdit && (
            <button className="link" onClick={() => setEditing({ cat: null, type, parentId: null })} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Plus size={16} /> Добавить
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="skeleton" style={{ height: 300 }} />
        ) : tops.length ? (
          tops.map((t, i) => {
            const subs = subsOf(t.id);
            return (
              <div key={t.id} className="cat-block">
                {row(t, tops, i)}
                {subs.map((s, j) => row(s, subs, j, true))}
              </div>
            );
          })
        ) : (
          <div className="empty"><p>Категорий пока нет</p></div>
        )}
        <p className="hint" style={{ marginTop: 16, marginBottom: 0 }}>
          Категории необязательны. Удалённая категория, по которой уже есть операции, уходит в архив — история не теряется.
        </p>
      </section>

      {editing && <CategorySheet editing={editing} all={all} onClose={() => setEditing(null)} onAddSub={(p) => setEditing({ cat: null, type: p.type, parentId: p.id })} />}
    </>
  );
}

function CategorySheet({ editing, all, onClose, onAddSub }: { editing: Editing; all: Category[]; onClose: () => void; onAddSub: (parent: Category) => void }) {
  const { cat } = editing;
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const parent = all.find((c) => c.id === (cat?.parentId ?? editing.parentId));
  const [name, setName] = useState(cat?.name ?? '');
  const [icon, setIcon] = useState(cat?.icon ?? parent?.icon ?? 'dots');
  const [color, setColor] = useState(cat?.color ?? parent?.color ?? PALETTE[4]);
  const [parentId, setParentId] = useState<string>(cat?.parentId ?? editing.parentId ?? '');
  const [excludeFromLimit, setExcludeFromLimit] = useState(cat?.excludeFromLimit ?? false);
  const [error, setError] = useState<string | null>(null);

  const hasChildren = !!cat && all.some((c) => c.parentId === cat.id && !c.isArchived);
  const parents = all.filter((c) => c.type === editing.type && !c.parentId && c.id !== cat?.id && !c.isArchived);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({
        id: cat?.id,
        data: {
          ...(cat ? {} : { type: editing.type }),
          name: name.trim(),
          icon,
          color,
          parentId: parentId || null,
          ...(cat && !cat.parentId ? { excludeFromLimit } : {}),
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    }
  }

  async function toggleArchive() {
    if (!cat) return;
    await save.mutateAsync({ id: cat.id, data: { isArchived: !cat.isArchived } });
    onClose();
  }

  async function onDelete() {
    if (!cat) return;
    const msg = hasChildren ? `Удалить «${cat.name}» вместе с подкатегориями?` : `Удалить «${cat.name}»?`;
    if (!confirm(msg)) return;
    const r = await remove.mutateAsync(cat.id);
    if (r.archived) alert('По категории есть операции, поэтому она перенесена в архив');
    onClose();
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>{cat ? cat.name : parent ? `Подкатегория в «${parent.name}»` : 'Новая категория'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <span className="cat-ic" style={{ ['--c' as string]: color, width: 56, height: 56 }}><CatIcon name={icon} size={26} /></span>
        </div>

        <label className="field">
          <span>Название</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus={!cat} />
        </label>

        <div className="sheet-section">
          <span className="label">Иконка</span>
          <div className="icon-grid">
            {Object.keys(ICONS).map((k) => (
              <button key={k} type="button" aria-pressed={icon === k} onClick={() => setIcon(k)} aria-label={k}>
                <CatIcon name={k} size={18} />
              </button>
            ))}
          </div>
        </div>

        <div className="sheet-section">
          <span className="label">Цвет</span>
          <div className="swatches">
            {PALETTE.map((c) => (
              <button key={c} type="button" aria-pressed={color === c} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
            ))}
          </div>
        </div>

        {!hasChildren && (
          <label className="field">
            <span>Где находится</span>
            <select className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Отдельная категория</option>
              {parents.map((p) => <option key={p.id} value={p.id}>Внутри «{p.name}»</option>)}
            </select>
          </label>
        )}

        {cat && !cat.parentId && cat.type === 'expense' && (
          <label className="switch-row">
            <span>
              <b>Не учитывать в лимите</b>
              <small>Траты этой категории не идут в общий лимит месяца</small>
            </span>
            <input type="checkbox" className="switch" checked={excludeFromLimit} onChange={(e) => setExcludeFromLimit(e.target.checked)} />
          </label>
        )}

        {cat && !cat.parentId && !cat.isArchived && (
          <button type="button" className="btn btn-block" style={{ marginBottom: 16 }} onClick={() => onAddSub(cat)}>
            <Plus size={16} /> Добавить подкатегорию
          </button>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="sheet-actions">
          {cat && (
            <>
              <button type="button" className="btn btn-danger" onClick={onDelete} aria-label="Удалить"><Trash2 size={18} /></button>
              <button type="button" className="btn btn-ghost" onClick={toggleArchive}>
                <Archive size={16} /> {cat.isArchived ? 'Вернуть' : 'В архив'}
              </button>
            </>
          )}
          <button className="btn btn-primary" disabled={save.isPending}>{cat ? 'Сохранить' : 'Добавить'}</button>
        </div>
      </form>
    </div>
  );
}
