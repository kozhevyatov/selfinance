import { CURRENCIES } from '@selfinance/shared';
import { Select } from './kit';

export function CurrencySelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Select
      label="Валюта"
      value={value}
      disabled={disabled}
      options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.symbol}  ${c.name}`, hint: c.code }))}
      onChange={onChange}
    />
  );
}
