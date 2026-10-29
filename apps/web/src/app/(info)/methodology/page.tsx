import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Methodology',
  description: 'How FA computes after-tax interest, ranks products and cites its sources.',
  alternates: { canonical: '/methodology' },
};

// Draft from the engine section of the spec. No tax values here: the numbers live in the data.
export default function MethodologyPage() {
  return (
    <>
      <h1>Methodology</h1>
      <p>
        We rank deposit products by what you keep after tax, not by the headline rate. Every number
        we show has a source, and every calculation shows its steps and assumptions.
      </p>
      <h2>After-tax interest</h2>
      <ul>
        <li>
          The rate tier is chosen by the amount you deposit. Interest is the deposit times the
          annual percentage yield over the holding period.
        </li>
        <li>An early withdrawal penalty follows the product&apos;s own rule.</li>
        <li>
          Federal tax is the difference between the tax on your income with the interest and without
          it. State and city taxes use the rates for your state and the city rate you enter.
        </li>
        <li>
          Each line is rounded to the cent once, at the end. Net yield is simple annual yield: net
          interest over the deposit, per year held.
        </li>
      </ul>
      <h2>Ranking</h2>
      <p>
        Products you can open come first, then products that need more of your profile to tell, then
        products you cannot open. Within each group the order is by net interest. Ads never take
        part in the ranking.
      </p>
      <h2>Sources</h2>
      <p>
        Each rate, penalty and limit links to the document it comes from, with its verification
        status and the date it was retrieved. On this site all data is synthetic demo data.
      </p>
    </>
  );
}
