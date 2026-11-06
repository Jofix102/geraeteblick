// Regeln der Warteschlange als reine Funktionen auf dem Zustand.
// Keine Abhängigkeit vom Browser: dieselbe Datei kann später auf einem Server laufen
// (store-server.js prüft dann dort, ob eine Aktion erlaubt ist). Zeiten in Millisekunden.
//
// Zustand:
//   devices: { [id]: { type, status: "free"|"occupied"|"reserved", occupiedBy, reservedFor, reservedUntil,
//                      plannedSets, completedSets, startedAt, lastSetAt, confirmedAt } }
//   queues:  { [Gerätetyp]: [{ id, name, sets }] }   – eine Schlange je Gerätetyp (z. B. alle Latzüge)
//   sim:     { counter, nextSpawnAt, target, targetUntil } – simulierte Gäste (Bots)
//
// Zeitmodell (Finn, 06.11.2026): 1 Satz = 1 Minute, danach 3 Minuten Pause.
// Nach dem letzten Satz keine Pause am Gerät. 3 Sätze = 3×1 + 2×3 = 9 Minuten.

const MIN = 60_000;
export const isSim = (person) => !!person && String(person.id).startsWith("sim-");

export const trainingMs = (sets, rules) => (sets * rules.setMinutes + Math.max(0, sets - 1) * rules.restMinutes) * MIN;

const queueOf = (state, type) => (state.queues[type] ||= []);
const devicesOfType = (state, type) => Object.entries(state.devices).filter(([, d]) => d.type === type);

/** Wo steht diese Person gerade? */
export function whereIs(state, meId) {
  const out = { training: null, reserved: null, queued: null };
  for (const [id, d] of Object.entries(state.devices)) {
    if (d.occupiedBy?.id === meId) out.training = id;
    if (d.reservedFor?.id === meId) out.reserved = id;
  }
  for (const [type, q] of Object.entries(state.queues)) {
    const i = q.findIndex((p) => p.id === meId);
    if (i >= 0) out.queued = { type, position: i + 1, sets: q[i].sets };
  }
  return out;
}

/** Freies Gerät dieses Typs, das man sofort nehmen darf (niemand wartet). */
export function freeDeviceOfType(state, type) {
  if (queueOf(state, type).length) return null;
  const hit = devicesOfType(state, type).find(([, d]) => d.status === "free");
  return hit ? hit[0] : null;
}

export const isCompletelyFree = (state, deviceId) => {
  const d = state.devices[deviceId];
  return d.status === "free" && queueOf(state, d.type).length === 0;
};

/** > 50 % der Sätze erledigt: darf sich schon fürs nächste Gerät anstellen. */
export function trainingFarEnough(d, rules) {
  if (!d || !d.plannedSets) return false;
  return d.completedSets / d.plannedSets > rules.nextQueueAfterPercentSets / 100;
}

/** Was passiert gerade am Gerät? { kind: "set"|"rest"|"over", set, msLeftInPhase, msLeft } */
export function phase(d, rules, now) {
  if (d.status !== "occupied" || !d.plannedSets) return null;
  const setMs = rules.setMinutes * MIN, restMs = rules.restMinutes * MIN;
  const k = d.completedSets, n = d.plannedSets;
  const since = now - (k === 0 ? d.startedAt : d.lastSetAt);
  const before = k === 0 ? 0 : restMs; // nach Satz k erst Pause, dann Satz k+1
  const msLeft = Math.max(0, (n - k) * setMs + (n - k - 1) * restMs + before - since);
  if (since < before) return { kind: "rest", set: k + 1, msLeftInPhase: before - since, msLeft };
  const inSet = since - before;
  if (inSet < setMs) return { kind: "set", set: k + 1, msLeftInPhase: setMs - inSet, msLeft };
  return { kind: "over", set: k + 1, msLeftInPhase: 0, msLeft };
}

/** Restzeit, bis das Gerät für den Nächsten frei wird. */
export function msUntilFree(d, rules, now) {
  if (d.status === "occupied") return phase(d, rules, now)?.msLeft ?? 0;
  if (d.status === "reserved") return Math.max(0, d.reservedUntil - now) + trainingMs(d.reservedFor?.sets || rules.defaultSets, rules);
  return 0;
}

