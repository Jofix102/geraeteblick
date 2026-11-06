import { getIdentity, touch } from "./identity.js";
import { createLocalStore } from "./store-local.js";

const params = new URLSearchParams(location.search);
const DATA_URL = params.has("fehler") ? "data/nicht-vorhanden.json" : "data/devices.json";
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let data = null, store = null;
const me = getIdentity();

const label = (d) => d.position ? `${d.name} ${d.position}` : d.name;

function statusInfo(s) {
  if (s.status === "free") return { cls: "free", text: "Frei", icon: "✓" };
  if (s.status === "reserved") return { cls: "ready", text: "Reserviert", icon: "⏱" };
  return { cls: "busy", text: "Belegt", icon: "●" };
}

function statusLine(s) {
  if (s.status === "free") return "Niemand trainiert hier, keine Warteschlange.";
  const sets = s.plannedSets ? `Satz ${s.completedSets} von ${s.plannedSets} erledigt` : "trainiert";
  const q = s.queue.length === 0 ? "niemand wartet" : s.queue.length === 1 ? "1 Person wartet" : `${s.queue.length} Personen warten`;
  return `${esc(s.occupiedBy)}: ${sets}, ${q}.`;
}

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
  const q = new URLSearchParams(location.search);
  document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-current", String(t.dataset.tab === (q.get("ansicht") === "qr" ? "qr" : "geraete"))));
  if (!data) return;
  if (q.has("geraet")) return renderDevice(q.get("geraet"));
  if (q.get("ansicht") === "qr") return renderQr();
  renderList();
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
        return `<li><a class="row" data-nav href="?geraet=${encodeURIComponent(d.id)}">
          <img src="${esc(d.icon)}" alt="">
          <span class="row-main"><b>${esc(label(d))}</b><span class="meta">${esc(d.exercise)} · ${s.queue.length} wartend</span></span>
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
      </div>
    </article>
    ${twin.length ? `<p class="hint">Im Studio gibt es ${twin.length + 1}× ${esc(d.name)}. Du siehst <b>${esc(label(d))}</b>. Wechseln zu: ${twin.map((t) => `<a data-nav href="?geraet=${encodeURIComponent(t.id)}">${esc(label(t))}</a>`).join(", ")}</p>` : ""}
    <p class="todo">Beitreten und Verlassen der Warteschlange folgen in Schritt 2.</p>`;
  document.title = `Geräteblick – ${label(d)}`;
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
    store = createLocalStore(data.devices);
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
