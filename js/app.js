import { getIdentity, touch, isIdle, renewIdentity } from "./identity.js?v=0.4.1";
import { createLocalStore } from "./store-local.js?v=0.4.1";
import {
  whereIs, isCompletelyFree, freeDeviceOfType, trainingFarEnough, isSim, phase, etaMs, msUntilFree,
  reservationMsLeft, trainingMs, joinWaitMs, presence
} from "./queue-logic.js?v=0.4.1";

const params = new URLSearchParams(location.search);
const DATA_URL = params.has("fehler") ? "data/nicht-vorhanden.json" : "data/devices.json";
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let data = null, store = null, flash = null, chosenSets = null, alertText = "", ownAction = false;
let lastReserved = null, lastTraining = null, turnShownFor = null;
let me = getIdentity();
let idleMs = 20 * 60_000; // wird nach dem Laden aus rules.idleMinutes übernommen

// Aktivität = echte Bedienung (nicht das bloße Neuzeichnen durch andere Tabs).
let lastTouch = 0;
["click", "keydown", "change", "touchstart"].forEach((t) => document.addEventListener(t, () => {
  if (Date.now() - lastTouch > 5000) { lastTouch = Date.now(); touch(me); }
}, { passive: true }));

// ---------- Hilfen ----------
const label = (d) => d.position ? `${d.name} ${d.position}` : d.name;
const devById = (id) => data.devices.find((x) => x.id === id);
const typeName = (type) => data.devices.find((x) => x.type === type).name;
const typeIcon = (type) => data.devices.find((x) => x.type === type).icon;
const devicesOf = (type) => data.devices.filter((x) => x.type === type);
const types = () => [...new Set(data.devices.map((d) => d.type))];
const feminine = (name) => /(presse|maschine|extension)$/i.test(name);
const an = (id) => feminine(devById(id).name) ? "an der" : "am";
const anType = (type) => feminine(typeName(type)) ? "an der" : "am";
const who = (p) => p.id === me.id ? "Du" : esc(p.name);
const mmss = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const approx = (ms) => ms < 60_000 ? "unter 1 Min." : `ca. ${Math.ceil(ms / 60_000)} Min.`;
// Platzhalter für Zeiten, die jede Sekunde aktualisiert werden (siehe updateClocksOnly).
const clock = (kind, ref, extra = "") => `<span data-clock="${kind}" data-ref="${esc(ref)}"${extra}></span>`;
const link = (id) => `<a data-nav href="?geraet=${encodeURIComponent(id)}">${esc(label(devById(id)))}</a>`;
// Aktionen, vor denen gefragt wird, wie viele Sätze man macht.
const NEEDS_SETS = new Set(["join", "join-switch", "start", "start-keep", "start-type"]);
const btn = (action, ref, text, primary = false, go = "", needSets = NEEDS_SETS.has(action)) =>
  `<button type="button" class="${primary ? "button primary" : "button"}" data-action="${action}" data-ref="${esc(ref)}"${go ? ` data-go="${esc(go)}"` : ""}${needSets ? " data-needsets" : ""}>${text}</button>`;

function statusInfo(s) {
  if (s.status === "free") return { cls: "free", text: "Frei", icon: "✓" };
  if (s.status === "reserved") return { cls: "ready", text: "Reserviert", icon: "⏱" };
  return { cls: "busy", text: "Belegt", icon: "●" };
}

function statusLine(s) {
  if (s.status === "free") return "Niemand trainiert hier.";
  if (s.status === "reserved") return `Reserviert für ${who(s.reservedFor)}.`;
  return `${who(s.occupiedBy)}: ${s.completedSets} von ${s.plannedSets} Sätzen erledigt.`;
}

const queueCount = (st, type) => (st.queues[type] || []).length;
const waitingText = (n) => n === 0 ? "niemand wartet" : n === 1 ? "1 Person wartet" : `${n} Personen warten`;

