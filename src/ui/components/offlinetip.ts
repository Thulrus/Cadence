/**
 * Library tip promoting the on-device speech model to people who haven't downloaded it.
 * Download happens in place (the app-level service keeps it going across navigation);
 * "No thanks" hides it for good. Settings → Speech engine always has the full controls.
 */
import type { SettingsStore } from '../../storage/settings';
import { browserEnv, detectCapabilities, offlineCapable } from '../capabilities';
import { shouldOfferOffline, type OfflineModelService } from '../offline';
import { button, h } from './dom';
import { modelPanel } from './modelpanel';

export interface OfflineTip {
  el: HTMLElement;
  destroy(): void;
}

export function offlineTip(svc: OfflineModelService, settings: SettingsStore): OfflineTip {
  const capable = offlineCapable(detectCapabilities(browserEnv()));
  const panel = modelPanel(svc, { manage: false });
  const dismiss = button('No thanks', () => {
    settings.update({ engine: { offlineTipDismissed: true } });
  });
  const el = h(
    'aside',
    { className: 'offline-tip' },
    h('h2', {}, 'Faster voice following'),
    h(
      'p',
      {},
      'Cadence can recognize speech on this device instead of using the browser’s service: it keeps up with you with less lag, keeps audio private, and works offline. English only.',
    ),
    panel.el,
    h('div', { className: 'offline-tip-dismiss' }, dismiss),
  );
  el.setAttribute('aria-label', 'On-device speech model');
  /** Seen downloading in this tip: stay up to show "Downloaded" instead of vanishing. */
  let downloaded = false;
  function sync(): void {
    const st = svc.state.kind;
    if (st === 'downloading' || st === 'installing') downloaded = true;
    const dismissed = settings.get().engine.offlineTipDismissed;
    el.hidden = !(downloaded || (!dismissed && shouldOfferOffline(settings, svc, capable)));
    dismiss.hidden = st === 'downloading' || st === 'installing';
    dismiss.textContent = st === 'ready' ? 'Close' : 'No thanks';
  }
  dismiss.addEventListener('click', () => {
    downloaded = false;
    sync();
  });
  const offs = [svc.events.on('change', sync), settings.on('change', sync)];
  sync();
  return {
    el,
    destroy() {
      for (const off of offs) off();
      panel.destroy();
    },
  };
}
