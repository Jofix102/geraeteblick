import { getIdentity, touch, isIdle, renewIdentity } from "./identity.js?v=0.10.0";
import { createLocalStore } from "./store-local.js?v=0.10.0";
import { pikto, hasPikto } from "./pikto.js?v=0.10.0";
import {
  whereIs, isCompletelyFree, freeDeviceOfType, trainingFarEnough, isSim, phase, etaMs, msUntilFree,
  reservationMsLeft, trainingMs, joinWaitMs, presence, lastSetBefore
} from "./queue-logic.js?v=0.10.0";

const params = new URLSearchParams(location.search);
const DATA_URL = params.has("fehler") ? "../data/nicht-vorhanden.json" : "../data/devices.json";
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let data = null, store = null, flash = null, chosenSets = null, alertText = "", ownAction = false;
let lastReserved = null, lastTraining = null, turnShownFor = null, soonShownFor = null;
let me = getIdentity();
let idleMs = 20 * 60_000; // wird nach dem Laden aus rules.idleMinutes übernommen

// ---------- Trainingsplan: pro Tab (= Gast) im sessionStorage ----------
// Nur feste Pläne aus devices.json („plans“). Gespeichert wird nur, welcher Plan gewählt ist und was erledigt ist.
const PLAN_KEY = "geraeteblick.plan.v2";
let planId = "", plan = [];
(() => { try { const p = JSON.parse(sessionStorage.getItem(PLAN_KEY)); if (p) { planId = p.id; plan = p.items; } } catch { /* leer */ } })();
const savePlan = () => { try { sessionStorage.setItem(PLAN_KEY, JSON.stringify({ id: planId, items: plan })); } catch { /* privater Modus */ } };
const plans = () => data.plans || [];
function choosePlan(id) {
  const p = plans().find((x) => x.id === id); if (!p) return;
  planId = id; plan = p.items.map((i) => ({ type: i.type, sets: i.sets, done: false })); savePlan();
}
function markPlanDone(type) {
  const i = plan.findIndex((p) => !p.done && p.type === type);
  if (i >= 0) { plan[i].done = true; savePlan(); }
}

// Aktivität = echte Bedienung (nicht das bloße Neuzeichnen durch andere Tabs).
let lastTouch = 0;
["click", "keydown", "change", "touchstart"].forEach((t) => document.addEventListener(t, () => {
  if (Date.now() - lastTouch > 5000) { lastTouch = Date.now(); touch(me); }
}, { passive: true }));

// ---------- Symbole (eigene SVG-Pfade statt Emojis) ----------
const ICONS = {
  pin: "M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z",
  check: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z",
  dot: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.5 2.1-.8 1.3L11 13V6h2z",
  back: "M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z",
  chev: "M8.6 16.6 13.2 12 8.6 7.4 10 6l6 6-6 6z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z",
  edit: "M3 17.2V21h3.8l11-11-3.8-3.8zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8z",
  up: "M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z",
  minus: "M19 13H5v-2h14z",
  close: "M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"
};
const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

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
const NEEDS_SETS = new Set(["join", "join-switch", "start", "start-keep", "reserve", "reserve-keep"]);
const btn = (action, ref, text, primary = false, go = "", needSets = NEEDS_SETS.has(action)) =>
  `<button type="button" class="${primary ? "button primary" : "button"}" data-action="${action}" data-ref="${esc(ref)}"${go ? ` data-go="${esc(go)}"` : ""}${needSets ? " data-needsets" : ""}>${text}</button>`;

