// Public API of the profile slice. The profile never leaves the browser (ADR-004).
export {
  PROFILE_DRAWER_KEY,
  PROFILE_FORM_FIELDS,
  useProfileDrawer,
  type ProfileFormField,
} from './model/drawer-url';
export { DEFAULT_SCENARIO } from './model/defaults';
export {
  rehydrateProfile,
  useCompleteProfile,
  useProfileActions,
  useProfileDraft,
  useProfileHydrated,
  useProfileStatus,
} from './model/hooks';
export { exportProfile, MAX_IMPORT_BYTES, parseImport, type ImportResult } from './model/serialize';
