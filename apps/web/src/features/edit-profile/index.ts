// Public API of edit-profile, the only writer of the profile store (ADR-004). The form is a
// dynamic import so a static ScenarioBar import does not put the form in the first load.
export { ScenarioBar } from './ui/scenario-bar';

export function loadProfileForm() {
  return import('./ui/profile-form').then((mod) => mod.ProfileForm);
}
