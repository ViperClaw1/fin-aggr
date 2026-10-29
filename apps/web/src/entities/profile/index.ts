// Public API of the profile slice. The profile never leaves the browser (ADR-004).
export {
  PROFILE_DRAWER_KEY,
  PROFILE_FORM_FIELDS,
  useProfileDrawer,
  type ProfileFormField,
} from './model/drawer-url';
export { DEFAULT_SCENARIO, REQUIRED_FIELDS } from './model/defaults';
export { defaultAssumptions, missingFields } from './model/complete';
export { PROFILE_PRIVACY_TEXT } from './model/privacy-texts';
export {
  rehydrateProfile,
  useCompleteProfile,
  useProfileActions,
  useProfileDraft,
  useProfileHydrated,
  useProfileStatus,
} from './model/hooks';
export { exportProfile, MAX_IMPORT_BYTES, parseImport, type ImportResult } from './model/serialize';