function statusInfo(s) {
  if (s.status === "free") return { cls: "free", text: "Frei", icon: icon("check") };
  if (s.status === "reserved") return { cls: "ready", text: "Reserviert", icon: icon("clock") };
  return { cls: "busy", text: "Belegt", icon: icon("dot") };
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
    alertText = `Deine Reservierung ${an(lastReserved)} ${label(devById(lastReserved))} ist abgelaufen, weil du die Ankunft nicht bestätigt hast.`;
  if (lastTraining && !w.training && !ownAction)
    alertText = `Du wurdest ${an(lastTraining)} ${label(devById(lastTraining))} abgemeldet, weil ${data.rules.removeWithoutAnswerMinute} Minuten keine Rückmeldung kam.`;
  lastReserved = w.reserved; lastTraining = w.training; ownAction = false;

  const parts = [];
  if (alertText) parts.push(`<p class="bar-line">${esc(alertText)} <button type="button" class="linklike" data-dismiss>OK</button></p>`);
  if (w.reserved) parts.push(`<p class="bar-line turn"><b>${st.devices[w.reserved].reservedFor.direct ? "Für dich reserviert:" : `Du bist dran ${an(w.reserved)}`} ${esc(label(devById(w.reserved)))}!</b> ${clock("res", w.reserved)} <button type="button" class="button primary" data-showturn>Karte zeigen</button></p>`);
  if (w.training && presence(st.devices[w.training], data.rules, Date.now())?.state === "ask")
    parts.push(`<p class="bar-line turn"><b>Bist du noch da?</b> Sonst wirst du in ${clock("pres", w.training)} abgemeldet. ${btn("here", w.training, "Ja, bin noch da", true)}</p>`);
  // U5: Platz 1 und am Gerät läuft der letzte Satz → vorwarnen (einmal kurz vibrieren).
  const soon = w.queued && lastSetBefore(st, w.queued.type, me.id);
  if (soon) {
    parts.push(`<p class="bar-line turn"><b>Gleich bist du dran:</b> ${an(soon)} ${esc(label(devById(soon)))} läuft der letzte Satz. Mach dich bereit.</p>`);
    if (soonShownFor !== soon && navigator.vibrate) navigator.vibrate(150);
  }
  soonShownFor = soon || null;
  // Auf „Mein Training“ und auf der eigenen Geräteseite steht das schon groß da: Leiste dort knapp halten.
  const q = new URLSearchParams(location.search);
  const onMine = ["ich", "training", null].includes(q.get("ansicht")) && !q.has("geraet") && !q.has("gruppe"), onDev = q.get("geraet");
  if (w.training && !onMine && onDev !== w.training) parts.push(`<p class="bar-line">Du trainierst ${an(w.training)} <b>${esc(label(devById(w.training)))}</b>: ${clock("phase", w.training)}. <a data-nav href="?ansicht=training">Öffnen</a></p>`);
  if (w.queued && !onMine) parts.push(`<p class="bar-line">Du bist <b>Nr. ${w.queued.position}</b> ${anType(w.queued.type)} <b>${esc(typeName(w.queued.type))}</b>, dran in ${clock("eta", w.queued.type, ` data-pos="${w.queued.position}"`)} <a data-nav href="?">Ansehen</a> <button type="button" class="linklike" data-action="leave" data-ref="${esc(w.queued.type)}">Verlassen</button></p>`);
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
  const d = devById(w.reserved), s = st.devices[w.reserved], direct = !!s.reservedFor.direct;
  const n = s.reservedFor.sets;
  const arrive = w.training ? `${an(w.training) === "am" ? "Am" : "An der"} ${esc(label(devById(w.training)))} beenden, ich bin da` : "Ich bin da, Training starten";
  dlg.innerHTML = `
    <h2>${direct ? `Geh ${feminine(d.name) ? "zur" : "zum"}` : "Du bist dran:"} ${esc(label(d))}</h2>
    <p class="where">${icon("pin")} <span>${esc(d.location)}</span></p>
    <p>Das Gerät ist für dich reserviert. Bestätige innerhalb von <b>${clock("res", d.id)}</b>, sobald du angekommen bist.</p>
    ${mapSvg(d.id)}
    <p class="meta">${n} ${n === 1 ? "Satz" : "Sätze"}</p>
    <div class="actions">${btn("start", d.id, arrive, true, "?ansicht=training", false)}
    ${btn("finish", d.id, direct ? "Abbrechen" : "Platz freigeben")}</div>`;
  if (turnShownFor !== w.reserved) {
    turnShownFor = w.reserved;
    if (!dlg.open && typeof dlg.showModal === "function") dlg.showModal();
    if (!direct) signal(); // Ton nur, wenn man aus der Warteschlange drankommt
  }
}

