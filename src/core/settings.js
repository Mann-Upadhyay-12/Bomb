// The bomb app's settings (About & Settings), remembered on this device. Each is a string in
// localStorage, read live through useSharedSetting so every window agrees the moment one changes.
// (Auto-copy has its own file, autocopy.js: Heist shares it.)
import { useSharedSetting } from './sharedSetting.js';
import { MODULE_REGISTRY } from './moduleRegistry.js';

export const SETTINGS = {
  needyLead: { key: 'bb_needy_lead', fallback: '5' }, // seconds before each 30-s mark
  needyBeep: { key: 'bb_needy_beep', fallback: 'off' }, // 'on': a beep in the page too
  hiddenModules: { key: 'bb_hidden_modules', fallback: '' }, // module ids left out of the picker, comma-separated
  openLast: { key: 'bb_open_last', fallback: 'on' }, // 'on': open on the module used last
  lastModule: { key: 'bb_last_module', fallback: '' },
  workingPanels: { key: 'bb_working_panels', fallback: 'module' }, // 'module' | 'open' | 'closed'
};

export const NEEDY_LEADS = [3, 5, 8, 10];

/** [value, set] of one setting, live. */
export function useSetting(name) {
  const s = SETTINGS[name];
  return useSharedSetting(s.key, s.fallback);
}

/** One setting's value outside React (at startup). */
export function readSetting(name) {
  const s = SETTINGS[name];
  try {
    const v = localStorage.getItem(s.key);
    return v !== null && v.trim() ? v : s.fallback;
  } catch (e) {
    return s.fallback;
  }
}

/** The needy reminder's lead in seconds (one of NEEDY_LEADS). */
export const needyLeadSeconds = (v) => (NEEDY_LEADS.includes(Number(v)) ? Number(v) : 5);

/** Module ids hidden from the picker (only real ids; never all of them). */
export function hiddenSet(v) {
  const ids = new Set(String(v || '').split(',').map((x) => x.trim()).filter((id) => MODULE_REGISTRY.some((m) => m.id === id)));
  return ids.size >= MODULE_REGISTRY.length ? new Set() : ids;
}

/** The modules the picker shows, in order. */
export const shownModules = (hiddenValue) => {
  const hidden = hiddenSet(hiddenValue);
  return MODULE_REGISTRY.filter((m) => !hidden.has(m.id));
};

/** The module the app opens on: the last one used (if that's on and it's still shown), else the first shown. */
export function startingModule() {
  const shown = shownModules(readSetting('hiddenModules'));
  const last = readSetting('lastModule');
  if (readSetting('openLast') === 'on' && shown.some((m) => m.id === last)) return last;
  return shown[0].id;
}
