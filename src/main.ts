import './style.css';
import { createApp } from './app';

const container = document.querySelector<HTMLElement>('#app');
if (container) {
  void createApp(container).then((app) => {
    if (import.meta.env.DEV) {
      // Dev-only console handle, e.g. __cadence.settings.update({ appearance: { theme: 'light' } })
      (window as unknown as { __cadence: typeof app }).__cadence = app;
    }
  });
}
