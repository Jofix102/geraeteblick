// Regeln der Warteschlange als reine Funktionen auf dem Zustand.
// Keine Abhängigkeit vom Browser: dieselbe Datei kann später auf einem Server laufen
// (store-server.js prüft dann dort, ob eine Aktion erlaubt ist). Zeiten in Millisekunden.
//
// Gerätezustand: { status: "free" | "occupied" | "reserved",
//                  occupiedBy: {id,name} | null, reservedFor: {id,name} | null,
//                  plannedSets, completedSets, startedAt, lastSetAt, reservedAt,
//                  queue: [{id,name}] }
//
// Zeitmodell (Finn, 06.11.2026): 1 Satz = 1 Minute, danach 3 Minuten Pause.
// Nach dem letzten Satz keine Pause am Gerät. 3 Sätze = 3×1 + 2×3 = 9 Minuten.

const MIN = 60_000;
export const isSim = (person) => !!person && String(person.id).startsWith("sim-");

/** Dauer eines ganzen Trainings in ms. */
export const trainingMs = (sets, rules) => (sets * rules.setMinutes + Math.max(0, sets - 1) * rules.restMinutes) * MIN;

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

export const isCompletelyFree = (d) => d.status === "free" && d.queue.length === 0;

/** > 50 % der Sätze erledigt: darf sich schon fürs nächste Gerät anstellen. */
export function trainingFarEnough(d, rules) {
  if (!d || !d.plannedSets) return false;
  return d.completedSets / d.plannedSets > rules.nextQueueAfterPercentSets / 100;
}

/**
 * Was passiert gerade am Gerät? { kind: "set" | "rest" | "over", set, msLeftInPhase, msLeft }
 * Grundlage sind die abgehakten Sätze; die Uhr schätzt den Rest nach dem Plan.
 */
export function phase(d, rules, now) {
  if (d.status !== "occupied" || !d.plannedSets) return null;
  const setMs = rules.setMinutes * MIN, restMs = rules.restMinutes * MIN;
  const k = d.completedSets, n = d.plannedSets;
  const since = now - (k === 0 ? d.startedAt : d.lastSetAt);
  // Nach Satz k: erst Pause, dann Satz k+1. Vor dem ersten Satz: direkt Satz 1.
  const before = k === 0 ? 0 : restMs;
  const restLeftAll = (n - k) * setMs + (n - k - 1) * restMs + before;
  const msLeft = Math.max(0, restLeftAll - since);
  if (since < before) return { kind: "rest", set: k + 1, msLeftInPhase: before - since, msLeft };
  const inSet = since - before;
  if (inSet < setMs) return { kind: "set", set: k + 1, msLeftInPhase: setMs - inSet, msLeft };
  return { kind: "over", set: k + 1, msLeftInPhase: 0, msLeft }; // Satz läuft länger als geplant
}

/** Restzeit bis das Gerät für den Nächsten frei wird (ohne Warteschlange). */
export function msUntilFree(d, rules, now) {
  if (d.status === "occupied") return phase(d, rules, now)?.msLeft ?? 0;
  if (d.status === "reserved") return Math.max(0, d.reservedAt + rules.reservationMinutes * MIN - now) + trainingMs(rules.defaultSets, rules);
  return 0;
}

/** Geschätzte Wartezeit für Platz p (1 = als Nächste/r dran). Wartende rechnen mit Standard-Sätzen. */
export function etaMs(d, position, rules, now) {
  return msUntilFree(d, rules, now) + (position - 1) * trainingMs(rules.defaultSets, rules);
}

/** Wartezeit, wenn man sich jetzt neu anstellt (0 bei völlig freiem Gerät). */
export function joinWaitMs(d, rules, now) {
  return isCompletelyFree(d) ? 0 : etaMs(d, d.queue.length + 1, rules, now);
}

