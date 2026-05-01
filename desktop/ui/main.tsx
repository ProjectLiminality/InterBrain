import { createRoot } from 'react-dom/client';
import { TrayDashboard } from './TrayDashboard';
import { FirstRun } from './FirstRun';

/**
 * Single React entry. The Tauri backend opens different webview windows
 * (`tray`, `first-run`) and passes the mode through the URL hash so we know
 * which UI to mount.
 */
function App() {
  const mode = window.location.hash.replace('#', '') || 'tray';
  if (mode === 'first-run') return <FirstRun />;
  return <TrayDashboard />;
}

createRoot(document.getElementById('root')!).render(<App />);
