/**
 * Валюты бюджета. Суммы везде хранятся в сотых долях (копейки, центы…),
 * поэтому в списке только валюты с двумя знаками после запятой.
 * Валюта бюджета — только обозначение: при её смене суммы не пересчитываются.
 */
export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'RUB', symbol: '₽', name: 'Российский рубль' },
  { code: 'USD', symbol: '$', name: 'Доллар США' },
  { code: 'EUR', symbol: '€', name: 'Евро' },
  { code: 'KZT', symbol: '₸', name: 'Казахстанский тенге' },
  { code: 'BYN', symbol: 'Br', name: 'Белорусский рубль' },
  { code: 'UAH', symbol: '₴', name: 'Украинская гривна' },
  { code: 'UZS', symbol: 'сўм', name: 'Узбекский сум' },
  { code: 'KGS', symbol: 'сом', name: 'Киргизский сом' },
  { code: 'TJS', symbol: 'смн', name: 'Таджикский сомони' },
  { code: 'AMD', symbol: '֏', name: 'Армянский драм' },
  { code: 'AZN', symbol: '₼', name: 'Азербайджанский манат' },
  { code: 'GEL', symbol: '₾', name: 'Грузинский лари' },
  { code: 'MDL', symbol: 'L', name: 'Молдавский лей' },
  { code: 'TRY', symbol: '₺', name: 'Турецкая лира' },
  { code: 'CNY', symbol: '¥', name: 'Китайский юань' },
  { code: 'GBP', symbol: '£', name: 'Фунт стерлингов' },
  { code: 'CHF', symbol: 'Fr', name: 'Швейцарский франк' },
  { code: 'AED', symbol: 'AED', name: 'Дирхам ОАЭ' },
  { code: 'THB', symbol: '฿', name: 'Тайский бат' },
  { code: 'INR', symbol: '₹', name: 'Индийская рупия' },
  { code: 'PLN', symbol: 'zł', name: 'Польский злотый' },
  { code: 'CZK', symbol: 'Kč', name: 'Чешская крона' },
  { code: 'ILS', symbol: '₪', name: 'Израильский шекель' },
  { code: 'CAD', symbol: 'C$', name: 'Канадский доллар' },
  { code: 'AUD', symbol: 'A$', name: 'Австралийский доллар' },
];

export const DEFAULT_CURRENCY = 'RUB';
export const currencyCodes = CURRENCIES.map((c) => c.code) as [string, ...string[]];

export function currencyInfo(code: string | null | undefined): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? { code: code || DEFAULT_CURRENCY, symbol: code || '₽', name: code || '' };
}

export function currencySymbol(code: string | null | undefined): string {
  return currencyInfo(code).symbol;
}

/* Текущая валюта для форматирования. Веб-клиент выставляет её при выборе бюджета. */
let current = DEFAULT_CURRENCY;

export function setCurrentCurrency(code: string | null | undefined) {
  current = code || DEFAULT_CURRENCY;
}

export function getCurrentCurrency(): string {
  return current;
}
