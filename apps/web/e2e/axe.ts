import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** No serious or critical axe violations in the light and the dark scheme. */
export async function expectNoA11yViolations(page: Page, include?: string): Promise<void> {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    // the Next dev tools overlay is not our UI
    let builder = new AxeBuilder({ page }).exclude('nextjs-portal');
    if (include !== undefined) builder = builder.include(include);
    const { violations } = await builder.analyze();
    const blocking = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ colorScheme, id: v.id, targets: v.nodes.map((n) => n.target) }));
    expect(blocking).toEqual([]);
  }
}
