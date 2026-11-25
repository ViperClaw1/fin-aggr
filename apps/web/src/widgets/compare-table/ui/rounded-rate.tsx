import { formatRateDisplay, type Rate } from '@fa/contracts';
import { roundPercentText } from '../model/percent-display';

/** A list APY at two decimals. The exact rate is the tooltip and stays in the row details. */
export function RoundedRate({ rate }: { rate: Rate }) {
  const exact = formatRateDisplay(rate);
  return (
    <span className="tabular-nums" title={exact}>
      {roundPercentText(exact)}
    </span>
  );
}