/**
 * Anwesenheit am Gerät (echte Gäste): letzte Rückmeldung = Start, abgehakter Satz oder "Ich bin noch da".
 * Ab Minute 5 ohne Rückmeldung: "ask", ab Minute 6: "remove".
 */
export function presence(d, rules, now) {
  if (d.status !== "occupied" || isSim(d.occupiedBy)) return null;
  const idle = now - Math.max(d.startedAt || 0, d.lastSetAt || 0, d.confirmedAt || 0);
  if (idle >= rules.removeWithoutAnswerMinute * MIN) return { state: "remove", msLeft: 0 };
  if (idle >= rules.stillThereCheckMinute * MIN) return { state: "ask", msLeft: rules.removeWithoutAnswerMinute * MIN - idle };
  return null;
}

export function confirmPresence(state, deviceId, meId, now) {
  const d = state.devices[deviceId];
  if (!d || d.occupiedBy?.id !== meId) return fail("notMine", "Das ist nicht dein Gerät.");
  d.confirmedAt = now;
  return OK;
}

/** Gast komplett entfernen (Sitzung abgelaufen): aus Schlangen, Reservierungen und Geräten. */
export function removeGuest(state, guestId, now) {
  for (const d of Object.values(state.devices)) {
    d.queue = d.queue.filter((p) => p.id !== guestId);
    if (d.occupiedBy?.id === guestId || d.reservedFor?.id === guestId) handOver(d, now);
  }
  return OK;
}

export function reservationMsLeft(d, rules, now) {
  return d.status === "reserved" ? Math.max(0, d.reservedAt + rules.reservationMinutes * MIN - now) : 0;
}

function removeFromQueue(d, meId) {
  d.queue = d.queue.filter((p) => p.id !== meId);
}

function occupy(d, person, sets, now) {
  Object.assign(d, { status: "occupied", occupiedBy: { id: person.id, name: person.name }, reservedFor: null, reservedAt: null,
    plannedSets: sets, completedSets: 0, startedAt: now, lastSetAt: null, confirmedAt: null });
}

/** Gerät weitergeben: Nr. 1 der Schlange bekommt eine Reservierung, sonst frei. */
function handOver(d, now) {
  Object.assign(d, { occupiedBy: null, plannedSets: 0, completedSets: 0, startedAt: null, lastSetAt: null, confirmedAt: null });
  const next = d.queue.shift();
  if (next) Object.assign(d, { status: "reserved", reservedFor: next, reservedAt: now });
  else Object.assign(d, { status: "free", reservedFor: null, reservedAt: null });
}

const fail = (code, text) => ({ ok: false, code, text });
const OK = { ok: true };

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
 * Training starten mit gewählter Satzzahl. Erlaubt, wenn das Gerät völlig frei ist oder für mich reserviert.
 * keepQueue: Platz in einer anderen Warteschlange behalten (nur bei völlig freiem Gerät, "Zeit überbrücken").
 */
export function start(state, deviceId, me, rules, now, { keepQueue = false, sets } = {}) {
  const d = state.devices[deviceId];
  if (!d) return fail("unknown", "Gerät nicht gefunden.");
  const n = Number(sets) || rules.defaultSets;
  if (n < 1 || n > rules.maxSets) return fail("sets", `Bitte 1 bis ${rules.maxSets} Sätze wählen.`);
  const mine = d.status === "reserved" && d.reservedFor?.id === me.id;
  if (!mine && !isCompletelyFree(d)) return fail("busy", "Das Gerät ist nicht frei.");
  const w = whereIs(state, me.id);
  if (w.training === deviceId) return fail("self", "Du trainierst hier bereits.");
  if (w.training) {
    if (!mine) return fail("training", "Du trainierst gerade an einem anderen Gerät.");
    handOver(state.devices[w.training], now);
  }
  if (w.queued && !keepQueue) removeFromQueue(state.devices[w.queued.device], me.id);
  if (w.reserved && w.reserved !== deviceId) handOver(state.devices[w.reserved], now);
  occupy(d, me, n, now);
  return OK;
}

