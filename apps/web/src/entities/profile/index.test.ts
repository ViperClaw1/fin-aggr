// The hooks under a server render (Node, no jsdom): useSyncExternalStore takes the store's
// initial state there, so the static shell never shows a profile (ADR-008).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  useCompleteProfile,
  useProfileActions,
  useProfileDraft,
  useProfileHydrated,
  useProfileStatus,
} from './index';
import { profileStore } from './model/store';

function Probe() {
  const view = {
    draft: useProfileDraft(),
    complete: useCompleteProfile(),
    hydrated: useProfileHydrated(),
    status: useProfileStatus(),
    actions: Object.keys(useProfileActions()),
  };
  return createElement('pre', null, JSON.stringify(view));
}
const render = (): unknown =>
  JSON.parse(
    renderToStaticMarkup(createElement(Probe))
      .replace(/^<pre>|<\/pre>$/g, '')
      .replaceAll('&quot;', '"'),
  );

describe('profile hooks on the server', () => {
  it('render the empty, not yet hydrated profile and expose the four actions', () => {
    expect(render()).toEqual({
      draft: {},
      complete: null,
      hydrated: false,
      status: { hydrated: false, resetReason: null, persistError: false, loadError: false },
      actions: ['update', 'replace', 'clearAll', 'acknowledgeReset'],
    });
  });
  it('still render the initial state after the store changed', () => {
    profileStore.getState().update({ stateCode: 'NY' });
    expect((render() as { draft: unknown }).draft).toEqual({});
  });
});