// Ton und Vibration (Vibration nur auf Geräten, die sie unterstützen, z. B. Android).
function signal() {
  try { const a = new Audio("assets/dran.wav"); a.play().catch(() => {}); } catch { /* kein Ton möglich */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// Grundriss als SVG aus den Koordinaten in devices.json; hervorgehobenes Gerät pulsiert.
function mapSvg(highlightId, clickable = false) {
  const m = data.map, st = store.getState();
  const zones = m.zones.map((z) => `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="2" class="zone"/>
    <text x="${z.x + 1.5}" y="${z.y + z.h - 1.5}" class="zone-label">${esc(z.label)}</text>`).join("");
  const dots = data.devices.map((d) => {
    const s = st.devices[d.id], hi = d.id === highlightId;
    const g = `<g class="spot ${s.status}${hi ? " hi" : ""}"><title>${esc(label(d))}: ${statusInfo(s).text}</title>
      ${hi ? `<circle cx="${d.map.x}" cy="${d.map.y}" r="6" class="pulse"/>` : ""}
      <circle cx="${d.map.x}" cy="${d.map.y}" r="${hi ? 3.6 : clickable ? 3 : 2.4}"/></g>`;
    return clickable ? `<a href="?geraet=${encodeURIComponent(d.id)}" data-nav aria-label="${esc(label(d))}, ${statusInfo(s).text}">${g}</a>` : g;
  }).join("");
  const e = m.entrance;
  return `<svg class="map" viewBox="0 0 ${m.width} ${m.height + 4}" role="img" aria-label="${highlightId ? `Grundriss: ${esc(label(devById(highlightId)))} ist markiert` : "Grundriss des Studios"}">
    <rect x="0.5" y="0.5" width="${m.width - 1}" height="${m.height - 1}" class="floor"/>${zones}${dots}
    <text x="${e.x}" y="${e.y + 3}" class="entrance" text-anchor="middle">${esc(e.label)} ↑</text></svg>`;
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
  reserve: (type) => store.reserve(type, me, { sets: sets() }),
  "reserve-keep": (type) => store.reserve(type, me, { keepQueue: true, sets: sets() }),
  set: (id) => store.completeSet(id, me.id),
  here: (id) => store.confirmPresence(id, me.id),
  finish: (id) => store.finish(id, me.id),
  sim: (id) => store.simulateStep(id)
};
const DONE = {
  join: "Du stehst jetzt in der Warteschlange.", "join-switch": "Gewechselt: Du stehst jetzt hier an.",
  leave: "Du hast die Warteschlange verlassen.", start: "Training gestartet.",
  reserve: "Gerät reserviert. Geh hin und bestätige deine Ankunft.", "reserve-keep": "Gerät reserviert, dein Platz in der Warteschlange bleibt.",
  "start-keep": "Training gestartet. Dein Platz in der Warteschlange bleibt.", finish: "Gerät freigegeben.",
  sim: "Simulation: Sim-Gast ist weiter.", set: "Satz abgehakt. Jetzt Pause.", here: "Danke, du bleibst angemeldet."
};
// Menschlicher Ton: kurze, ermutigende Rückmeldung nach jedem Satz.
function setText(id) {
  const d = store.getState().devices[id], left = d.plannedSets - d.completedSets;
  const cheer = ["Stark!", "Sauber!", "Gut gemacht!", "Weiter so!"][d.completedSets % 4];
  return `${cheer} Noch ${left === 1 ? "ein Satz" : `${left} Sätze`}. Gönn dir die Pause.`;
}
function doneText(type) {
  const next = plan.find((p) => !p.done);
  if (plan.length && !next) return "Geschafft! Dein ganzer Plan ist erledigt. Starke Leistung!";
  return next ? `Übung geschafft! Als Nächstes: ${typeName(next.type)}.` : "Übung geschafft! Das Gerät ist frei für den Nächsten.";
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-action]");
  if (!b || !store) return;
  if (b.hasAttribute("data-needsets")) return askSets(b);
  if (b.dataset.sets) { chosenSets = Number(b.dataset.sets); $("#sets").close(); }
  ownAction = true;
  const before = whereIs(store.getState(), me.id);
  const trainingType = before.training ? store.getState().devices[before.training].type : null;
  const result = ACTIONS[b.dataset.action](b.dataset.ref);
  if (result.ok && result.code === "done" && trainingType) markPlanDone(trainingType);
  flash = { ok: result.ok, text: !result.ok ? result.text : result.code === "done" ? doneText(trainingType) : b.dataset.action === "set" ? setText(b.dataset.ref) : DONE[b.dataset.action] };
  if (result.ok && b.dataset.go) return navigate(b.dataset.go);
  render();
});
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-dismiss]")) { alertText = ""; render(); }
  if (e.target.matches("[data-showturn]")) { turnShownFor = null; render(); }
  if (e.target.matches("[data-closesets]")) $("#sets").close();
  const pb = e.target.closest("[data-plan]");
  if (pb) {
    const [op, arg] = pb.dataset.plan.split(":"), i = Number(arg);
    if (op === "open") { renderPlanEditor(); $("#plan").showModal(); return; }
    if (op === "close") { $("#plan").close(); render(); return; }
    if (op === "choose") { choosePlan(arg); $("#plan").close(); render(); return; }
    if (op === "redo") plan.forEach((p) => { p.done = false; });
    if (op === "clear") { planId = ""; plan = []; }
    savePlan(); render();
  }
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
  const v = q.get("ansicht");
  const live = v === "training";
  const tab = live ? "" : q.has("geraet") || q.has("gruppe") || v === "geraete" ? "geraete" : v === "qr" ? "qr" : v === "karte" ? "karte" : "jetzt";
  document.body.classList.toggle("live", live);
  document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-current", String(t.dataset.tab === tab)));
  if (!data) return;
  if (live) renderTraining();
  else if (q.has("geraet")) renderDevice(q.get("geraet"));
  else if (q.has("gruppe")) renderDevices(q.get("gruppe"));
  else if (v === "geraete") renderDevices("");
  else if (tab === "qr") renderQr();
  else if (tab === "karte") renderMap();
  else renderNow();
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
  const verb = b.dataset.action.startsWith("join") ? "Anstellen" : b.dataset.action.startsWith("reserve") ? "Reservieren" : "Starten";
  const nums = Array.from({ length: r.maxSets }, (_, i) => i + 1).map((n) =>
    `<button type="button" class="setbtn${n === sets() ? " suggested" : ""}" data-action="${b.dataset.action}" data-ref="${esc(ref)}" data-sets="${n}"${b.dataset.go ? ` data-go="${esc(b.dataset.go)}"` : ""}>
      <span class="num">${n}</span><span>${n === 1 ? "Satz" : "Sätze"}</span></button>`).join("");
  dlg.innerHTML = `<h2>Wie viele Sätze ${anType(type)} ${esc(typeName(type))}?</h2>
    <p class="meta">Tippe die Zahl an. Damit wird ${{ Anstellen: "angestellt", Reservieren: "das Gerät für dich reserviert", Starten: "gestartet" }[verb]}.</p>
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
    if (w.queued) return btn("reserve-keep", type, "Hier überbrücken");
    return btn("reserve", type, "Freies Gerät nehmen");
  }
  if (w.training && !trainingFarEnough(st.devices[w.training], r)) return "";
  return btn(w.queued ? "join-switch" : "join", type, w.queued ? "Wechseln: hier anstellen" : "Anstellen");
}

// Kachel je Gerätetyp: Bild zuerst, wenig Text.
function typeCard(st, w, type) {
  const devs = devicesOf(type), free = devs.filter((d) => st.devices[d.id].status === "free").length;
  const n = queueCount(st, type), freeNow = !!freeDeviceOfType(st, type);
  const chips = devs.length > 1 ? `<ul class="chips">${devs.map((d) => {
    const si = statusInfo(st.devices[d.id]);
    return `<li><a class="chip" data-nav href="?geraet=${encodeURIComponent(d.id)}"><span class="pill ${si.cls}">${si.icon}</span>${esc(d.position)}</a></li>`;
  }).join("")}</ul>` : "";
  const head = devs.length > 1 ? `<b>${esc(typeName(type))}</b>` : `<a data-nav href="?geraet=${encodeURIComponent(devs[0].id)}"><b>${esc(typeName(type))}</b></a>`;
  return `<li class="type-tile">
    <img class="pic" src="${esc(typeIcon(type))}" alt="">
    <div class="tt-main">${head}
      <span class="badges"><span class="badge ${freeNow ? "free" : "wait"}">${freeNow ? `${free} frei` : `${icon("clock")} ${clock("join", type)}`}</span>${n ? `<span class="badge">${icon("user")} ${n}</span>` : ""}</span>
      ${chips}</div>
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
    return `<div class="trainer">
      <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="${s.completedSets} von ${s.plannedSets} Sätzen erledigt">
        <circle class="track" cx="60" cy="60" r="50"/>
        <circle class="arc" cx="60" cy="60" r="50" stroke-dasharray="314.16" stroke-dashoffset="${314.16 * (1 - s.completedSets / s.plannedSets)}"/>
        <text x="60" y="64" text-anchor="middle">${s.completedSets}/${s.plannedSets}</text>
        <text x="60" y="80" text-anchor="middle" class="ring-sub">Sätze erledigt</text>
      </svg>
      <p class="meta trainer-info">${s.completedSets ? "Seit dem letzten Satz" : "Seit dem Start"} ${clock("since", d.id)} · Wartende rechnen mit frei in ${clock("free", d.id)}</p>
      <p class="meta">Mach Sätze und Pausen in deinem Tempo. Hake jeden Satz direkt nach dem Satz ab.</p>
      ${btn("set", d.id, `${icon("check")} Satz ${s.completedSets + 1} von ${s.plannedSets} geschafft`, true).replace('class="button primary"', 'class="button primary check"')}
      <button type="button" class="linklike" data-action="finish" data-ref="${esc(d.id)}">Training abbrechen, Gerät freigeben</button>
    </div>`;
  if (s.reservedFor?.id === me.id)
    return `<p><b>Für dich reserviert.</b> Noch ${clock("res", d.id)} Zeit, deine Ankunft zu bestätigen.</p>
      ${btn("start", d.id, "Ich bin da, Training starten", true, "?ansicht=training", false)} ${btn("finish", d.id, "Platz freigeben")}`;
  if (isCompletelyFree(st, d.id)) {
    if (w.training) return `<p>Du trainierst gerade ${an(w.training)} ${link(w.training)}. Beende dort zuerst dein Training.</p>`;
    if (w.queued) return `<p>Das Gerät ist frei. Du stehst ${anType(w.queued.type)} ${esc(typeName(w.queued.type))} an (Nr. ${w.queued.position}, dran in ${clock("eta", w.queued.type, ` data-pos="${w.queued.position}"`)}).</p>
      ${btn("reserve-keep", d.id, "Hier überbrücken, Platz behalten", true)}${btn("reserve", d.id, "Wechseln: Platz aufgeben und dieses Gerät nehmen")}`;
    return `${btn("reserve", d.id, "Dieses Gerät nehmen", true)}`;
  }
  const action = typeAction(st, w, d.type);
  if (action.startsWith("<b>")) return `<p>${action}</p>`;
  if (!action) return w.training
    ? `<p>Du trainierst gerade ${an(w.training)} ${link(w.training)}. Anstellen geht erst nach mehr als ${r.nextQueueAfterPercentSets} % deiner Sätze.</p>`
    : "";
  const many = devicesOf(d.type).length > 1;
  return `<p>Wartezeit <b>${clock("join", d.type)}</b>${many ? `<br><span class="meta">Du bekommst das erste freie Gerät vom Typ ${esc(typeName(d.type))}.</span>` : ""}</p>
    ${action.replace('class="button"', 'class="button primary"')}`;
}