// ---------- Leiste "Dein Stand" (immer sichtbar, wenn du irgendwo dran bist) ----------
function renderBar() {
  const bar = $("#mybar");
  if (!store) { bar.hidden = true; return; }
  const st = store.getState(), w = whereIs(st, me.id);
  if (lastReserved && !w.reserved && w.training !== lastReserved && !ownAction)
    alertText = `Deine Reservierung ${an(lastReserved)} ${label(devById(lastReserved))} ist abgelaufen. Der Nächste ist dran.`;
  if (lastTraining && !w.training && !ownAction)
    alertText = `Du wurdest ${an(lastTraining)} ${label(devById(lastTraining))} abgemeldet, weil ${data.rules.removeWithoutAnswerMinute} Minuten keine Rückmeldung kam.`;
  lastReserved = w.reserved; lastTraining = w.training; ownAction = false;

  const parts = [];
  if (alertText) parts.push(`<p class="bar-line">${esc(alertText)} <button type="button" class="linklike" data-dismiss>OK</button></p>`);
  if (w.reserved) parts.push(`<p class="bar-line turn"><b>Du bist dran ${an(w.reserved)} ${esc(label(devById(w.reserved)))}!</b> ${clock("res", w.reserved)} <button type="button" class="button primary" data-showturn>Karte zeigen</button></p>`);
  if (w.training && presence(st.devices[w.training], data.rules, Date.now())?.state === "ask")
    parts.push(`<p class="bar-line turn"><b>Bist du noch da?</b> Sonst wirst du in ${clock("pres", w.training)} abgemeldet. ${btn("here", w.training, "Ja, bin noch da", true)}</p>`);
  if (w.training) parts.push(`<p class="bar-line">Du trainierst ${an(w.training)} <b>${esc(label(devById(w.training)))}</b>: ${clock("phase", w.training)}. <a data-nav href="?ansicht=ich">Öffnen</a></p>`);
  if (w.queued) parts.push(`<p class="bar-line">Du bist <b>Nr. ${w.queued.position}</b> ${anType(w.queued.type)} <b>${esc(typeName(w.queued.type))}</b>, dran in ${clock("eta", w.queued.type, ` data-pos="${w.queued.position}"`)} <a data-nav href="?ansicht=ich">Ansehen</a> <button type="button" class="linklike" data-action="leave" data-ref="${esc(w.queued.type)}">Verlassen</button></p>`);
  bar.innerHTML = parts.join("");
  bar.hidden = parts.length === 0;
  renderTurn(st, w);
}

// ---------- Du bist dran: Grundriss öffnet sich, bis du annimmst oder freigibst ----------
function renderTurn(st, w) {
  const dlg = $("#turn");
  if (!w.reserved) {
    if (dlg.open) dlg.close();
    turnShownFor = null;
    return;
  }
  const d = devById(w.reserved), s = st.devices[w.reserved];
  dlg.innerHTML = `
    <h2>Du bist dran: ${esc(label(d))}</h2>
    <p>📍 ${esc(d.location)}. Noch <b>${clock("res", d.id)}</b> Zeit, um es zu beziehen.</p>
    ${mapSvg(d.id)}
    <p class="meta">Du hast ${s.reservedFor.sets} ${s.reservedFor.sets === 1 ? "Satz" : "Sätze"} angegeben.</p>
    <div class="actions">${btn("start", d.id, w.training ? `${an(w.training) === "am" ? "Am" : "An der"} ${esc(label(devById(w.training)))} beenden und hier starten` : "Gerät beziehen, Training starten", true, "?ansicht=ich", false)}
    ${btn("finish", d.id, "Platz freigeben")}</div>`;
  if (turnShownFor !== w.reserved) {
    turnShownFor = w.reserved;
    if (!dlg.open && typeof dlg.showModal === "function") dlg.showModal();
    signal();
  }
}

