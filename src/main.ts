import './styles.css';
import './app/shell.css';
import { HashRouter } from './app/router';
import { DEFAULT_ROUTE_ID, ROUTES } from './app/routes';
import { AppShell } from './app/shell';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Application root not found.');

const router = new HashRouter(ROUTES, DEFAULT_ROUTE_ID);
const shell = new AppShell(app, ROUTES, router);
router.start((route, previous) => {
  void shell.show(route, { userInitiated: previous !== null });
});
