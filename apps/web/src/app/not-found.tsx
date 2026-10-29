import type { Metadata } from 'next';
import { SystemPage } from './system-page';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <SystemPage
      code="404"
      title="Page not found"
      text="This page could not be found. It may have moved, or the link may be wrong."
    />
  );
}
