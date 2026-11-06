// Datenhaltung der Warteschlange – lokale Variante (Prototyp, Simulation).
// Der Zustand liegt im localStorage des Browsers; Änderungen werden per BroadcastChannel
// an alle offenen Tabs desselben Browsers verteilt. Verschiedene Geräte sehen sich NICHT.
// Ausbaustufe: store-server.js mit derselben Schnittstelle (WebSocket/HTTP zu einem Server).
//
// Schnittstelle (für app.js die einzige Verbindung zu den Daten):
//   getState()            -> { devices: { [id]: Gerätezustand } }
//   subscribe(listener)   -> Abmeldefunktion; listener(state) bei jeder Änderung
//   reset()               -> Ausgangszustand aus der JSON-Datei wiederherstellen
//   join / leave / start / finish / simulateStep -> { ok, code?, text? }
//   Die Regeln selbst stehen in queue-logic.js (ohne Browser-Abhängigkeit, auch auf einem Server nutzbar).
import * as logic from "./queue-logic.js";

const STATE_KEY = "geraeteblick.state.v3.2";
const CHANNEL = "geraeteblick";

export function createLocalStore(devices, rules) {
  const listeners = new Set();
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL) : null;

  function initialState() {
    return { devices: Object.fromEntries(devices.map((d) => [d.id, structuredClone(d.initialState)])) };
  }

  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY));
      if (saved && saved.devices && devices.every((d) => saved.devices[d.id])) return saved;
    } catch { /* beschädigt oder gesperrt: neu anlegen */ }
    const fresh = initialState();
    write(fresh, false);
    return fresh;
  }

  function write(state, broadcast = true) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* Speicher gesperrt */ }
    if (broadcast && channel) channel.postMessage({ type: "changed" });
    notify(state);
  }

  // Aktion auf frischem Zustand ausführen; nur bei Erfolg speichern und an alle Tabs verteilen.
  function act(fn) {
    const state = read();
    const result = fn(state);
    if (result.ok) write(state);
    return result;
  }

  function notify(state) { listeners.forEach((fn) => fn(state)); }

  if (channel) channel.onmessage = () => notify(read());
  window.addEventListener("storage", (e) => { if (e.key === STATE_KEY) notify(read()); });

  return {
    mode: "lokal",
    getState: read,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    reset() { write(initialState()); },
    join: (deviceId, me, opts) => act((st) => logic.join(st, deviceId, me, rules, opts)),
    leave: (deviceId, meId) => act((st) => logic.leave(st, deviceId, meId)),
    start: (deviceId, me, opts) => act((st) => logic.start(st, deviceId, me, opts)),
    finish: (deviceId, meId) => act((st) => logic.finish(st, deviceId, meId)),
    simulateStep: (deviceId) => act((st) => logic.simulateStep(st, deviceId))
  };
}
