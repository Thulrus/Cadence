import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { createApp } from './app';

const container = document.querySelector<HTMLElement>('#app');
if (container) {
  // Assigned below; the banner calls it only after an update is waiting.
  let updateSW: (reload?: boolean) => Promise<void> = async () => location.reload();
  const applyUpdate = async (): Promise<void> => {
    await updateSW(true);
    // The plugin reloads on `controllerchange`, which never fires if this page was never
    // SW-controlled (first visit): reload ourselves so the new version loads.
    if (!navigator.serviceWorker?.controller) location.reload();
  };
  void createApp(container, () => void applyUpdate()).then((app) => {
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