/**
 * Geschätzte Wartezeit für Platz p der Schlange eines Gerätetyps.
 * Die Wartenden vor einem verteilen sich der Reihe nach auf das jeweils früheste freie Gerät.
 */
export function etaMs(state, type, position, rules, now) {
  const times = devicesOfType(state, type).map(([, d]) => msUntilFree(d, rules, now));
  const q = queueOf(state, type);
  for (let i = 0; i < position; i++) {
    const idx = times.indexOf(Math.min(...times));
    if (i === position - 1) return times[idx];
    times[idx] += trainingMs(q[i]?.sets || rules.defaultSets, rules);
  }
  return 0;
}

/** Wartezeit, wenn man sich jetzt neu anstellt (0, wenn ein Gerät frei ist). */
export function joinWaitMs(state, type, rules, now) {
  return freeDeviceOfType(state, type) ? 0 : etaMs(state, type, queueOf(state, type).length + 1, rules, now);
}

export const reservationMsLeft = (d, now) => (d.status === "reserved" ? Math.max(0, d.reservedUntil - now) : 0);

/** Anwesenheit (echte Gäste): ab Minute 5 ohne Rückmeldung "ask", ab Minute 6 "remove". */
export function presence(d, rules, now) {
  if (d.status !== "occupied" || isSim(d.occupiedBy)) return null;
  const idle = now - Math.max(d.startedAt || 0, d.lastSetAt || 0, d.confirmedAt || 0);
  if (idle >= rules.removeWithoutAnswerMinute * MIN) return { state: "remove", msLeft: 0 };
  if (idle >= rules.stillThereCheckMinute * MIN) return { state: "ask", msLeft: rules.removeWithoutAnswerMinute * MIN - idle };
  return null;
}

function removeFromQueues(state, meId) {
  for (const type of Object.keys(state.queues)) state.queues[type] = state.queues[type].filter((p) => p.id !== meId);
}

function occupy(d, person, sets, now) {
  Object.assign(d, { status: "occupied", occupiedBy: { id: person.id, name: person.name }, reservedFor: null, reservedUntil: null,
    plannedSets: sets, completedSets: 0, startedAt: now, lastSetAt: null, confirmedAt: null });
}

/**
 * Gerät weitergeben: Nr. 1 der Schlange dieses Gerätetyps bekommt eine Reservierung, sonst frei.
 * Wer gerade noch an einem anderen Gerät überbrückt, bekommt mehr Zeit (2 statt 1 Minute).
 */
function handOver(state, deviceId, rules, now) {
  const d = state.devices[deviceId];
  Object.assign(d, { occupiedBy: null, plannedSets: 0, completedSets: 0, startedAt: null, lastSetAt: null, confirmedAt: null });
  const next = queueOf(state, d.type).shift();
  if (!next) { Object.assign(d, { status: "free", reservedFor: null, reservedUntil: null }); return; }
  const bridging = !!whereIs(state, next.id).training;
  Object.assign(d, { status: "reserved", reservedFor: next,
    reservedUntil: now + (bridging ? rules.bridgeReservationMinutes : rules.reservationMinutes) * MIN });
}

const fail = (code, text) => ({ ok: false, code, text });
const OK = { ok: true };

function checkSets(sets, rules) {
  const n = Number(sets) || rules.defaultSets;
  return n >= 1 && n <= rules.maxSets ? n : null;
}

/** In die Schlange eines Gerätetyps eintragen. switchQueue: bisherigen Platz aufgeben. */
export function join(state, type, me, rules, { switchQueue = false, sets } = {}) {
  if (!devicesOfType(state, type).length) return fail("unknown", "Gerätetyp nicht gefunden.");
  const n = checkSets(sets, rules);
  if (!n) return fail("sets", `Bitte 1 bis ${rules.maxSets} Sätze wählen.`);
  if (freeDeviceOfType(state, type)) return fail("free", "Ein Gerät ist frei. Du kannst direkt trainieren.");
  const w = whereIs(state, me.id);
  if (w.training && state.devices[w.training].type === type) return fail("self", "Du trainierst schon an diesem Gerätetyp.");
  if (w.reserved && state.devices[w.reserved].type === type) return fail("self", "Ein Gerät dieses Typs ist schon für dich reserviert.");
  if (w.queued?.type === type) return fail("self", "Du stehst hier schon an.");
  if (w.training && !trainingFarEnough(state.devices[w.training], rules))
    return fail("rule50", `Während des Trainings darfst du dich erst nach mehr als ${rules.nextQueueAfterPercentSets} % deiner Sätze für das nächste Gerät anstellen.`);
  if (w.queued) {
    if (!switchQueue) return fail("maxQueue", "Du kannst nur in einer Warteschlange gleichzeitig stehen.");
    removeFromQueues(state, me.id);
  }
  queueOf(state, type).push({ id: me.id, name: me.name, sets: n });
  return OK;
}

