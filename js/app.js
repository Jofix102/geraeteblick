import { getIdentity, touch } from "./identity.js?v=0.3.3";
import { createLocalStore } from "./store-local.js?v=0.3.3";
import { whereIs, isCompletelyFree, trainingFarEnough, isSim, phase, etaMs, msUntilFree, reservationMsLeft, trainingMs } from "./queue-logic.js?v=0.3.3";

const params = new URLSearchParams(location.search);
const DATA_URL = params.has("fehler") ? "data/nicht-vorhanden.json" : "data/devices.json";
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let data = null, store = null, flash = null, chosenSets = null, lastReserved = null, alertText = "";
const me = getIdentity();

const label = (d) => d.position ? `${d.name} ${d.position}` : d.name;

function statusInfo(s) {
  if (s.status === "free") return { cls: "free", text: "Frei", icon: "✓" };
  if (s.status === "reserved") return { cls: "ready", text: "Reserviert", icon: "⏱" };
  return { cls: "busy", text: "Belegt", icon: "●" };
}

const who = (p) => p.id === me.id ? "Du" : esc(p.name);
const devById = (id) => data.devices.find((x) => x.id === id);
// "am Latzug", aber "an der Brustpresse": Artikel aus dem Gerätenamen ableiten.
const mmss = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const approx = (ms) => ms < 60_000 ? "unter 1 Min." : `ca. ${Math.ceil(ms / 60_000)} Min.`;
const clock = (kind, id, extra = "") => `<span data-clock="${kind}" data-device="${esc(id)}"${extra}></span>`;
const an = (id) => /(presse|maschine|extension)$/i.test(devById(id).name) ? "an der" : "am";

function statusLine(s) {
  if (isCompletelyFree(s)) return "Niemand trainiert hier, keine Warteschlange.";
  const q = s.queue.length === 0 ? "niemand wartet" : s.queue.length === 1 ? "1 Person wartet" : `${s.queue.length} Personen warten`;
  if (s.status === "reserved") return `Reserviert für ${who(s.reservedFor)}, ${q}.`;
  const sets = s.plannedSets ? `${s.completedSets} von ${s.plannedSets} Sätzen erledigt` : "trainiert";
  return `${who(s.occupiedBy)}: ${sets}, ${q}.`;
}

// ---------- Leiste "Dein Stand" (immer sichtbar, wenn du irgendwo dran bist) ----------
// Nach dem Zeichnen sofort Zeiten eintragen (ohne erneut tick auszulösen, sonst Endlosschleife).
let clockQueued = false;
function fillClocksSoon() {
  if (clockQueued) return;
  clockQueued = true;
  queueMicrotask(() => { clockQueued = false; updateClocksOnly(); });
}

function renderBar() {
  const bar = $("#mybar");
  if (!store) { bar.hidden = true; return; }
  const w = whereIs(store.getState(), me.id);
  // Reservierung verloren, ohne zu starten: Hinweis zeigen.
  if (lastReserved && !w.reserved && w.training !== lastReserved)
    alertText = `Deine Reservierung ${an(lastReserved)} ${label(devById(lastReserved))} ist abgelaufen. Der Nächste ist dran.`;
  lastReserved = w.reserved;
  const parts = alertText ? [`<p class="bar-line">${esc(alertText)} <button type="button" class="linklike" data-dismiss>OK</button></p>`] : [];
  if (w.reserved) parts.push(`<p class="bar-line turn"><b>Du bist dran ${an(w.reserved)} ${esc(label(devById(w.reserved)))}!</b> <a class="button primary" data-nav href="?geraet=${w.reserved}">Jetzt hin</a></p>`);
  if (w.reserved) parts[parts.length - 1] = parts[parts.length - 1].replace("</b> <a", `</b> ${clock("res", w.reserved)} <a`);
  if (w.training) parts.push(`<p class="bar-line">Du trainierst ${an(w.training)} <b>${esc(label(devById(w.training)))}</b>: ${clock("phase", w.training)}. <a data-nav href="?geraet=${w.training}">Öffnen</a></p>`);
  if (w.queued) parts.push(`<p class="bar-line">Du bist <b>Nr. ${w.queued.position}</b> ${an(w.queued.device)} <b>${esc(label(devById(w.queued.device)))}</b>, dran in ${clock("eta", w.queued.device, ` data-pos="${w.queued.position}"`)} <a data-nav href="?geraet=${w.queued.device}">Ansehen</a> <button type="button" class="linklike" data-action="leave" data-device="${w.queued.device}">Verlassen</button></p>`);
  bar.innerHTML = parts.join("");
  bar.hidden = parts.length === 0;
}