// Ton und Vibration (Vibration nur auf Geräten, die sie unterstützen, z. B. Android).
function signal() {
  try { const a = new Audio("assets/dran.wav"); a.play().catch(() => {}); } catch { /* kein Ton möglich */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// Grundriss als SVG aus den Koordinaten in devices.json; hervorgehobenes Gerät pulsiert.
function mapSvg(highlightId) {
  const m = data.map, st = store.getState();
  const zones = m.zones.map((z) => `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="2" class="zone"/>
    <text x="${z.x + 1.5}" y="${z.y + z.h - 1.5}" class="zone-label">${esc(z.label)}</text>`).join("");
  const dots = data.devices.map((d) => {
    const s = st.devices[d.id], hi = d.id === highlightId;
    return `<g class="spot ${s.status}${hi ? " hi" : ""}"><title>${esc(label(d))}</title>
      ${hi ? `<circle cx="${d.map.x}" cy="${d.map.y}" r="6" class="pulse"/>` : ""}
      <circle cx="${d.map.x}" cy="${d.map.y}" r="${hi ? 3.6 : 2.4}"/></g>`;
  }).join("");
  const e = m.entrance;
  return `<svg class="map" viewBox="0 0 ${m.width} ${m.height + 4}" role="img" aria-label="Grundriss: ${esc(label(devById(highlightId)))} ist markiert">
    <rect x="0.5" y="0.5" width="${m.width - 1}" height="${m.height - 1}" class="floor"/>${zones}${dots}
    <text x="${e.x}" y="${e.y + 3}" class="entrance" text-anchor="middle">▲ ${esc(e.label)}</text></svg>`;
}

// ---------- Aktionen (Knöpfe mit data-action) ----------
const sets = () => chosenSets || data.rules.defaultSets;
const ACTIONS = {
  join: (type) => store.join(type, me, { sets: sets() }),
  "join-switch": (type) => store.join(type, me, { switchQueue: true, sets: sets() }),
  leave: (type) => store.leave(type, me.id),
  // Reserviert: die Sätze von der Anmeldung zur Warteschlange gelten weiter.
  start: (id) => store.start(id, me, store.getState().devices[id].reservedFor?.id === me.id ? {} : { sets: sets() }),
  "start-keep": (id) => store.start(id, me, { keepQueue: true, sets: sets() }),
  "start-type": (type) => { const id = freeDeviceOfType(store.getState(), type); return id ? store.start(id, me, { sets: sets() }) : { ok: false, text: "Gerade ist kein Gerät frei." }; },
  set: (id) => store.completeSet(id, me.id),
  here: (id) => store.confirmPresence(id, me.id),
  finish: (id) => store.finish(id, me.id),
  sim: (id) => store.simulateStep(id)
};
const DONE = {
  join: "Du stehst jetzt in der Warteschlange.", "join-switch": "Gewechselt: Du stehst jetzt hier an.",
  leave: "Du hast die Warteschlange verlassen.", start: "Training gestartet.", "start-type": "Training gestartet.",
  "start-keep": "Training gestartet. Dein Platz in der Warteschlange bleibt.", finish: "Gerät freigegeben.",
  sim: "Simulation: Sim-Gast ist weiter.", set: "Satz abgehakt. Jetzt Pause.", here: "Danke, du bleibst angemeldet."
};
document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-action]");
  if (!b || !store) return;
  if (b.hasAttribute("data-needsets")) return askSets(b);
  if (b.dataset.sets) { chosenSets = Number(b.dataset.sets); $("#sets").close(); }
  ownAction = true;
  const result = ACTIONS[b.dataset.action](b.dataset.ref);
  flash = { ok: result.ok, text: !result.ok ? result.text : result.code === "done" ? "Letzter Satz geschafft. Das Gerät ist frei für den Nächsten." : DONE[b.dataset.action] };
  if (result.ok && b.dataset.action === "start-type") return navigate(`?geraet=${whereIs(store.getState(), me.id).training}`);
  if (result.ok && b.dataset.go) return navigate(b.dataset.go);
  render();
});
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-dismiss]")) { alertText = ""; render(); }
  if (e.target.matches("[data-showturn]")) { turnShownFor = null; render(); }
  if (e.target.matches("[data-closesets]")) $("#sets").close();
});
document.addEventListener("change", (e) => {
  if (e.target.matches("select[data-sets]")) chosenSets = Number(e.target.value);
});
// "Du bist dran" lässt sich nicht mit Esc wegklicken: annehmen oder freigeben.
document.addEventListener("cancel", (e) => { if (e.target.id === "turn") e.preventDefault(); }, true);

// ---------- Routing (Ansicht steckt in der Adresse, damit QR-Links funktionieren) ----------
function navigate(search) {
  history.pushState(null, "", search || location.pathname);
  render();
  window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-nav]");
  if (!a) return;
  e.preventDefault();
  navigate(a.getAttribute("href"));
});
window.addEventListener("popstate", () => render());

