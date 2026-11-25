const power = document.getElementById('power');
const box = document.getElementById('blackout');
let enabled = true;
const show = () => { power.textContent = enabled ? 'ON — click to switch off' : 'OFF — click to switch on'; };
browser.storage.local.get(['enabled', 'blackout']).then(v => { enabled = v.enabled !== false; box.checked = !!v.blackout; show(); });
power.addEventListener('click', () => { enabled = !enabled; show(); browser.storage.local.set({ enabled }); });
box.addEventListener('change', () => browser.storage.local.set({ blackout: box.checked }));