// ---------- Aktionen (Knöpfe mit data-action) ----------
const ACTIONS = {
  join: (id) => store.join(id, me),
  "join-switch": (id) => store.join(id, me, { switchQueue: true }),
  leave: (id) => store.leave(id, me.id),
  start: (id) => store.start(id, me, { sets: chosenSets }),
  "start-keep": (id) => store.start(id, me, { keepQueue: true, sets: chosenSets }),
  set: (id) => store.completeSet(id, me.id),
  finish: (id) => store.finish(id, me.id),
  sim: (id) => store.simulateStep(id)
};
const DONE = {
  join: "Du stehst jetzt in der Warteschlange.", "join-switch": "Gewechselt: Du stehst jetzt hier an.",
  leave: "Du hast die Warteschlange verlassen.", start: "Training gestartet.",
  "start-keep": "Training gestartet. Dein Platz in der Warteschlange bleibt.", finish: "Gerät freigegeben.",
  sim: "Simulation: Sim-Gast ist weiter.", set: "Satz abgehakt. Jetzt Pause."
};
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-dismiss]")) { alertText = ""; render(); }
});
document.addEventListener("change", (e) => {
  if (e.target.matches("select[data-sets]")) chosenSets = Number(e.target.value);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-action]");
  if (!b || !store) return;
  const result = ACTIONS[b.dataset.action](b.dataset.device);
  flash = { ok: result.ok, text: !result.ok ? result.text : result.code === "done" ? "Letzter Satz geschafft. Das Gerät ist frei für den Nächsten." : DONE[b.dataset.action] };
  render();
});

// ---------- Routing (Ansicht steckt in der Adresse, damit QR-Links funktionieren) ----------
function navigate(search) {
  history.pushState(null, "", search || location.pathname);
  render();
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-nav]");
  if (!a) return;
  e.preventDefault();
  navigate(a.getAttribute("href"));
});
window.addEventListener("popstate", () => render());

function render() {
  touch(me);
  renderBar();
  const q = new URLSearchParams(location.search);
  document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-current", String(t.dataset.tab === (q.get("ansicht") === "qr" ? "qr" : "geraete"))));
  if (!data) return;
  if (q.has("geraet")) renderDevice(q.get("geraet"));
  else if (q.get("ansicht") === "qr") renderQr();
  else renderList();
  fillClocksSoon();
}

// ---------- Ansichten ----------
function renderList() {
  const state = store.getState();
  const free = data.devices.filter((d) => state.devices[d.id].status === "free").length;
  $("#view").innerHTML = `
    <h2>Geräte in ${esc(data.meta.studioName)}</h2>
    <p class="meta">${data.devices.length} Geräte, ${free} frei. Tippe ein Gerät an oder scanne den QR-Code am Gerät.</p>
    ${[...new Set(data.devices.map((d) => d.muscleGroup))].map((group) => `
      <h3 class="group">${esc(group)}</h3>
      <ul class="list">${data.devices.filter((d) => d.muscleGroup === group).map((d) => {
        const s = state.devices[d.id], st = statusInfo(s);
        const pos = s.queue.findIndex((p) => p.id === me.id);
        const mine = s.occupiedBy?.id === me.id ? " · <b>du trainierst</b>" : s.reservedFor?.id === me.id ? " · <b>du bist dran</b>" : pos >= 0 ? ` · <b>du: Nr. ${pos + 1}</b>` : "";
        return `<li><a class="row" data-nav href="?geraet=${encodeURIComponent(d.id)}">
          <img src="${esc(d.icon)}" alt="">
          <span class="row-main"><b>${esc(label(d))}</b><span class="meta">${s.status === "occupied" && s.plannedSets ? `Satz ${Math.min(s.completedSets + 1, s.plannedSets)}/${s.plannedSets} · frei in ${clock("free", d.id)}` : esc(d.exercise)} · ${s.queue.length} wartend${mine}</span></span>
          <span class="pill ${st.cls}">${st.icon} ${st.text}</span></a></li>`;
      }).join("")}</ul>`).join("")}`;
  document.title = "Geräteblick – Übersicht";
}