function simHtml(d, s) {
  const sim = (s.status === "occupied" && isSim(s.occupiedBy)) ? `${esc(s.occupiedBy.name)} sofort fertig`
    : (s.status === "reserved" && isSim(s.reservedFor)) ? `${esc(s.reservedFor.name)} startet sofort` : "";
  return sim ? `<p class="simctl">Simulation: ${btn("sim", d.id, sim)}</p>` : "";
}

// ---------- Ansichten (v0.7, Aufbau nach Apple Human Interface Guidelines) ----------
// Tabs: Jetzt (nächster Schritt + Plan), Geräte (stöbern), Karte. Training läuft als eigener Vollbildschirm.
const groupsList = () => [...new Set(data.devices.map((d) => d.muscleGroup))];
const typesOfGroup = (g) => types().filter((t) => devicesOf(t)[0].muscleGroup === g);
// Piktogramme als Inline-SVG (Farben aus dem Stylesheet); Datei aus devices.json nur als Rückfall.
const media = (type, cls = "") => hasPikto(type) ? `<span class="media pikto ${cls}">${pikto(type)}</span>`
  : `<img class="media pikto ${cls}" src="${esc(typeIcon(type))}" alt="" loading="lazy">`;
const titleBar = (title, extra = "") => `<header class="largetitle"><div class="lt-top"><span>${esc(data.meta.studioName)}</span><button type="button" class="simchip" data-intro>Simulation</button></div><h1>${title}</h1>${extra}</header>`;
// Der „blaue Faden“: Fortschritt im Plan, gleich dargestellt auf Jetzt, Gerät und Training.
function trail(type, dark = false) {
  if (!plan.length) return "";
  const cur = plan.findIndex((p) => !p.done && (!type || p.type === type));
  const segs = plan.map((p, i) => `<i class="${p.done ? "d" : i === cur ? "c" : ""}"></i>`).join("");
  const done = plan.filter((p) => p.done).length;
  return `<div class="trail${dark ? " dark" : ""}" role="img" aria-label="${esc(planName())}: ${done} von ${plan.length} Übungen erledigt"><span class="trail-bar">${segs}</span><span class="trail-tx">${esc(planName())} · ${done} von ${plan.length} geschafft</span></div>`;
}
function greet() {
  const h = new Date().getHours();
  return h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
}
const section = (title, body, right = "") => `<section class="grp"><div class="grp-head"><h2>${title}</h2>${right}</div>${body}</section>`;

