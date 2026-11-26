// Auto-copy (COPY ON DECODE): one switch for both games and every module, remembered on this
// device. The Settings checkbox and each module's COPY ON DECODE button show and change it.
// Until someone changes it, the build's own default applies (yuza.html off, dixie.html / bomb.html on).
export const AUTOCOPY_KEY = 'bb_autocopy';

export function buildAutocopyDefault() {
  return typeof __AUTOCOPY_DEFAULT__ === 'boolean' ? __AUTOCOPY_DEFAULT__ : true;
}

/** true / false once chosen on this device, else null. */
export function savedAutocopy() {
  try {
    const v = localStorage.getItem(AUTOCOPY_KEY);
    return v === 'on' ? true : v === 'off' ? false : null;
  } catch (e) {
    return null;
  }
}

export function saveAutocopy(on) {
  try { localStorage.setItem(AUTOCOPY_KEY, on ? 'on' : 'off'); } catch (e) { /* private window: this visit only */ }
}

/** What auto-copy starts as when a game opens. */
export function startingAutocopy() {
  const saved = savedAutocopy();
  return saved == null ? buildAutocopyDefault() : saved;
}
