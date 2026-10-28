import '@fontsource/alegreya/700.css';
import '@fontsource/alegreya-sc/700.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import '@fontsource/alegreya-sans/800.css';
import './ui/styles.css';
import { render } from 'preact';
import { Store } from './game/store';
import { Sync } from './sync/sync';
import { App } from './ui/App';

const store = new Store();
const sync = new Sync(store);
sync.start();
render(<App store={store} sync={sync} />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