function render() {
  renderBar();
  const q = new URLSearchParams(location.search);
  const tab = q.has("geraet") ? "" : q.get("ansicht") === "qr" ? "qr" : q.get("ansicht") === "ich" ? "ich" : "geraete";
  document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-current", String(t.dataset.tab === tab)));
  if (!data) return;
  if (q.has("geraet")) renderDevice(q.get("geraet"));
  else if (tab === "qr") renderQr();
  else if (tab === "ich") renderMine();
  else renderList();
  fillClocksSoon();
}

// ---------- Bausteine ----------
function flashHtml() {
  if (!flash) return "";
  const f = flash; flash = null;
  return `<p class="flash ${f.ok ? "ok" : "bad"}" role="status">${esc(f.text)}</p>`;
}

// Satzauswahl: erscheint erst beim Anstellen oder Starten. Ein Tipp auf die Zahl führt die Aktion aus.
function askSets(b) {
  const dlg = $("#sets"), r = data.rules, ref = b.dataset.ref;
  const type = data.devices.some((d) => d.type === ref) ? ref : devById(ref).type;
  const verb = b.dataset.action.startsWith("join") ? "Anstellen" : "Starten";
  const nums = Array.from({ length: r.maxSets }, (_, i) => i + 1).map((n) =>
    `<button type="button" class="setbtn${n === sets() ? " suggested" : ""}" data-action="${b.dataset.action}" data-ref="${esc(ref)}" data-sets="${n}"${b.dataset.go ? ` data-go="${esc(b.dataset.go)}"` : ""}>
      <span class="num">${n}</span><span>${n === 1 ? "Satz" : "Sätze"}</span></button>`).join("");
  dlg.innerHTML = `<h2>Wie viele Sätze ${anType(type)} ${esc(typeName(type))}?</h2>
    <p class="meta">Tippe die Zahl an. Damit wird ${verb === "Anstellen" ? "angestellt" : "gestartet"}.</p>
    <div class="setgrid">${nums}</div>
    <button type="button" class="button" data-closesets>Abbrechen</button>`;
  dlg.showModal();
}

/** Was darf ich für diesen Gerätetyp tun? Liefert einen Knopf, einen Hinweis (<b>) oder nichts. */
function typeAction(st, w, type) {
  const r = data.rules;
  if (w.queued?.type === type) return `<b>du: Nr. ${w.queued.position}</b>`;
  if (w.training && st.devices[w.training].type === type) return "<b>du trainierst hier</b>";
  if (w.reserved && st.devices[w.reserved].type === type) return "<b>du bist dran</b>";
  const free = freeDeviceOfType(st, type);
  if (free) {
    if (w.training) return "";
    if (w.queued) return btn("start-keep", free, "Hier überbrücken", false, `?geraet=${free}`);
    return btn("start-type", type, "Freies Gerät nehmen");
  }
  if (w.training && !trainingFarEnough(st.devices[w.training], r)) return "";
  return btn(w.queued ? "join-switch" : "join", type, w.queued ? "Wechseln: hier anstellen" : "Anstellen");
}

function typeCard(st, w, type) {
  const devs = devicesOf(type), free = devs.filter((d) => st.devices[d.id].status === "free").length;
  const n = queueCount(st, type);
  const chips = devs.map((d) => {
    const s = st.devices[d.id], si = statusInfo(s);
    const extra = s.status === "occupied" ? ` · Satz ${Math.min(s.completedSets + 1, s.plannedSets)}/${s.plannedSets}, frei in ${clock("free", d.id)}` : "";
    return `<li><a class="chip" data-nav href="?geraet=${encodeURIComponent(d.id)}"><span class="pill ${si.cls}">${si.icon}</span> ${esc(d.position || d.name)}<span class="meta">${extra}</span></a></li>`;
  }).join("");
  return `<li class="type-card">
    <div class="type-head"><img src="${esc(typeIcon(type))}" alt=""><div><b>${esc(typeName(type))}</b>
      <span class="meta">${devs.length > 1 ? `${devs.length} Geräte, ${free} frei` : free ? "frei" : "belegt"} · ${waitingText(n)}${freeDeviceOfType(st, type) ? "" : ` · Wartezeit ${clock("join", type)}`}</span></div></div>
    <ul class="chips">${chips}</ul>
    <div class="type-action">${typeAction(st, w, type)}</div></li>`;
}

