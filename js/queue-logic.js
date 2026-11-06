// Regeln der Warteschlange als reine Funktionen auf dem Zustand.
// Keine Abhängigkeit vom Browser: dieselbe Datei kann später auf einem Server laufen
// (store-server.js prüft dann dort, ob eine Aktion erlaubt ist).
//
// Gerätezustand: { status: "free" | "occupied" | "reserved",
//                  occupiedBy: {id,name} | null, reservedFor: {id,name} | null,
//                  plannedSets, completedSets, queue: [{id,name}] }

export const isSim = (person) => !!person && String(person.id).startsWith("sim-");

/** Wo steht diese Person gerade? */
export function whereIs(state, meId) {
  const out = { training: null, reserved: null, queued: null };
  for (const [id, d] of Object.entries(state.devices)) {
    if (d.occupiedBy?.id === meId) out.training = id;
    if (d.reservedFor?.id === meId) out.reserved = id;
    const i = d.queue.findIndex((p) => p.id === meId);
    if (i >= 0) out.queued = { device: id, position: i + 1 };
  }
  return out;
}

/** Gerät ist völlig frei: niemand trainiert, niemand wartet, nichts reserviert. */
export const isCompletelyFree = (d) => d.status === "free" && d.queue.length === 0;

/** Darf man während des eigenen Trainings schon für das nächste Gerät anstellen? (> 50 % der Sätze) */
export function trainingFarEnough(d, rules) {
  if (!d || !d.plannedSets) return false;
  return d.completedSets / d.plannedSets > rules.nextQueueAfterPercentSets / 100;
}

function removeFromQueue(d, meId) {
  d.queue = d.queue.filter((p) => p.id !== meId);
}

/** Gerät weitergeben: der Nächste in der Schlange bekommt die Reservierung, sonst frei. */
function handOver(d) {
  d.occupiedBy = null;
  d.completedSets = 0;
  d.plannedSets = 0;
  const next = d.queue.shift();
  if (next) { d.status = "reserved"; d.reservedFor = next; }
  else { d.status = "free"; d.reservedFor = null; }
}

const fail = (code, text) => ({ ok: false, code, text });
const OK = { ok: true };

/** In die Warteschlange eintragen. switchQueue: bisherigen Platz an anderem Gerät aufgeben. */
export function join(state, deviceId, me, rules, { switchQueue = false } = {}) {
  const d = state.devices[deviceId];
  if (!d) return fail("unknown", "Gerät nicht gefunden.");
  if (isCompletelyFree(d)) return fail("free", "Das Gerät ist frei. Du kannst direkt trainieren.");
  const w = whereIs(state, me.id);
  if (w.training === deviceId) return fail("self", "Du trainierst hier bereits.");
  if (w.reserved === deviceId) return fail("self", "Das Gerät ist schon für dich reserviert.");
  if (w.queued?.device === deviceId) return fail("self", "Du stehst hier schon an.");
  if (w.training && !trainingFarEnough(state.devices[w.training], rules))
    return fail("rule50", `Während des Trainings darfst du dich erst nach mehr als ${rules.nextQueueAfterPercentSets} % deiner Sätze für das nächste Gerät anstellen.`);
  if (w.queued) {
    if (!switchQueue) return fail("maxQueue", `Du kannst nur in ${rules.maxQueues} Warteschlange gleichzeitig stehen.`);
    removeFromQueue(state.devices[w.queued.device], me.id);
  }
  d.queue.push({ id: me.id, name: me.name });
  return OK;
}

export function leave(state, deviceId, meId) {
  const d = state.devices[deviceId];
  if (!d || !d.queue.some((p) => p.id === meId)) return fail("notQueued", "Du stehst hier nicht an.");
  removeFromQueue(d, meId);
  return OK;
}

/**
 * Training starten. Erlaubt, wenn das Gerät völlig frei ist oder für mich reserviert.
 * keepQueue: Platz in einer anderen Warteschlange behalten (nur bei völlig freiem Gerät, "Zeit überbrücken").
 * Ohne keepQueue wird ein Platz an einem anderen Gerät aufgegeben (Wechsel).
 * Trainiere ich noch woanders, wird das dort beendet, wenn hier meine Reservierung wartet.
 */
export function start(state, deviceId, me, { keepQueue = false } = {}) {
  const d = state.devices[deviceId];
  if (!d) return fail("unknown", "Gerät nicht gefunden.");
  const mine = d.status === "reserved" && d.reservedFor?.id === me.id;
  if (!mine && !isCompletelyFree(d)) return fail("busy", "Das Gerät ist nicht frei.");
  const w = whereIs(state, me.id);
  if (w.training === deviceId) return fail("self", "Du trainierst hier bereits.");
  if (w.training) {
    if (!mine) return fail("training", "Du trainierst gerade an einem anderen Gerät.");
    handOver(state.devices[w.training]);
  }
  if (w.queued && !keepQueue) removeFromQueue(state.devices[w.queued.device], me.id);
  if (w.reserved && w.reserved !== deviceId) handOver(state.devices[w.reserved]);
  d.status = "occupied";
  d.occupiedBy = { id: me.id, name: me.name };
  d.reservedFor = null;
  d.plannedSets = 0;   // Sätze wählen folgt in Schritt 3
  d.completedSets = 0;
  return OK;
}

/** Eigenes Training beenden oder eigene Reservierung freigeben. */
export function finish(state, deviceId, meId) {
  const d = state.devices[deviceId];
  if (!d) return fail("unknown", "Gerät nicht gefunden.");
  if (d.occupiedBy?.id !== meId && d.reservedFor?.id !== meId) return fail("notMine", "Das ist nicht dein Gerät.");
  handOver(d);
  return OK;
}

/** Nur Simulation: ein Sim-Gast beendet sein Training bzw. tritt seine Reservierung an. */
export function simulateStep(state, deviceId) {
  const d = state.devices[deviceId];
  if (!d) return fail("unknown", "Gerät nicht gefunden.");
  if (d.status === "occupied" && isSim(d.occupiedBy)) { handOver(d); return OK; }
  if (d.status === "reserved" && isSim(d.reservedFor)) {
    d.status = "occupied"; d.occupiedBy = d.reservedFor; d.reservedFor = null; d.plannedSets = 3; d.completedSets = 0;
    return OK;
  }
  return fail("noSim", "Hier ist kein simulierter Gast am Zug.");
}
