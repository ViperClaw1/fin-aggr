/** The demo-data notice; the footer repeats it word for word. */
export const DEMO_DATA_TEXT =
  'Banks, rates and documents on this site are synthetic. Do not use them for financial decisions.';

/** AC-5: on every page, cannot be dismissed. Mounted once in the root layout. */
export function DemoDataBanner() {
  return (
    <aside
      aria-label="Demo data notice"
      className="bg-warn-bg px-4 py-2 text-center text-xs text-warn sm:text-sm"
    >
      <strong>DEMO DATA.</strong> {DEMO_DATA_TEXT}
    </aside>
  );
}