function queueHtml(st, type) {
  const q = st.queues[type] || [];
  if (!q.length) return "";
  const many = devicesOf(type).length > 1;
  return `<h3 class="group">Warteschlange ${esc(typeName(type))}${many ? ` (gemeinsam für alle ${devicesOf(type).length} Geräte)` : ""}</h3>
    <ol class="queue">${q.map((p, i) => `<li${p.id === me.id ? ' class="me-entry"' : ""}>${p.id === me.id ? "<b>Du</b>" : esc(p.name)} · ${p.sets} Sätze · dran in ${clock("eta", type, ` data-pos="${i + 1}"`)}</li>`).join("")}</ol>`;
}

// Fortschritt am Gerät: Punkte je Satz, Balken und Restzeit.
function progressHtml(d, s) {
  if (s.status === "occupied" && s.plannedSets) {
    const dots = Array.from({ length: s.plannedSets }, (_, i) => `<span class="dot${i < s.completedSets ? " done" : ""}" aria-hidden="true"></span>`).join("");
    return `<div class="progress" aria-label="${s.completedSets} von ${s.plannedSets} Sätzen erledigt">
      <div class="dots">${dots}</div>
      <div class="bar"><span data-clock="bar" data-ref="${esc(d.id)}"></span></div>
      <p class="meta">${clock("phase", d.id)} · frei in ${clock("free", d.id)}</p></div>`;
  }
  if (s.status === "reserved") return `<p class="meta">Reservierung läuft noch ${clock("res", d.id)}.</p>`;
  return "";
}

// Schneller frei: anderer Gerätetyp derselben Muskelgruppe mit kürzerer Wartezeit (mind. 1 Min. Vorteil).
function alternativesHtml(st, w, type) {
  const r = data.rules, now = Date.now();
  const mine = w.queued?.type === type;
  const myWait = mine ? etaMs(st, type, w.queued.position, r, now) : joinWaitMs(st, type, r, now);
  if (myWait < 60_000) return "";
  const group = devicesOf(type)[0].muscleGroup;
  const better = types()
    .filter((t) => t !== type && devicesOf(t)[0].muscleGroup === group && t !== w.queued?.type && (!w.training || st.devices[w.training].type !== t))
    .map((t) => ({ t, wait: joinWaitMs(st, t, r, now) }))
    .filter((c) => c.wait + 60_000 < myWait)
    .sort((a, b) => a.wait - b.wait);
  if (!better.length) return "";
  return `<section class="alt" aria-label="Schneller frei"><h3 class="group">Schneller frei (${esc(group)}) statt ${mine ? clock("eta", type, ` data-pos="${w.queued.position}"`) : clock("join", type)}</h3>
    <ul>${better.map((c) => `<li><span><b>${esc(typeName(c.t))}</b>: ${c.wait === 0 ? "jetzt frei" : `dran in ${clock("join", c.t)}`}</span>${typeAction(st, w, c.t)}</li>`).join("")}</ul></section>`;
}

