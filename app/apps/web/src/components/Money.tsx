import { moneyParts } from '@selfinance/shared';
import { useCurrencySymbol } from '../lib/budget';

interface Props {
  value: number;
  sign?: 'auto' | 'always' | 'never';
  className?: string;
  /** не показывать копейки, даже если они есть (для крупных сводных цифр) */
  round?: boolean;
}

export function Money({ value, sign = 'auto', className, round }: Props) {
  const v = round ? Math.round(value / 100) * 100 : value;
  const p = moneyParts(v, { sign });
  const sym = useCurrencySymbol();
  return (
    <span className={'num' + (className ? ' ' + className : '')}>
      {p.sign}
      {p.rub}
      {p.kop && <span className="kop">{p.kop}</span>}
      {' ' + sym}
    </span>
  );
}
