import type { RouteName } from './router';
import { button, h } from './components/dom';

/** Routes where the update banner is held back, so nothing distracts or reloads mid-talk. */
export const UPDATE_QUIET_ROUTES: readonly RouteName[] = ['prompter'];

/** Show the banner only when an update is waiting, not dismissed, and we're not prompting. */
export function updateBannerVisible(
  waiting: boolean,
  dismissed: boolean,
  route: RouteName | undefined,
): boolean {
  return waiting && !dismissed && (route === undefined || !UPDATE_QUIET_ROUTES.includes(route));
}

export interface UpdateBanner {
  el: HTMLElement;
  /** A new service worker is installed and waiting. */
  setWaiting(): void;
  /** Re-evaluate visibility (call on route change). */
  refresh(): void;
}

/**
 * Non-modal "Update available" banner. `apply` (activate the waiting SW and reload) runs
 * only when the user taps Reload; the banner is hidden on the prompter route.
 */
export function createUpdateBanner(
  currentRoute: () => RouteName | undefined,
  apply: () => void,
): UpdateBanner {
  let waiting = false;
  let dismissed = false;
  const el = h(
    'div',
    { className: 'notice notice-info update-banner', hidden: true },
    h('span', {}, 'Update available.'),
    h(
      'span',
      { className: 'update-actions' },
      button('Reload', () => apply(), 'primary'),
      button('Later', () => {
        dismissed = true;
        refresh();
      }),
    ),
  );
  el.setAttribute('role', 'status');
  function refresh(): void {
    el.hidden = !updateBannerVisible(waiting, dismissed, currentRoute());
  }
  return {
    el,
    setWaiting() {
      waiting = true;
      refresh();
    },
    refresh,
  };
}