// Was kann ich an diesem einzelnen Gerät tun?
function deviceActionsHtml(st, w, d) {
  const s = st.devices[d.id], r = data.rules;
  if (s.occupiedBy?.id === me.id)
    return `<p class="clockbig">${clock("phase", d.id)}</p>
      ${btn("set", d.id, `✓ Satz ${s.completedSets + 1} von ${s.plannedSets} geschafft`, true)}
      ${btn("finish", d.id, "Training abbrechen, Gerät freigeben")}
      <p class="meta">Hake jeden Satz direkt ab. So sehen die Wartenden, wie weit du bist.</p>`;
  if (s.reservedFor?.id === me.id)
    return `<p><b>Du bist dran.</b> Noch ${clock("res", d.id)} Zeit zum Starten.</p>
      ${btn("start", d.id, "Gerät beziehen, Training starten", true, "", false)} ${btn("finish", d.id, "Platz freigeben")}`;
  if (isCompletelyFree(st, d.id)) {
    if (w.training) return `<p>Du trainierst gerade ${an(w.training)} ${link(w.training)}. Beende dort zuerst dein Training.</p>`;
    if (w.queued) return `<p>Das Gerät ist frei. Du stehst ${anType(w.queued.type)} ${esc(typeName(w.queued.type))} an (Nr. ${w.queued.position}, dran in ${clock("eta", w.queued.type, ` data-pos="${w.queued.position}"`)}).</p>
      ${btn("start-keep", d.id, "Hier überbrücken, Platz behalten", true)}${btn("start", d.id, "Wechseln: Platz aufgeben und hier trainieren")}`;
    return `${btn("start", d.id, "Training starten", true)}`;
  }
  const action = typeAction(st, w, d.type);
  if (action.startsWith("<b>")) return `<p>${action}</p>`;
  if (!action) return w.training
    ? `<p>Du trainierst gerade ${an(w.training)} ${link(w.training)}. Anstellen geht erst nach mehr als ${r.nextQueueAfterPercentSets} % deiner Sätze.</p>`
    : "";
  const many = devicesOf(d.type).length > 1;
  return `<p>Wartezeit: ${clock("join", d.type)}.${many ? ` Du bekommst das erste freie Gerät vom Typ ${esc(typeName(d.type))}.` : ""}</p>
    ${action.replace('class="button"', 'class="button primary"')}`;
}

function simHtml(d, s) {
  const sim = (s.status === "occupied" && isSim(s.occupiedBy)) ? `${esc(s.occupiedBy.name)} sofort fertig`
    : (s.status === "reserved" && isSim(s.reservedFor)) ? `${esc(s.reservedFor.name)} startet sofort` : "";
  return sim ? `<p class="simctl">Simulation: ${btn("sim", d.id, sim)}</p>` : "";
}

// ---------- Ansichten ----------
function renderList() {
  const st = store.getState(), w = whereIs(st, me.id);
  const free = data.devices.filter((d) => st.devices[d.id].status === "free").length;
  const groups = [...new Set(data.devices.map((d) => d.muscleGroup))];
  $("#view").innerHTML = `
    <h2>Geräte in ${esc(data.meta.studioName)}</h2>
    <p class="meta">${data.devices.length} Geräte, ${free} frei. Du stellst dich je Gerätetyp an und bekommst das erste freie Gerät.</p>
    ${flashHtml()}
    
    ${groups.map((g) => `<h3 class="group">${esc(g)}</h3>
      <ul class="types">${types().filter((t) => devicesOf(t)[0].muscleGroup === g).map((t) => typeCard(st, w, t)).join("")}</ul>`).join("")}`;
  document.title = "Geräteblick – Übersicht";
}

function renderDevice(id) {
  const d = devById(id);
  if (!d) {
    $("#view").innerHTML = `
      <div class="error" role="alert"><strong>Gerät nicht gefunden.</strong>
      <p>Der Code „${esc(id)}“ gehört zu keinem Gerät in diesem Studio. Vielleicht ist der QR-Code veraltet oder beschädigt.</p>
      <a class="button" data-nav href="?">Zur Geräteübersicht</a></div>`;
    document.title = "Geräteblick – Gerät nicht gefunden";
    return;
  }
  const st = store.getState(), w = whereIs(st, me.id), s = st.devices[d.id], si = statusInfo(s);
  $("#view").innerHTML = `
    <a class="back" data-nav href="?">← Alle Geräte</a>
    <article class="device">
      <img src="${esc(d.icon)}" alt="Skizze: ${esc(d.name)}" class="device-img">
      <div>
        <h2>${esc(label(d))}</h2>
        <p class="meta">${esc(d.exercise)} · ${esc(d.muscleGroup)}</p>
        <p class="where">📍 ${esc(d.location)}</p>
        <p class="pill big ${si.cls}">${si.icon} ${si.text}</p>
        <p>${statusLine(s)} ${esc(typeName(d.type))}: ${waitingText(queueCount(st, d.type))}.</p>
        ${progressHtml(d, s)}
      </div>
    </article>
    ${flashHtml()}
    <section class="actions" aria-label="Was möchtest du tun?">${deviceActionsHtml(st, w, d)}</section>
    ${alternativesHtml(st, w, d.type)}
    ${queueHtml(st, d.type)}
    <details class="mapbox"><summary>Wo steht das Gerät?</summary>${mapSvg(d.id)}</details>
    ${simHtml(d, s)}`;
  document.title = `Geräteblick – ${label(d)}`;
}

