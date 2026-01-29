/**
 * Floating Pane Window - Runs in a separate native window for a single pane
 * Extracts pane ID from the window label (pane-{id})
 */

import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PaneRenderer, PaneMessage } from './components/pane-renderer';
import { loadSettings } from './services/settings-store';
import { applyThemeColors } from './utils/ansi-parser';
import { TerminalSettings } from './types/settings';

import './styles/fonts.css';
import './styles/panes.css';

async function main() {
  const currentWindow = getCurrentWindow();
  const windowLabel = currentWindow.label; // e.g. "pane-comms"
  const paneId = windowLabel.replace(/^pane-/, '');

  // Set window title
  document.title = paneId.charAt(0).toUpperCase() + paneId.slice(1);

  // Load and apply settings
  const settings = await loadSettings();
  applySettings(settings);

  // Create pane renderer filling the entire window
  const paneRenderer = new PaneRenderer(document.body, {
    id: paneId,
    title: paneId.charAt(0).toUpperCase() + paneId.slice(1),
    height: 0, // ignored in floating mode
    isFloating: true,
  });

  // Listen for pane messages from the main window
  // IMPORTANT: Must await listener registration before signaling ready
  await listen<PaneMessage[]>(`pane-messages-${paneId}`, (event) => {
    paneRenderer.addMessages(event.payload);
  });

  // Listen for clear events
  await listen(`pane-clear-${paneId}`, () => {
    paneRenderer.clear();
  });

  // Listen for settings changes
  listen<TerminalSettings>('settings-changed', (event) => {
    applySettings(event.payload);
  });

  // Signal to main window that we're ready to receive messages
  // Main window will respond by sending stored messages
  emit(`pane-ready-${paneId}`, {});
}

function applySettings(settings: TerminalSettings) {
  const root = document.documentElement;
  root.style.setProperty('--font-family', settings.fontFamily);
  root.style.setProperty('--font-size', `${settings.fontSize}px`);
  root.style.setProperty('--font-weight', String(settings.fontWeight));
  root.style.setProperty('--font-weight-bold', String(settings.fontWeightBold));
  root.style.setProperty('--line-height', `${settings.lineHeight}`);
  root.style.setProperty('--letter-spacing', `${settings.letterSpacing}px`);
  applyThemeColors(settings.theme);
}

main().catch(console.error);