function renderDevice(id) {
  const d = data.devices.find((x) => x.id === id);
  if (!d) {
    $("#view").innerHTML = `
      <div class="error" role="alert"><strong>Gerät nicht gefunden.</strong>
      <p>Der Code „${esc(id)}“ gehört zu keinem Gerät in diesem Studio. Vielleicht ist der QR-Code veraltet oder beschädigt.</p>
      <a class="button" data-nav href="?">Zur Geräteübersicht</a></div>`;
    document.title = "Geräteblick – Gerät nicht gefunden";
    return;
  }
  const s = store.getState().devices[d.id], st = statusInfo(s);
  const twin = data.devices.filter((x) => x.name === d.name && x.id !== d.id);
  $("#view").innerHTML = `
    <a class="back" data-nav href="?">← Alle Geräte</a>
    <article class="device">
      <img src="${esc(d.icon)}" alt="Skizze: ${esc(d.name)}" class="device-img">
      <div>
        <h2>${esc(label(d))}</h2>
        <p class="meta">${esc(d.exercise)} · ${esc(d.muscleGroup)}</p>
        <p class="where">📍 ${esc(d.location)}</p>
        <p class="pill big ${st.cls}">${st.icon} ${st.text}</p>
        <p>${statusLine(s)}</p>
        ${progressHtml(d, s)}
      </div>
    </article>
    ${twin.length ? `<p class="hint">Im Studio gibt es ${twin.length + 1}× ${esc(d.name)}. Du siehst <b>${esc(label(d))}</b>. Wechseln zu: ${twin.map((t) => `<a data-nav href="?geraet=${encodeURIComponent(t.id)}">${esc(label(t))}</a>`).join(", ")}</p>` : ""}
    ${flashHtml()}
    <section class="actions" aria-label="Was möchtest du tun?">${actionsHtml(d, s)}</section>
    ${queueHtml(s, d.id)}
    ${simHtml(d, s)}`;
  document.title = `Geräteblick – ${label(d)}`;
}

function flashHtml() {
  if (!flash) return "";
  const f = flash; flash = null;
  return `<p class="flash ${f.ok ? "ok" : "bad"}" role="status">${esc(f.text)}</p>`;
}

const btn = (action, id, text, primary = false) =>
  `<button type="button" class="${primary ? "button primary" : "button"}" data-action="${action}" data-device="${esc(id)}">${text}</button>`;
const link = (id) => `<a data-nav href="?geraet=${encodeURIComponent(id)}">${esc(label(devById(id)))}</a>`;

// Wichtigste Aktion zuerst (primary), Alternativen darunter.
function actionsHtml(d, s) {
  const st = store.getState(), w = whereIs(st, me.id), rules = data.rules;
  if (s.occupiedBy?.id === me.id)
    return `<p class="clockbig">${clock("phase", d.id)}</p>
      ${btn("set", d.id, `✓ Satz ${s.completedSets + 1} von ${s.plannedSets} geschafft`, true)}
      ${btn("finish", d.id, "Training abbrechen, Gerät freigeben")}
      <p class="meta">Hake jeden Satz direkt ab. So sehen die Wartenden, wie weit du bist.</p>`;
  if (s.reservedFor?.id === me.id)
    return `<p><b>Du bist dran.</b> Das Gerät ist für dich reserviert. Noch ${clock("res", d.id)} Zeit zum Starten, sonst ist der Nächste dran.</p>
      ${setsPicker()}
      ${btn("start", d.id, w.training ? `${an(w.training) === "am" ? "Am" : "An der"} ${esc(label(devById(w.training)))} beenden und hier starten` : "Training starten", true)}
      ${btn("finish", d.id, "Platz freigeben")}`;
  const qi = s.queue.findIndex((p) => p.id === me.id);
  if (qi >= 0)
    return `<p>Du bist <b>Nr. ${qi + 1}</b> in der Warteschlange${qi === 0 ? ", als Nächste/r dran" : `, ${qi} vor dir`}.</p>
      ${btn("leave", d.id, "Warteschlange verlassen")}`;
  if (isCompletelyFree(s)) {
    if (w.training) return `<p>Du trainierst gerade ${an(w.training)} ${link(w.training)}. Beende dort zuerst dein Training.</p>`;
    if (w.queued) return `<p>Das Gerät ist völlig frei. Du stehst ${an(w.queued.device)} ${link(w.queued.device)} an (Nr. ${w.queued.position}, dran in ${clock("eta", w.queued.device, ` data-pos="${w.queued.position}"`)}).</p>
      ${setsPicker()}
      ${btn("start-keep", d.id, `Hier trainieren, Platz ${an(w.queued.device)} ${esc(label(devById(w.queued.device)))} behalten`, true)}
      ${btn("start", d.id, `Wechseln: Platz aufgeben und hier trainieren`)}`;
    return `${setsPicker()}${btn("start", d.id, "Training starten", true)}`;
  }
  const nr = s.queue.length + 1;
  if (w.training && !trainingFarEnough(st.devices[w.training], rules))
    return `<p>Du trainierst gerade ${an(w.training)} ${link(w.training)}. Anstellen für das nächste Gerät geht erst nach mehr als ${rules.nextQueueAfterPercentSets} % deiner Sätze (Sätze folgen in Schritt 3).</p>`;
  if (w.queued)
    return `<p>Du stehst schon ${an(w.queued.device)} ${link(w.queued.device)} an (Nr. ${w.queued.position}). Du kannst nur in einer Warteschlange gleichzeitig stehen.</p>
      ${btn("join-switch", d.id, `Wechseln: hier anstellen (Nr. ${nr})`, true)}`;
  return `<p>Wartezeit für dich: ${clock("eta", d.id, ` data-pos="${nr}"`)}</p>${btn("join", d.id, `Anstellen (du wärst Nr. ${nr})`, true)}`;
}