// Tab "Mein Training": aktuelles Gerät, Warteschlange, nächstes Gerät.
function renderMine() {
  const st = store.getState(), w = whereIs(st, me.id), r = data.rules;
  const cur = w.training || w.reserved;
  let html = `<h2>Mein Training</h2>${flashHtml()}<h3 class="group">Aktuelles Gerät</h3>`;
  if (cur) {
    const d = devById(cur), s = st.devices[cur];
    html += `<article class="device"><img src="${esc(d.icon)}" alt="" class="device-img"><div>
      <h2>${link(cur)}</h2>${progressHtml(d, s)}<section class="actions">${deviceActionsHtml(st, w, d)}</section></div></article>`;
  } else html += `<p class="meta">Du trainierst gerade nicht. Wähle unten ein Gerät oder scanne den QR-Code am Gerät.</p>`;

  html += `<h3 class="group">Warteschlange</h3>`;
  if (w.queued) {
    const t = w.queued.type;
    html += `<div class="card"><p>Du bist <b>Nr. ${w.queued.position}</b> ${anType(t)} <b>${esc(typeName(t))}</b> (${w.queued.sets} Sätze), dran in ${clock("eta", t, ` data-pos="${w.queued.position}"`)}.</p>
      ${btn("leave", t, "Warteschlange verlassen")}${alternativesHtml(st, w, t)}</div>`;
  } else html += `<p class="meta">Du stehst nirgends an.</p>`;

  const train = w.training ? st.devices[w.training] : null;
  html += `<h3 class="group">Nächstes Gerät</h3>`;
  if (train && !trainingFarEnough(train, r))
    html += `<p class="meta">Anstellen geht ab mehr als ${r.nextQueueAfterPercentSets} % deiner Sätze, also nach Satz ${Math.floor(train.plannedSets * r.nextQueueAfterPercentSets / 100) + 1} von ${train.plannedSets}.</p>`;
  const now = Date.now();
  const list = types().filter((t) => !cur || st.devices[cur].type !== t)
    .map((t) => ({ t, wait: joinWaitMs(st, t, r, now) })).sort((a, b) => a.wait - b.wait);
  html += `<ul class="next">${list.map(({ t, wait }) => `<li class="next-row">
      <span><b>${esc(typeName(t))}</b><span class="meta"> · ${esc(devicesOf(t)[0].muscleGroup)} · ${wait === 0 ? "frei" : `dran in ${clock("join", t)}`}</span></span>${typeAction(st, w, t)}</li>`).join("")}</ul>`;
  $("#view").innerHTML = html;
  document.title = "Geräteblick – Mein Training";
}

function baseUrl() {
  return data.meta.publicBaseUrl || (location.origin + location.pathname);
}

function renderQr() {
  $("#view").innerHTML = `
    <h2>QR-Codes zum Aufkleben</h2>
    <p class="meta">Im echten Studio klebt an jedem Gerät ein Code. Scannen öffnet direkt dieses Gerät. Zum Testen am PC: Link unter dem Code anklicken.</p>
    <ul class="qr-grid">${data.devices.map((d) => {
      const url = `${baseUrl()}?geraet=${encodeURIComponent(d.id)}`;
      return `<li class="qr-card"><img alt="QR-Code für ${esc(label(d))}" src="${qrDataUrl(url)}" width="160" height="160">
        <b>${esc(label(d))}</b><a data-nav href="?geraet=${encodeURIComponent(d.id)}">?geraet=${esc(d.id)}</a></li>`;
    }).join("")}</ul>
    <p class="hint">Die Codes zeigen auf die feste Adresse aus <code>publicBaseUrl</code> in devices.json und können ausgedruckt werden.</p>`;
  document.title = "Geräteblick – QR-Codes";
}

function qrDataUrl(text) {
  if (typeof window.qrcode !== "function") return "";
  const qr = window.qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(4, 2);
}

