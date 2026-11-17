import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crawler',
  description: 'Who reads public bank rate pages, what is collected, and how to opt out.',
  alternates: { canonical: '/bot' },
};

// Approved by the owner on 2026-11-17. Not legal advice.
export default function BotPage() {
  return (
    <>
      <h1>Crawler</h1>
      <p>
        FA reads public rate pages of banks so the comparison can cite the bank&apos;s own site.
        This page is who we are and how to ask us to stop.
      </p>
      <h2>Who we are</h2>
      <p>
        FA is a deposit comparison site. The crawler identifies itself as FA and links here. The
        address in the user agent is a project mailbox, not a personal one.
      </p>
      <h2>What we collect</h2>
      <p>
        Public certificate and savings rates: the term, the APY, the minimum deposit, the balance
        tiers, and an early-withdrawal penalty when the page states one. We also keep the date the
        page says the rates are accurate. We do not collect account numbers, logins, or anything
        behind a sign-in.
      </p>
      <h2>How often</h2>
      <p>
        At most once a night, and at least ten seconds between requests to the same site. A page
        that has not changed is skipped. If the site asks us to stop, or answers with a block, we
        stop and leave the last published rates in place.
      </p>
      <h2>Opt out</h2>
      <p>
        Email the address in the user agent and name the bank. We exclude that bank within 24 hours.
        The exclusion stays even if the reply is late.
      </p>
    </>
  );
}
