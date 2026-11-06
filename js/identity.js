// Anonyme Identität ohne Konto: jeder Tab bekommt beim ersten Aufruf eine eigene Gast-ID.
// sessionStorage gilt pro Tab und bleibt beim Neuladen erhalten. So können zwei Tabs
// im selben Browser als zwei verschiedene Gäste auftreten (Demo Nutzer A / Nutzer B).
// Nach längerer Inaktivität (Regel idleMinutes, 20 Min.) gibt es eine neue ID.
// Echte App (Ausbaustufe): ID kommt vom Server bzw. aus dem Studiokonto.
const KEY = "geraeteblick.identity";
const DEFAULT_IDLE_MS = 20 * 60_000;

function createId() {
  const number = String(Math.floor(1000 + Math.random() * 9000));
  return { id: `gast-${number}-${Date.now().toString(36)}`, name: `Gast ${number}`, createdAt: Date.now(), lastActive: Date.now() };
}

export function getIdentity(idleMs = DEFAULT_IDLE_MS) {
  let identity = null;
  try { identity = JSON.parse(sessionStorage.getItem(KEY)); } catch { identity = null; }
  if (!identity || !identity.id || isIdle(identity, idleMs)) identity = renewIdentity();
  return identity;
}

export const isIdle = (identity, idleMs) => Date.now() - identity.lastActive >= idleMs;

export function renewIdentity() {
  const identity = createId();
  save(identity);
  return identity;
}

export function touch(identity) {
  identity.lastActive = Date.now();
  save(identity);
}

function save(identity) {
  try { sessionStorage.setItem(KEY, JSON.stringify(identity)); } catch { /* privater Modus: ID gilt nur bis zum Neuladen */ }
}