// ---------- Uhr: jede Sekunde Zeit fortschreiben und Anzeigen aktualisieren ----------
let clockQueued = false, lastFull = Date.now(), lastAsk = false;
function fillClocksSoon() {
  lastFull = Date.now();
  if (clockQueued) return;
  clockQueued = true;
  queueMicrotask(() => { clockQueued = false; updateClocksOnly(); });
}

function updateClocks() {
  if (!store) return;
  store.tick(); // ändert sich etwas (Bot hakt ab, Reservierung läuft ab), wird über subscribe neu gezeichnet
  const st = store.getState(), w = whereIs(st, me.id);
  // Sitzung abgelaufen: nur wenn man nirgends angemeldet ist (Wartende und Trainierende räumen sich selbst auf).
  if (isIdle(me, idleMs) && !w.training && !w.reserved && !w.queued) {
    const old = me.name;
    me = renewIdentity();
    $("#me").textContent = me.name;
    alertText = `Deine Sitzung als ${old} ist nach ${data.rules.idleMinutes} Minuten ohne Aktivität abgelaufen. Du bist jetzt ${me.name}.`;
    return render();
  }
  // "Bist du noch da?" erscheint/verschwindet, Wartezeiten und Alternativen ändern sich: regelmäßig neu zeichnen.
  const ask = !!(w.training && presence(st.devices[w.training], data.rules, Date.now())?.state === "ask");
  const focused = document.activeElement && document.activeElement.matches("select");
  if (ask !== lastAsk || (!focused && Date.now() - lastFull > 15_000)) { lastAsk = ask; return render(); }
  updateClocksOnly();
}

function updateClocksOnly() {
  if (!store) return;
  const st = store.getState(), now = Date.now(), r = data.rules;
  document.querySelectorAll("[data-clock]").forEach((el) => {
    const kind = el.dataset.clock, ref = el.dataset.ref;
    if (kind === "eta") { el.textContent = approx(etaMs(st, ref, Number(el.dataset.pos), r, now)); return; }
    if (kind === "join") { el.textContent = approx(joinWaitMs(st, ref, r, now)); return; }
    const d = st.devices[ref];
    if (!d) return;
    if (kind === "free") el.textContent = approx(msUntilFree(d, r, now));
    else if (kind === "res") el.textContent = mmss(reservationMsLeft(d, now));
    else if (kind === "pres") el.textContent = mmss(presence(d, r, now)?.msLeft ?? 0);
    else if (kind === "phase" || kind === "bar") {
      const ph = phase(d, r, now);
      if (!ph) { el.textContent = ""; return; }
      if (kind === "bar") { el.style.width = `${Math.min(100, 100 - (ph.msLeft / trainingMs(d.plannedSets, r)) * 100)}%`; return; }
      el.textContent = ph.kind === "rest" ? `Pause, Satz ${ph.set} in ${mmss(ph.msLeftInPhase)}`
        : ph.kind === "set" ? `Satz ${ph.set} von ${d.plannedSets} läuft, noch ${mmss(ph.msLeftInPhase)}`
        : `Satz ${ph.set} von ${d.plannedSets} dauert länger als geplant`;
    }
  });
}
setInterval(updateClocks, 1000);

// ---------- Laden mit Fehlerfall ----------
async function load() {
  $("#error").hidden = true;
  $("#view").innerHTML = `<p class="meta" role="status">Gerätedaten werden geladen …</p>`;
  try {
    const r = await fetch(DATA_URL, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (!Array.isArray(json.devices) || !json.devices.length || !json.rules || !json.map) throw new Error("Datensatz unvollständig");
    data = json;
    idleMs = (data.rules.idleMinutes || 20) * 60_000;
    store = createLocalStore(data);
    store.subscribe(() => render());
    render();
  } catch (e) {
    console.error(e);
    $("#view").innerHTML = "";
    $("#error-detail").textContent = `Technische Meldung: ${e.message}. Prüfe die Verbindung. Mit „Erneut laden“ startest du einen neuen Versuch.`;
    $("#error").hidden = false;
  }
}

$("#me").textContent = me.name;
$("#retry").addEventListener("click", () => {
  if (DATA_URL.includes("nicht-vorhanden")) location.href = location.pathname; else load();
});
$("#reset").addEventListener("click", () => store && store.reset());
render();
load();