export function leave(state, type, meId) {
  const q = queueOf(state, type);
  if (!q.some((p) => p.id === meId)) return fail("notQueued", "Du stehst hier nicht an.");
  state.queues[type] = q.filter((p) => p.id !== meId);
  return OK;
}

/**
 * Training starten. Erlaubt, wenn das Gerät frei ist und niemand wartet, oder wenn es für mich reserviert ist.
 * keepQueue: Platz in einer anderen Schlange behalten (Zeit überbrücken an einem völlig freien Gerät).
 */
export function start(state, deviceId, me, rules, now, { keepQueue = false, sets } = {}) {
  const d = state.devices[deviceId];
  if (!d) return fail("unknown", "Gerät nicht gefunden.");
  const mine = d.status === "reserved" && d.reservedFor?.id === me.id;
  const n = checkSets(sets || (mine ? d.reservedFor.sets : null), rules);
  if (!n) return fail("sets", `Bitte 1 bis ${rules.maxSets} Sätze wählen.`);
  if (!mine && !isCompletelyFree(state, deviceId)) return fail("busy", "Das Gerät ist nicht frei.");
  const w = whereIs(state, me.id);
  if (w.training === deviceId) return fail("self", "Du trainierst hier bereits.");
  if (w.training) {
    if (!mine) return fail("training", "Du trainierst gerade an einem anderen Gerät.");
    handOver(state, w.training, rules, now);
  }
  if (w.queued && !keepQueue) removeFromQueues(state, me.id);
  if (w.reserved && w.reserved !== deviceId) handOver(state, w.reserved, rules, now);
  occupy(d, me, n, now);
  return OK;
}

/** Satz abhaken. Nach dem letzten Satz wird das Gerät automatisch weitergegeben. */
export function completeSet(state, deviceId, meId, rules, now) {
  const d = state.devices[deviceId];
  if (!d || d.occupiedBy?.id !== meId) return fail("notMine", "Das ist nicht dein Gerät.");
  d.completedSets += 1;
  d.lastSetAt = now;
  if (d.completedSets >= d.plannedSets) { handOver(state, deviceId, rules, now); return { ok: true, code: "done" }; }
  return OK;
}

/** Eigenes Training beenden oder eigene Reservierung freigeben. */
export function finish(state, deviceId, meId, rules, now) {
  const d = state.devices[deviceId];
  if (!d) return fail("unknown", "Gerät nicht gefunden.");
  if (d.occupiedBy?.id !== meId && d.reservedFor?.id !== meId) return fail("notMine", "Das ist nicht dein Gerät.");
  handOver(state, deviceId, rules, now);
  return OK;
}

export function confirmPresence(state, deviceId, meId, now) {
  const d = state.devices[deviceId];
  if (!d || d.occupiedBy?.id !== meId) return fail("notMine", "Das ist nicht dein Gerät.");
  d.confirmedAt = now;
  return OK;
}

// ---------- Simulierte Gäste (Bots) ----------
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function activeBots(state) {
  const ids = new Set();
  for (const d of Object.values(state.devices)) {
    if (isSim(d.occupiedBy)) ids.add(d.occupiedBy.id);
    if (isSim(d.reservedFor)) ids.add(d.reservedFor.id);
  }
  for (const q of Object.values(state.queues)) q.filter(isSim).forEach((p) => ids.add(p.id));
  return ids.size;
}

/** Neuer Bot kommt ins Studio: nimmt ein freies Gerät oder stellt sich an. */
function spawnBot(state, rules, now) {
  const types = [...new Set(Object.values(state.devices).map((d) => d.type))];
  const type = types[rand(0, types.length - 1)];
  state.sim.counter += 1;
  const bot = { id: `sim-${state.sim.counter}`, name: `Sim-Gast ${state.sim.counter}`, sets: rand(rules.botSets[0], rules.botSets[1]) };
  const free = freeDeviceOfType(state, type);
  if (free) occupy(state.devices[free], bot, bot.sets, now);
  else queueOf(state, type).push(bot);
}