/** Satz abhaken. Nach dem letzten Satz wird das Gerät automatisch weitergegeben. */
export function completeSet(state, deviceId, meId, now) {
  const d = state.devices[deviceId];
  if (!d || d.occupiedBy?.id !== meId) return fail("notMine", "Das ist nicht dein Gerät.");
  d.completedSets += 1;
  d.lastSetAt = now;
  if (d.completedSets >= d.plannedSets) { handOver(d, now); return { ok: true, code: "done" }; }
  return OK;
}

/** Eigenes Training beenden oder eigene Reservierung freigeben. */
export function finish(state, deviceId, meId, now) {
  const d = state.devices[deviceId];
  if (!d) return fail("unknown", "Gerät nicht gefunden.");
  if (d.occupiedBy?.id !== meId && d.reservedFor?.id !== meId) return fail("notMine", "Das ist nicht dein Gerät.");
  handOver(d, now);
  return OK;
}

/**
 * Lauf der Zeit (wird jede Sekunde aufgerufen). Gibt true zurück, wenn sich etwas geändert hat.
 * - Sim-Gäste haken ihre Sätze nach Plan ab und geben das Gerät danach weiter.
 * - Sim-Gäste nehmen eine Reservierung nach kurzer Zeit an.
 * - Echte Gäste verlieren die Reservierung nach Ablauf (1 Minute); dann ist der Nächste dran.
 * - Echte Gäste ohne Rückmeldung am Gerät werden nach 6 Minuten abgemeldet.
 */
export function tick(state, rules, now) {
  let changed = false;
  const cycle = (rules.setMinutes + rules.restMinutes) * MIN;
  for (const d of Object.values(state.devices)) {
    if (d.status === "occupied" && isSim(d.occupiedBy) && d.plannedSets) {
      const elapsed = now - d.startedAt;
      const done = Math.min(d.plannedSets, Math.floor((elapsed - rules.setMinutes * MIN) / cycle) + 1);
      if (done > d.completedSets) {
        d.completedSets = done;
        d.lastSetAt = d.startedAt + (done - 1) * cycle + rules.setMinutes * MIN;
        if (done >= d.plannedSets) handOver(d, now);
        changed = true;
      }
    }
    if (presence(d, rules, now)?.state === "remove") { handOver(d, now); changed = true; }
    if (d.status === "reserved") {
      const age = now - d.reservedAt;
      if (isSim(d.reservedFor) && age >= rules.simTakesReservationSeconds * 1000) { occupy(d, d.reservedFor, rules.defaultSets, now); changed = true; }
      else if (age >= rules.reservationMinutes * MIN) { handOver(d, now); changed = true; }
    }
  }
  return changed;
}

/** Startzeiten der Sim-Gäste passend zu ihren bereits erledigten Sätzen setzen (beim ersten Laden). */
export function seedTimes(state, rules, now) {
  const cycle = (rules.setMinutes + rules.restMinutes) * MIN;
  for (const d of Object.values(state.devices)) {
    if (d.status !== "occupied" || d.startedAt) continue;
    const k = d.completedSets;
    d.startedAt = now - k * cycle - 20_000;   // Satz k+1 läuft seit 20 Sekunden
    d.lastSetAt = k ? d.startedAt + (k - 1) * cycle + rules.setMinutes * MIN : null;
  }
}

/** Nur Simulation (Knopf): Sim-Gast sofort fertig bzw. Reservierung sofort annehmen. */
export function simulateStep(state, deviceId, rules, now) {
  const d = state.devices[deviceId];
  if (!d) return fail("unknown", "Gerät nicht gefunden.");
  if (d.status === "occupied" && isSim(d.occupiedBy)) { handOver(d, now); return OK; }
  if (d.status === "reserved" && isSim(d.reservedFor)) { occupy(d, d.reservedFor, rules.defaultSets, now); return OK; }
  return fail("noSim", "Hier ist kein simulierter Gast am Zug.");
}
