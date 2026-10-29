// Public API of edit-profile, the only writer of the profile store (ADR-004). Load it with
// import() (widgets/profile-drawer), so the form stays out of every route's first load.
export { ProfileForm } from './ui/profile-form';
