// Studio-Website (fiktiv): lädt dieselben Gerätedaten wie die App und zeigt die Auslastung.
// Die Auslastung kommt aus der Simulation im Browser (gleicher localStorage wie die App).
import { createLocalStore } from "./app/js/store-local.js?v=0.8.1";
import { pikto } from "./app/js/pikto.js?v=0.8.1";

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function load() {
  try {
    const r = await fetch("data/devices.json", { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const store = createLocalStore(data);
    renderAreas(data);
    renderLive(data, store.getState());
    store.subscribe((st) => renderLive(data, st));
    setInterval(() => { store.tick(); renderLive(data, store.getState()); }, 5000);
    qr(data);
  } catch (e) {
    console.error(e);
    if ($("#live")) $("#live").innerHTML = `<p class="err">Die Auslastung kann gerade nicht geladen werden (${esc(e.message)}). Die App erreichst du trotzdem über „App öffnen“.</p>`;
  }
}

const groups = (data) => [...new Set(data.devices.map((d) => d.muscleGroup))];

function renderLive(data, st) {
  if (!$("#live")) return;
  const all = data.devices.length, free = data.devices.filter((d) => st.devices[d.id].status === "free").length;
  const waiting = Object.values(st.queues).reduce((a, q) => a + q.length, 0);
  const pct = Math.round((1 - free / all) * 100);
  const word = pct < 40 ? "ruhig" : pct < 75 ? "gut besucht" : "voll";
  $("#live").innerHTML = `
    <div class="live-main"><span class="big">${pct} %</span><span>belegt · gerade <b>${word}</b><br>${free} von ${all} Geräten frei · ${waiting} ${waiting === 1 ? "Person wartet" : "Personen warten"}</span></div>
    <ul class="live-groups">${groups(data).map((g) => {
      const devs = data.devices.filter((d) => d.muscleGroup === g), f = devs.filter((d) => st.devices[d.id].status === "free").length;
      return `<li><span class="lg-name">${esc(g)}</span><span class="lg-bar" role="img" aria-label="${f} von ${devs.length} frei"><i style="width:${(1 - f / devs.length) * 100}%"></i></span><span class="lg-val">${f}/${devs.length} frei</span></li>`;
    }).join("")}</ul>`;
}

function renderAreas(data) {
  if (!$("#areas")) return;
  $("#areas").innerHTML = groups(data).map((g) => {
    const devs = data.devices.filter((d) => d.muscleGroup === g);
    const types = [...new Set(devs.map((d) => d.type))];
    return `<a class="area" href="app/?gruppe=${encodeURIComponent(g)}"><span class="area-pic">${pikto(types[0])}</span>
      <h3>${esc(g)}</h3><p>${types.map((t) => esc(devs.find((d) => d.type === t).name)).join(" · ")}</p><span class="more">${devs.length} ${devs.length === 1 ? "Gerät" : "Geräte"} ›</span></a>`;
  }).join("");
}

function qr(data) {
  if (typeof qrcode !== "function" || !$("#qr")) return;
  const q = qrcode(0, "M"); q.addData(data.meta.publicBaseUrl); q.make();
  $("#qr").innerHTML = `<img alt="QR-Code zur Geräteblick-App" width="120" height="120" src="${q.createDataURL(4, 2)}">`;
}

load();