function setsPicker() {
  const r = data.rules, n = chosenSets || r.defaultSets;
  const opts = Array.from({ length: r.maxSets }, (_, i) => i + 1)
    .map((i) => `<option value="${i}"${i === n ? " selected" : ""}>${i} ${i === 1 ? "Satz" : "Sätze"} (${trainingMs(i, r) / 60_000} Min.)</option>`).join("");
  return `<label class="sets">Wie viele Sätze? <select data-sets>${opts}</select></label>
    <p class="meta">Pro Satz ${r.setMinutes} Min., dazwischen ${r.restMinutes} Min. Pause.</p>`;
}

// Fortschritt am Gerät: Punkte je Satz, Balken und Restzeit (Uhr läuft sekündlich).
function progressHtml(d, s) {
  if (s.status === "occupied" && s.plannedSets) {
    const dots = Array.from({ length: s.plannedSets }, (_, i) => `<span class="dot${i < s.completedSets ? " done" : ""}" aria-hidden="true"></span>`).join("");
    return `<div class="progress" aria-label="${s.completedSets} von ${s.plannedSets} Sätzen erledigt">
      <div class="dots">${dots}</div>
      <div class="bar"><span data-clock="bar" data-device="${esc(d.id)}"></span></div>
      <p class="meta">${clock("phase", d.id)} · frei in ${clock("free", d.id)}</p></div>`;
  }
  if (s.status === "reserved") return `<p class="meta">Reservierung läuft noch ${clock("res", d.id)}.</p>`;
  return "";
}

function queueHtml(s, currentId) {
  if (!s.queue.length) return "";
  return `<h3 class="group">Warteschlange</h3>
    <ol class="queue">${s.queue.map((p, i) => `<li${p.id === me.id ? ' class="me-entry"' : ""}>${p.id === me.id ? "<b>Du</b>" : esc(p.name)} · dran in ${clock("eta", currentId, ` data-pos="${i + 1}"`)}</li>`).join("")}</ol>`;
}

function simHtml(d, s) {
  const sim = (s.status === "occupied" && isSim(s.occupiedBy)) ? `${esc(s.occupiedBy.name)} ist fertig`
    : (s.status === "reserved" && isSim(s.reservedFor)) ? `${esc(s.reservedFor.name)} startet` : "";
  return sim ? `<p class="simctl">Simulation: ${btn("sim", d.id, sim)}</p>` : "";
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
    <p class="hint">Hinweis: In der StackBlitz-Vorschau zeigt der Code auf eine Vorschau-Adresse, die nur in dieser Sitzung gilt. Für echte Aufkleber braucht es eine feste Adresse (Feld <code>publicBaseUrl</code> in devices.json).</p>`;
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
function updateClocks() {
  if (!store) return;
  store.tick(); // ändert sich etwas (Sim-Gast hakt ab, Reservierung läuft ab), wird neu gezeichnet
  updateClocksOnly();
}
function updateClocksOnly() {
  if (!store) return;
  const st = store.getState(), now = Date.now(), r = data.rules;
  document.querySelectorAll("[data-clock]").forEach((el) => {
    const d = st.devices[el.dataset.device];
    if (!d) return;
    const kind = el.dataset.clock;
    if (kind === "free") el.textContent = approx(msUntilFree(d, r, now));
    else if (kind === "eta") el.textContent = approx(etaMs(d, Number(el.dataset.pos), r, now));
    else if (kind === "res") el.textContent = mmss(reservationMsLeft(d, r, now));
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
    if (!Array.isArray(json.devices) || !json.devices.length) throw new Error("Datensatz unvollständig");
    data = json;
    store = createLocalStore(data.devices, data.rules);
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