// Status eines Gerätetyps als kurzer Text mit Farbe (nie nur Farbe, vgl. HIG „Inclusive color“).
function typeStatus(st, type) {
  const devs = devicesOf(type), free = devs.filter((d) => st.devices[d.id].status === "free").length;
  if (freeDeviceOfType(st, type)) return `<span class="st ok">${devs.length > 1 ? `${free} frei` : "frei"}</span>`;
  return `<span class="st warn">${clock("join", type)}</span>`;
}
function typeSub(st, type) {
  const n = devicesOf(type).length, q = queueCount(st, type);
  return `${n} ${n === 1 ? "Gerät" : "Geräte"}${q ? ` · ${q} ${q === 1 ? "wartet" : "warten"}` : ""}`;
}
// Ziel beim Antippen eines Typs: ein freies Gerät, sonst das erste.
const typeTarget = (st, type) => (devicesOf(type).find((d) => st.devices[d.id].status === "free") || devicesOf(type)[0]).id;

// --- Jetzt ---
function nowHero(st, w) {
  const r = data.rules;
  if (w.training) {
    const d = devById(w.training), s = st.devices[d.id];
    return `<a class="hero" data-nav href="?ansicht=training">${media(d.type)}<div class="hero-tx">
      <small>Du trainierst</small><h2>${esc(label(d))}</h2><p>${s.completedSets} von ${s.plannedSets} Sätzen · seit ${clock("since", d.id)}</p>
      <span class="pillbtn">Training öffnen</span></div></a>`;
  }
  if (w.reserved) {
    const d = devById(w.reserved);
    return `<div class="hero">${media(d.type)}<div class="hero-tx"><small>Für dich reserviert</small>
      <h2>Geh ${feminine(d.name) ? "zur" : "zum"} ${esc(label(d))}</h2><p>Noch ${clock("res", d.id)} zum Bestätigen</p>
      <button type="button" class="pillbtn" data-showturn>Karte zeigen</button></div></div>`;
  }
  if (w.queued) {
    const t = w.queued.type;
    return `<div class="hero">${media(t)}<div class="hero-tx"><small>Warteschlange ${esc(typeName(t))}</small>
      <h2>Nr. ${w.queued.position}</h2><p>dran in ${clock("eta", t, ` data-pos="${w.queued.position}"`)}</p>
      <button type="button" class="pillbtn ghost" data-action="leave" data-ref="${esc(t)}">Verlassen</button></div></div>`;
  }
  const next = plan.find((p) => !p.done);
  if (next) {
    const free = !!freeDeviceOfType(st, next.type);
    const idx = plan.indexOf(next) + 1;
    return `<div class="hero">${media(next.type)}<div class="hero-tx"><small>${esc(planName() || "Plan")} · ${idx} von ${plan.length}</small>
      <h2>${esc(typeName(next.type))} ${free ? "ist frei" : ""}</h2><p>${next.sets} Sätze${free ? "" : ` · Wartezeit ${clock("join", next.type)}`}</p>
      ${planAction(st, w, next).replace(/class="button[^"]*"/, 'class="pillbtn"').replace("Freies Gerät nehmen", "Gerät nehmen")}</div></div>`;
  }
  if (plan.length) return `<div class="hero done-hero"><div class="hero-tx"><small>${esc(planName())}</small><h2>Plan geschafft</h2>
    <button type="button" class="pillbtn" data-plan="redo">Nochmal von vorn</button></div></div>`;
  return "";
}
const planName = () => plans().find((x) => x.id === planId)?.name || "";

