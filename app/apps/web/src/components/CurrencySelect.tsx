import { CURRENCIES } from '@selfinance/shared';

/** Выпадающий список валют: «₽ — Российский рубль (RUB)». */
export function CurrencySelect({ value, onChange, disabled }: { value: string; onChange: (code: string) => void; disabled?: boolean }) {
  const known = CURRENCIES.some((c) => c.code === value);
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {!known && <option value={value}>{value}</option>}
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.symbol} — {c.name} ({c.code})
        </option>
      ))}
    </select>
  );
}

/** Валюта по умолчанию для нового аккаунта — по языку браузера, иначе рубль. */
export function guessCurrency(): string {
  try {
    const region = (navigator.language || '').split('-')[1]?.toUpperCase();
    const byRegion: Record<string, string> = {
      RU: 'RUB', US: 'USD', KZ: 'KZT', BY: 'BYN', UA: 'UAH', UZ: 'UZS', KG: 'KGS', TJ: 'TJS', AM: 'AMD', AZ: 'AZN',
      GE: 'GEL', MD: 'MDL', TR: 'TRY', CN: 'CNY', GB: 'GBP', CH: 'CHF', AE: 'AED', TH: 'THB', IN: 'INR', PL: 'PLN',
      CZ: 'CZK', IL: 'ILS', CA: 'CAD', AU: 'AUD', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', AT: 'EUR',
      FI: 'EUR', PT: 'EUR', GR: 'EUR', IE: 'EUR', BE: 'EUR', LV: 'EUR', LT: 'EUR', EE: 'EUR', CY: 'EUR', ME: 'EUR',
    };
    return (region && byRegion[region]) || 'RUB';
  } catch {
    return 'RUB';
  }
}
