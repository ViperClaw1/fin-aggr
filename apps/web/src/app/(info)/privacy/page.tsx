import type { Metadata } from 'next';
import { PROFILE_PRIVACY_TEXT } from '@/shared/config';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'Your profile stays in your browser: what is stored, where, and how to erase it.',
  alternates: { canonical: '/privacy' },
};

// Draft from ADR-004: the profile never leaves the browser.
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <p>{PROFILE_PRIVACY_TEXT.staysLocal}</p>
      <h2>Your profile</h2>
      <ul>
        <li>
          Your filing status, state, income and other answers are saved in this browser&apos;s
          storage only.
        </li>
        <li>No request the site makes contains them, and links you share do not carry them.</li>
        <li>
          You can export your profile to a file, import it on another device, or erase it at any
          time from the profile panel.
        </li>
        <li>Clearing your browser data also erases it, so export it first to keep a copy.</li>
      </ul>
      <h2>Third parties</h2>
      <p>The site loads no third-party scripts and sends no analytics.</p>
    </>
  );
}
