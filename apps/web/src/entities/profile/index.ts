// Public API of the profile slice. The profile never leaves the browser (ADR-004).
// Export/import and the pure draft views (model/serialize, model/complete) join with their
// first consumer, the profile forms in E4.
export {
  rehydrateProfile,
  useCompleteProfile,
  useProfileActions,
  useProfileDraft,
  useProfileHydrated,
  useProfileStatus,
} from './model/hooks';
