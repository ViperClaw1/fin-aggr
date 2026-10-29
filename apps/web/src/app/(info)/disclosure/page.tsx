import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Advertiser disclosure',
  description: 'How sponsored offers are labeled and kept apart from the comparison.',
  alternates: { canonical: '/disclosure' },
};

// Draft from ADR-006: organic results and ads are separate.
export default function DisclosurePage() {
  return (
    <>
      <h1>Advertiser disclosure</h1>
      <p>
        This site may show sponsored offers. We may be paid when you click one. Sponsored offers
        never change the comparison.
      </p>
      <h2>How we keep ads apart</h2>
      <ul>
        <li>
          Every ad says &ldquo;Sponsored&rdquo; in words and names the advertiser, with its own
          disclosure.
        </li>
        <li>Ads appear next to the results, never inside a table or a list of results.</li>
        <li>
          The ranking does not receive any advertising data, so an advertiser cannot buy a position.
        </li>
        <li>Links in ads are marked as sponsored.</li>
      </ul>
    </>
  );
}
