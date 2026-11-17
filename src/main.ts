import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { createApp } from './app';

const container = document.querySelector<HTMLElement>('#app');
if (container) {
  // The app lives in a fixed full-screen box and never scrolls the document. If something does
  // (a focus() or scroll chaining in a mobile browser tab), snap back so the top bar stays visible.
  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    },
    { passive: true },
  );
  // Assigned below; the banner calls it only after an update is waiting.
  let updateSW: (reload?: boolean) => Promise<void> = async () => location.reload();
  const applyUpdate = async (): Promise<void> => {
    await updateSW(true);
    // The plugin reloads on `controllerchange`, which never fires if this page was never
    // SW-controlled (first visit): reload ourselves so the new version loads.
    if (!navigator.serviceWorker?.controller) location.reload();
  };
  void createApp(container, () => void applyUpdate())
    .catch((e: unknown) => {
      // Startup failed (e.g. a storage exception): say so instead of leaving a blank page.
      console.error('[cadence] startup failed:', e);
      const msg = document.createElement('div');
      msg.className = 'startup-error';
      msg.setAttribute('role', 'alert');
      msg.textContent = `Cadence couldn't start (${e instanceof Error ? e.message : String(e)}). Try reloading the page.`;
      container.replaceChildren(msg);
      return null;
    })
    .then((app) => {
      if (!app) return;
      if (import.meta.env.DEV) {
        // Dev-only console handle, e.g. __cadence.settings.update({ appearance: { theme: 'light' } })
        (window as unknown as { __cadence: typeof app }).__cadence = app;
      }
      if ('serviceWorker' in navigator) {
        // registerType 'prompt': a new SW waits until the user taps Reload in the banner.
        updateSW = registerSW({
          onNeedRefresh: () => app.updates.setWaiting(),
          onOfflineReady: () => app.notices.show('Cadence is ready to work offline.'),
        });
      }
    });
}
