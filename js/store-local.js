// Datenhaltung der Warteschlange – lokale Variante (Prototyp, Simulation).
// Der Zustand liegt im localStorage des Browsers; Änderungen werden per BroadcastChannel
// an alle offenen Tabs desselben Browsers verteilt. Verschiedene Geräte sehen sich NICHT.
// Ausbaustufe: store-server.js mit derselben Schnittstelle (WebSocket/HTTP zu einem Server).
//
// Schnittstelle (für app.js die einzige Verbindung zu den Daten):
//   getState()            -> { devices: { [id]: Gerätezustand } }
//   subscribe(listener)   -> Abmeldefunktion; listener(state) bei jeder Änderung
//   reset()               -> Ausgangszustand aus der JSON-Datei wiederherstellen
//   (Schritt 2 ergänzt join/leave)
const STATE_KEY = "geraeteblick.state.v3";
const CHANNEL = "geraeteblick";

export function createLocalStore(devices) {
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

  function notify(state) { listeners.forEach((fn) => fn(state)); }

  if (channel) channel.onmessage = () => notify(read());
  window.addEventListener("storage", (e) => { if (e.key === STATE_KEY) notify(read()); });

  return {
    mode: "lokal",
    getState: read,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    reset() { write(initialState()); },
    // Hilfsfunktion für die folgenden Schritte: Zustand gezielt ändern und verteilen.
    update(mutator) { const state = read(); mutator(state); write(state); return state; }
  };
}
