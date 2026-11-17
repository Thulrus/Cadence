/**
 * Settings → Speech engine: on-device model status, download (progress + cancel) and delete.
 * Bound to the app's OfflineModelService, so a download keeps going if the user leaves
 * Settings, and the panel shows it again on return.
 */
import { formatMB, type OfflineModelService, type OfflineModelState } from '../offline';
import { button, h } from './dom';

export const MODEL_PANEL_CONFIG = {
  /** A first Delete tap arms the button for this long; a second tap deletes. */
  confirmMs: 4000,
} as const;

export interface ModelPanel {
  el: HTMLElement;
  destroy(): void;
}

export function modelPanel(svc: OfflineModelService): ModelPanel {
  const info = svc.info;
  const status = h('p', { className: 'model-status' });
  status.setAttribute('aria-live', 'polite');
  const bar = h('progress', { className: 'model-progress', max: 1, value: 0, hidden: true });
  const usage = h('p', { className: 'field-hint model-usage', hidden: true });
  const download = button('Download model', () => void svc.download(), 'primary');
  const cancel = button('Cancel download', () => svc.cancel());
  let armed: ReturnType<typeof setTimeout> | null = null;
  const disarm = () => {
    if (armed) clearTimeout(armed);
    armed = null;
    del.textContent = 'Delete model';
  };
  const del = button(
    'Delete model',
    () => {
      if (!armed) {
        del.textContent = 'Tap again to delete';
        armed = setTimeout(disarm, MODEL_PANEL_CONFIG.confirmMs);
        return;
      }
      disarm();
      void svc.remove();
    },
    'danger',
  );
  const size = info ? formatMB(info.downloadBytes) : '';

  function showUsage(): void {
    void svc.usage().then((bytes) => {
      usage.hidden = bytes === undefined;
      if (bytes !== undefined) {
        usage.textContent = `Cadence is using ${formatMB(bytes)} of storage on this device.`;
      }
    });
  }

  function render(s: OfflineModelState): void {
    bar.hidden = s.kind !== 'downloading' && s.kind !== 'installing';
    download.hidden = !(s.kind === 'absent' || s.kind === 'error');
    cancel.hidden = s.kind !== 'downloading';
    del.hidden = s.kind !== 'ready';
    if (s.kind !== 'ready') disarm();
    switch (s.kind) {
      case 'checking':
        status.textContent = 'Checking…';
        break;
      case 'unavailable':
        status.textContent =
          'On-device recognition needs on-device storage, which this browser isn’t allowing (private mode?).';
        break;
      case 'absent':
        status.textContent = `Not downloaded. One-time download of about ${size}.`;
        break;
      case 'downloading':
        status.textContent = `Downloading… ${formatMB(s.loaded)} of ${formatMB(s.total)} (${Math.floor((100 * s.loaded) / s.total)}%)`;
        bar.max = s.total;
        bar.value = s.loaded;
        break;
      case 'installing':
        status.textContent = 'Verifying and saving…';
        bar.removeAttribute('value'); // indeterminate
        break;
      case 'ready':
        status.textContent = 'Downloaded. Voice following works offline.';
        showUsage();
        break;
      case 'error':
        status.textContent = s.message;
        break;
    }
  }

  const off = svc.events.on('change', render);
  render(svc.state);
  if (svc.state.kind === 'ready') showUsage();

  const el = h(
    'div',
    { className: 'model-panel' },
    h('h3', {}, 'On-device speech model'),
    h(
      'p',
      { className: 'field-hint' },
      'Recognizes speech on this device: faster than the browser service, private (audio never leaves the device) and works without internet. English only.',
    ),
    status,
    bar,
    h('div', { className: 'model-actions' }, download, cancel, del),
    usage,
  );
  return {
    el,
    destroy() {
      off();
      disarm();
    },
  };
}
