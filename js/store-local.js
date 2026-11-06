// Datenhaltung der Warteschlange – lokale Variante (Prototyp, Simulation).
// Der Zustand liegt im localStorage des Browsers; Änderungen werden per BroadcastChannel
// an alle offenen Tabs desselben Browsers verteilt. Verschiedene Geräte sehen sich NICHT.
// Ausbaustufe: store-server.js mit derselben Schnittstelle (WebSocket/HTTP zu einem Server).
//
// Schnittstelle (für app.js die einzige Verbindung zu den Daten):
//   getState()            -> { devices, queues, sim }
//   subscribe(listener)   -> Abmeldefunktion; listener(state) bei jeder Änderung
//   reset()               -> Ausgangszustand aus der JSON-Datei wiederherstellen
//   join(type) / leave(type) / reserve(type) / start / completeSet / finish / confirmPresence / simulateStep -> { ok, code?, text? }
//   tick()                -> Lauf der Zeit (Bots, Ablauf von Reservierungen); auf dem Server macht das der Server
// Die Regeln selbst stehen in queue-logic.js (ohne Browser-Abhängigkeit, auch auf einem Server nutzbar).
import * as logic from "./queue-logic.js?v=0.5.1";

const STATE_KEY = "geraeteblick.state.v4";
const CHANNEL = "geraeteblick";

export function createLocalStore(data) {
  const { devices, rules, initialQueues } = data;
  const listeners = new Set();
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL) : null;

  const initialState = () => logic.initialState(devices, initialQueues, rules, Date.now());

  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY));
      if (saved && saved.devices && saved.queues && saved.sim && devices.every((d) => saved.devices[d.id])) return saved;
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

  const now = () => Date.now();
  return {
    mode: "lokal",
    getState: read,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    reset() { write(initialState()); },
    join: (type, me, opts) => act((st) => logic.join(st, type, me, rules, opts)),
    leave: (type, meId) => act((st) => logic.leave(st, type, meId)),
    reserve: (type, me, opts) => act((st) => logic.reserve(st, type, me, rules, now(), opts)),
    start: (deviceId, me, opts) => act((st) => logic.start(st, deviceId, me, rules, now(), opts)),
    completeSet: (deviceId, meId) => act((st) => logic.completeSet(st, deviceId, meId, rules, now())),
    finish: (deviceId, meId) => act((st) => logic.finish(st, deviceId, meId, rules, now())),
    confirmPresence: (deviceId, meId) => act((st) => logic.confirmPresence(st, deviceId, meId, now())),
    tick: () => act((st) => ({ ok: logic.tick(st, rules, now()) })),
    simulateStep: (deviceId) => act((st) => logic.simulateStep(st, deviceId, rules, now()))
  };
}
