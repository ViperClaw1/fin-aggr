// DRAFT: promises about the user's data, pending Nikita's approval (E5 plan, legal texts). One
// copy for the drawer, the erase question and /privacy, so they never differ. True while the e2e
// AC-4 sentinel passes; revisit in stage 2 (backend, analytics).
export const PROFILE_PRIVACY_TEXT = {
  staysLocal: 'Your profile stays in this browser. It is never sent to our servers.',
  eraseQuestion:
    'Erase your profile from this browser? This cannot be undone. Export it first to keep a copy.',
} as const;
