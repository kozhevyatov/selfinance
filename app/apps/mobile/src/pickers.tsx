import type { Account, Category } from '@selfinance/shared';
import { Select, type Option } from './kit';

/** Список категорий одного типа: родитель, под ним подкатегории с отступом. */
export function categoryOptions(categories: Category[], type: 'income' | 'expense', keep?: string | null, empty = 'Без категории'): Option<string>[] {
  const cats = categories.filter((c) => c.type === type && (!c.isArchived || c.id === keep)).sort((a, b) => a.sort - b.sort);
  const tops = cats.filter((c) => !c.parentId);
  return [
    { value: '', label: empty },
    ...tops.flatMap((t) => [
      { value: t.id, label: t.name },
      ...cats.filter((c) => c.parentId === t.id).map((c) => ({ value: c.id, label: c.name, indent: true })),
    ]),
  ];
}

export function CategorySelect({
  categories,
  type,
  value,
  onChange,
  label = 'Категория',
  empty,
}: {
  categories: Category[];
  type: 'income' | 'expense';
  value: string;
  onChange: (v: string) => void;
  label?: string;
  empty?: string;
}) {
  return <Select label={label} value={value} options={categoryOptions(categories, type, value, empty)} onChange={onChange} />;
}

export const accLabel = (a: Account) =>
  a.name + (a.isFrozen ? ' ❄' : '') + (a.kind === 'credit' ? ' · кредитка' : a.kind === 'loan' ? ' · кредит' : '');

export function AccountSelect({
  accounts,
  value,
  onChange,
  label = 'Счёт',
  empty,
}: {
  accounts: Account[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
  /** подпись пустого варианта; без неё пустого варианта нет */
  empty?: string;
}) {
  const options: Option<string>[] = [
    ...(empty ? [{ value: '', label: empty }] : []),
    ...accounts.map((a) => ({ value: a.id, label: accLabel(a) })),
  ];
  return <Select label={label} value={value} options={options} onChange={onChange} />;
}