/**
 * Lauf der Zeit (jede Sekunde). Gibt true zurück, wenn sich etwas geändert hat.
 * - Bots haken ihre Sätze nach Plan ab, nehmen Reservierungen nach 20 s an.
 * - Echte Gäste: Reservierung läuft ab; ohne Rückmeldung am Gerät nach 6 Min. abgemeldet.
 * - Zwischen botsMin und botsMax Bots gleichzeitig; das Ziel wechselt alle paar Minuten.
 */
export function tick(state, rules, now) {
  let changed = false;
  const cycle = (rules.setMinutes + rules.restMinutes) * MIN;
  for (const [id, d] of Object.entries(state.devices)) {
    if (d.status === "occupied" && isSim(d.occupiedBy) && d.plannedSets) {
      const done = Math.min(d.plannedSets, Math.floor((now - d.startedAt - rules.setMinutes * MIN) / cycle) + 1);
      if (done > d.completedSets) {
        d.completedSets = done;
        d.lastSetAt = d.startedAt + (done - 1) * cycle + rules.setMinutes * MIN;
        if (done >= d.plannedSets) handOver(state, id, rules, now);
        changed = true;
      }
    }
    if (presence(d, rules, now)?.state === "remove") { handOver(state, id, rules, now); changed = true; }
    if (d.status === "reserved") {
      const waited = rules.reservationMinutes * MIN - (d.reservedUntil - now);
      if (isSim(d.reservedFor) && waited >= rules.simTakesReservationSeconds * 1000) { occupy(d, d.reservedFor, d.reservedFor.sets || rules.defaultSets, now); changed = true; }
      else if (now >= d.reservedUntil) { handOver(state, id, rules, now); changed = true; }
    }
  }
  const sim = state.sim;
  if (now >= sim.targetUntil) { sim.target = rand(rules.botsMin, rules.botsMax); sim.targetUntil = now + rules.botTargetChangeMinutes * MIN; changed = true; }
  if (now >= sim.nextSpawnAt) {
    if (activeBots(state) < Math.min(sim.target, rules.botsMax)) { spawnBot(state, rules, now); changed = true; }
    sim.nextSpawnAt = now + rand(rules.botSpawnSeconds[0], rules.botSpawnSeconds[1]) * 1000;
  }
  return changed;
}

/** Ausgangszustand: Zeiten der Start-Bots passend zu ihren erledigten Sätzen setzen. */
export function initialState(devices, initialQueues, rules, now) {
  const cycle = (rules.setMinutes + rules.restMinutes) * MIN;
  const state = {
    devices: Object.fromEntries(devices.map((d) => [d.id, { type: d.type, ...structuredClone(d.initialState) }])),
    queues: structuredClone(initialQueues || {}),
    sim: { counter: 0, nextSpawnAt: now + 30_000, target: rules.botsMin, targetUntil: now + rules.botTargetChangeMinutes * MIN }
  };
  for (const d of Object.values(state.devices)) {
    if (d.status !== "occupied") continue;
    const k = d.completedSets;
    d.startedAt = now - k * cycle - 20_000; // Satz k+1 läuft seit 20 Sekunden
    d.lastSetAt = k ? d.startedAt + (k - 1) * cycle + rules.setMinutes * MIN : null;
  }
  const nums = [...Object.values(state.devices).flatMap((d) => [d.occupiedBy, d.reservedFor]), ...Object.values(state.queues).flat()]
    .filter(isSim).map((p) => Number(p.id.slice(4)));
  state.sim.counter = Math.max(0, ...nums);
  return state;
}

/** Nur Simulation (Knopf): Bot sofort fertig bzw. Reservierung sofort annehmen. */
export function simulateStep(state, deviceId, rules, now) {
  const d = state.devices[deviceId];
  if (!d) return fail("unknown", "Gerät nicht gefunden.");
  if (d.status === "occupied" && isSim(d.occupiedBy)) { handOver(state, deviceId, rules, now); return OK; }
  if (d.status === "reserved" && isSim(d.reservedFor)) { occupy(d, d.reservedFor, d.reservedFor.sets || rules.defaultSets, now); return OK; }
  return fail("noSim", "Hier ist kein simulierter Gast am Zug.");
}
