// The site footer: the info pages, the demo-data and privacy notices already used on the site
// (no new legal wording), and the date the data set describes. A server component.
import Link from 'next/link';
import { PROFILE_PRIVACY_TEXT } from '@/shared/config';
import { DEMO_DATA_TEXT } from '@/shared/ui/demo-banner';
import { absoluteDate } from '@/shared/ui/freshness';
import { loadDataset } from '../api/load';

const LINKS = [
  { href: '/methodology', label: 'Methodology' },
  { href: '/disclosure', label: 'Advertiser disclosure' },
  { href: '/privacy', label: 'Privacy' },
] as const;

export async function SiteFooter() {
  const dataset = await loadDataset();
  return (
    // sticky to 100dvh: on a page shorter than the screen the footer sits at the bottom edge, with
    // no blank strip under it; on a longer page it is in the flow at the end, as usual
    <footer className="sticky top-[100dvh] mt-16 border-t border-divider">
      <div className="mx-auto flex max-w-page flex-col gap-6 px-4 py-8 text-sm sm:px-8">
        <nav aria-label="Site information">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                {/* prefetch off: a partial prefetch keeps its request open (see compare page) */}
                <Link href={l.href} prefetch={false} className="text-muted hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-2 text-xs text-muted">
          <p>
            <strong className="font-semibold">DEMO DATA.</strong> {DEMO_DATA_TEXT}
          </p>
          <p>{PROFILE_PRIVACY_TEXT.staysLocal}</p>
          <p>
            {dataset.isMock ? 'Demo data set' : 'Data set'} as of{' '}
            <time dateTime={dataset.asOf}>{absoluteDate(dataset.asOf)}</time>.
          </p>
        </div>
      </div>
    </footer>
  );
}