function planRows(st, w) {
  const r = data.rules, train = w.training ? st.devices[w.training] : null;
  const blocked = train && !trainingFarEnough(train, r);
  const nextIdx = plan.findIndex((p) => !p.done && p.type !== train?.type && p.type !== (w.reserved && st.devices[w.reserved].type));
  const curIdx = plan.findIndex((p) => !p.done);
  return `<ul class="list timeline">${plan.map((p, i) => {
    const isCur = train?.type === p.type && !p.done && i === plan.findIndex((x) => !x.done && x.type === p.type);
    const queuedHere = w.queued?.type === p.type;
    let status;
    if (p.done) status = `<span class="st ok">${icon("check")} erledigt</span>`;
    else if (isCur) status = `<span class="st ok">läuft</span>`;
    else if (queuedHere) status = `<span class="st warn">Nr. ${w.queued.position} · ${clock("eta", p.type, ` data-pos="${w.queued.position}"`)}</span>`;
    else status = typeStatus(st, p.type);
    const sub = i === nextIdx && blocked && !queuedHere ? `anstellen ab Satz ${Math.floor(train.plannedSets * r.nextQueueAfterPercentSets / 100) + 1}` : `${p.sets} Sätze`;
    const act = i === nextIdx && !queuedHere && !blocked && (w.training || w.queued || w.reserved) ? `<span class="cell-act">${planAction(st, w, p).replace(/class="button[^"]*"/, 'class="mini"')}</span>` : "";
    const node = p.done ? "done" : i === curIdx ? "now" : "todo";
    return `<li class="cell ${node}${p.done ? " done" : ""}"><span class="node" aria-hidden="true">${p.done ? icon("check") : ""}</span><a class="cell-main" data-nav href="?geraet=${encodeURIComponent(typeTarget(st, p.type))}">${media(p.type, "thumb")}
      <span class="cell-tx"><b>${esc(typeName(p.type))}</b><span>${sub}</span></span><span class="cell-r">${status}</span></a>${act}</li>`;
  }).join("")}</ul>`;
}

function renderNow() {
  const st = store.getState(), w = whereIs(st, me.id);
  const free = data.devices.filter((d) => st.devices[d.id].status === "free").length, all = data.devices.length;
  const lead = w.training ? "Du bist mitten im Training. Weiter so!" : w.reserved ? "Dein Gerät wartet auf dich." : w.queued ? "Du stehst an. Wir sagen dir Bescheid." : plan.length && plan.every((p) => p.done) ? "Starkes Training heute!" : plan.length ? "Bereit für die nächste Übung?" : "Was trainierst du heute?";
  const mine = w.reserved || w.training || null;
  let html = titleBar(`${greet()}!`, `<p class="lead">${lead}</p>${trail()}`) + flashHtml() + `<div class="split"><div class="split-a">` + nowHero(st, w);
  let side = section("Im Studio", `<div class="card load"><span class="n">${free}</span><span class="load-bar"><i><b style="width:${(free / all) * 100}%"></b></i><span>von ${all} Geräten frei</span></span></div>`);
  if (plan.length) html += section(esc(planName() || "Dein Plan"), planRows(st, w), `<button type="button" class="textbtn" data-plan="open">Wechseln</button>`);
  else html += section("Plan wählen", `<div class="plan-choice">${planCards()}</div>`);
  // Am Rechner (ab 1000 px) steht rechts zusätzlich der Grundriss; auf dem Handy ist er im Tab „Karte“.
  side += `<div class="desk-only">${mapCard(mine)}</div>`;
  $("#view").innerHTML = html + `</div><aside class="split-b" aria-label="Studio auf einen Blick">${side}</aside></div>`;
  document.title = "Geräteblick – Jetzt";
}

function planCards() {
  return plans().map((p) => `<button type="button" class="plan-card${p.id === planId ? " current" : ""}" data-plan="choose:${p.id}">
    <span class="pc-tx"><b>${esc(p.name)}</b><span>${p.items.length} Übungen · ${p.items.reduce((a, i) => a + i.sets, 0)} Sätze</span></span>
    <span class="plan-pics">${p.items.map((i) => media(i.type, "mini-pic")).join("")}</span></button>`).join("");
}
function renderPlanEditor() {
  $("#plan").innerHTML = `<h2>Plan wählen</h2>
    <p class="meta">Der Fortschritt des aktuellen Plans wird zurückgesetzt.</p>
    <div class="plan-choice">${planCards()}</div>
    <button type="button" class="button wide" data-plan="close">Abbrechen</button>`;
}

// --- Geräte ---
function renderDevices(filter) {
  if (filter && !groupsList().includes(filter)) return navigate("?ansicht=geraete");
  const st = store.getState();
  const tiles = groupsList().map((g) => {
    const devs = data.devices.filter((d) => d.muscleGroup === g);
    const free = devs.filter((d) => st.devices[d.id].status === "free").length;
    const on = g === filter;
    return `<a class="gtile${on ? " on" : ""}" data-nav href="${on ? "?ansicht=geraete" : `?gruppe=${encodeURIComponent(g)}`}" aria-pressed="${on}">
      ${media(typesOfGroup(g)[0])}<span class="gt-tx"><b>${esc(g)}</b><span>${free ? `${free} von ${devs.length} frei` : "alle belegt"}</span></span></a>`;
  }).join("");
  const groups = (filter ? [filter] : groupsList()).map((g) => section(esc(g), `<ul class="list">${typesOfGroup(g).map((t) =>
    `<li class="cell"><a class="cell-main" data-nav href="?geraet=${encodeURIComponent(typeTarget(st, t))}">${media(t, "thumb")}
      <span class="cell-tx"><b>${esc(typeName(t))}</b><span>${typeSub(st, t)}</span></span><span class="cell-r">${typeStatus(st, t)}<span class="chev" aria-hidden="true">›</span></span></a></li>`).join("")}</ul>`)).join("");
  // Am Rechner (v0.8.1): schlichte Textfilter statt großer Kacheln, Geräte als ruhiges Raster, keine zweite Karte.
  const chips = [`<a class="chip${filter ? "" : " on"}" data-nav href="?ansicht=geraete" aria-pressed="${!filter}">Alle</a>`].concat(groupsList().map((g) =>
    `<a class="chip${g === filter ? " on" : ""}" data-nav href="?gruppe=${encodeURIComponent(g)}" aria-pressed="${g === filter}">${esc(g)}</a>`)).join("");
  $("#view").innerHTML = titleBar("Geräte") + flashHtml() + `<nav class="scroller mob-only" aria-label="Muskelgruppen">${tiles}</nav>`
    + `<nav class="chips desk-only" aria-label="Muskelgruppen">${chips}</nav><div class="devlist">${groups}</div>`;
  document.title = "Geräteblick – Geräte";
}

// --- Karte ---
function renderMap() {
  const st = store.getState(), w = whereIs(st, me.id);
  const mine = w.reserved || w.training || null;
  const n = (k) => data.devices.filter((d) => st.devices[d.id].status === k).length;
  // Am Rechner (v0.8.1): nur der Grundriss, groß und mittig, dazu drei Zahlen statt einer langen Liste.
  $("#view").innerHTML = titleBar("Karte") + `<div class="mapwide">${mapCard(mine, "Grundriss")}
    <p class="footnote">Tippe einen Punkt an, um das Gerät zu öffnen. Gerade <b>${n("free")} frei</b>, ${n("occupied")} belegt, ${n("reserved")} reserviert.</p></div>`;
  document.title = "Geräteblick – Karte";
}

function mapCard(mine, title = "Grundriss") {
  return section(title, `<div class="card mapcard">${mapSvg(mine, true)}
    <p class="legend"><span><i class="lg ok"></i>frei</span><span><i class="lg busy"></i>belegt</span><span><i class="lg ready"></i>reserviert</span>${mine ? `<span><i class="lg me"></i>dein Gerät</span>` : ""}</p></div>`);
}

// --- Gerät ---
function renderDevice(id) {
  const d = devById(id);
  if (!d) {
    $("#view").innerHTML = `<div class="error" role="alert"><strong>Gerät nicht gefunden.</strong>
      <p>Der Code „${esc(id)}“ gehört zu keinem Gerät in diesem Studio. Vielleicht ist der QR-Code veraltet oder beschädigt.</p>
      <a class="button" data-nav href="?ansicht=geraete">Zu den Geräten</a></div>`;
    document.title = "Geräteblick – Gerät nicht gefunden";
    return;
  }
  const st = store.getState(), w = whereIs(st, me.id), s = st.devices[d.id], si = statusInfo(s);
  if (s.occupiedBy?.id === me.id) return navigate("?ansicht=training");
  const q = queueCount(st, d.type);
  $("#view").innerHTML = `
    <div class="devhead">${media(d.type)}<a class="backbtn" data-nav href="?gruppe=${encodeURIComponent(d.muscleGroup)}" aria-label="Zurück zu ${esc(d.muscleGroup)}">${icon("back")}</a></div>
    <div class="devinfo">${plan.some((p) => p.type === d.type && !p.done) ? trail(d.type) : ""}<h1>${esc(label(d))}</h1><p class="sub">${esc(d.exercise)}</p>
      <p class="statusline"><span class="st ${si.cls === "free" ? "ok" : si.cls === "busy" ? "bad" : "warn"}">${si.text}</span>${q ? ` · ${q} ${q === 1 ? "wartet" : "warten"}` : ""}</p>
      ${progressHtml(d, s)}</div>
    ${flashHtml()}
    <div class="device-grid"><div class="col-left">
      <section class="actions" aria-label="Was möchtest du tun?">${deviceActionsHtml(st, w, d)}</section>
      ${alternativesHtml(st, w, d.type)}
      ${queueHtml(st, d.type)}
    </div><div class="col-right">${section("Wo steht es?", `<div class="card mapcard">${mapSvg(d.id)}<p class="where">${icon("pin")} <span>${esc(d.location)}</span></p></div>`)}</div></div>
    ${simHtml(d, s)}`;
  document.title = `Geräteblick – ${label(d)}`;
}

// --- Training (Vollbild, dunkel) ---
function renderTraining() {
  const st = store.getState(), w = whereIs(st, me.id);
  if (!w.training) return navigate("?");
  const d = devById(w.training), s = st.devices[d.id], r = data.rules;
  const idx = plan.findIndex((p) => !p.done && p.type === d.type);
  const ctx = idx >= 0 ? `${esc(planName())} · ${idx + 1} von ${plan.length}` : "Training";
  const C = 2 * Math.PI * 50;
  const ask = presence(s, r, Date.now())?.state === "ask";
  const next = plan.find((p) => !p.done && p.type !== d.type);
  const blocked = !trainingFarEnough(s, r);
  let nextHtml = "";
  if (w.queued) nextHtml = `<div class="nx">${media(w.queued.type, "thumb")}<span class="cell-tx"><b>Als Nächstes: ${esc(typeName(w.queued.type))}</b><span>Nr. ${w.queued.position} in der Schlange</span></span><span class="nx-r">${clock("eta", w.queued.type, ` data-pos="${w.queued.position}"`)}</span></div>`;
  else if (next) nextHtml = `<div class="nx">${media(next.type, "thumb")}<span class="cell-tx"><b>Als Nächstes: ${esc(typeName(next.type))}</b><span>${blocked ? `anstellen ab Satz ${Math.floor(s.plannedSets * r.nextQueueAfterPercentSets / 100) + 1}` : `${next.sets} Sätze`}</span></span>
      ${blocked ? `<span class="nx-r">${clock("join", next.type)}</span>` : `<span class="nx-r">${planAction(st, w, next).replace(/class="button[^"]*"/, 'class="mini"')}</span>`}</div>`;
  $("#view").innerHTML = `
    <div class="live-top"><a class="livex" data-nav href="?" aria-label="Zur Übersicht">${icon("back")}</a><span>${ctx}</span></div>${trail(d.type, true)}
    <h1 class="live-title">${esc(label(d))}</h1><p class="live-sub">${esc(d.location)}</p>
    ${flashHtml()}
    ${ask ? `<div class="askcard"><b>Bist du noch da?</b> Sonst wirst du in ${clock("pres", d.id)} abgemeldet. ${btn("here", d.id, "Ja, bin noch da", true)}</div>` : ""}
    <svg class="livering" viewBox="0 0 120 120" role="img" aria-label="${s.completedSets} von ${s.plannedSets} Sätzen erledigt">
      <circle class="track" cx="60" cy="60" r="50"/><circle class="arc" cx="60" cy="60" r="50" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - s.completedSets / s.plannedSets)}"/>
      <text x="60" y="66" text-anchor="middle">${s.completedSets}/${s.plannedSets}</text></svg>
    <div class="livestats"><div><b>${clock("since", d.id)}</b><span>${s.completedSets ? "seit letztem Satz" : "seit Start"}</span></div><div><b>${clock("free", d.id)}</b><span>bis frei (Schätzung)</span></div></div>
    ${btn("set", d.id, `${icon("check")} Satz ${s.completedSets + 1} geschafft`, true).replace('class="button primary"', 'class="livebtn"')}
    <button type="button" class="liveend" data-action="finish" data-ref="${esc(d.id)}">Gerät freigeben</button>
    ${nextHtml}
    <p class="live-hint">Sätze und Pausen in deinem Tempo. Hake jeden Satz direkt danach ab.</p>`;
  document.title = `Geräteblick – Training ${label(d)}`;
}

// Tab „Jetzt“: Aktion zur nächsten Planübung (Sätze kommen aus dem Plan).
function planAction(st, w, item) {
  const a = typeAction(st, w, item.type);
  const b = a.includes("data-needsets") ? a.replace(" data-needsets", ` data-sets="${item.sets}"`) : a;
  return b.replace('class="button"', 'class="button primary"');
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
    // Seit dem Start bzw. dem letzten abgehakten Satz (Stoppuhr, keine Vorgabe).
    else if (kind === "since") el.textContent = d.status === "occupied" ? mmss(now - (d.lastSetAt || d.startedAt)) : "";
    else if (kind === "pres") el.textContent = mmss(presence(d, r, now)?.msLeft ?? 0);
    // Fortschritt zählt nur abgehakte Sätze. Die Minuten (1 Satz + 3 Pause) dienen nur der Wartezeit-Schätzung.
    else if (kind === "phase" || kind === "bar") {
      if (d.status !== "occupied" || !d.plannedSets) { el.textContent = ""; return; }
      if (kind === "bar") { el.style.width = `${(d.completedSets / d.plannedSets) * 100}%`; return; }
      el.textContent = `${d.completedSets} von ${d.plannedSets} Sätzen erledigt`;
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
// Einführung: einmal beim ersten Besuch, danach über das Etikett „Simulation“.
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-intro]")) $("#intro").showModal();
  if (e.target.closest("[data-closeintro]")) { $("#intro").close(); try { localStorage.setItem("geraeteblick.introSeen", "1"); } catch { /* egal */ } }
});
try { if (!localStorage.getItem("geraeteblick.introSeen") && !params.has("fehler") && !params.has("embed")) $("#intro").showModal(); } catch { /* Speicher gesperrt */ }
render();
load();
