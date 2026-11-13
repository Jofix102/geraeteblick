// Piktogramme v3 (13.11.2026, Körper-Silhouetten): eigene Zeichnungen, 64×64, runde Linienenden, gleiche Strichstärken.
// Als Inline-SVG, damit Farben aus dem Stylesheet kommen (hell/dunkel, Akzentfarbe).
// .m = Gerät (gedämpft), .p/.pf = Polster, .f = Figur mit .t Rumpf / .l Beine / .a Arme (unterschiedlich dick = Körperform), .h = Kopf.
const P = {
  latzug: `<path class="p" d="M16 13h36"/><path class="m" d="M10 58V8h42M34 8v5"/><rect class="pf" x="22" y="49" width="22" height="6" rx="3"/><rect class="pf" x="40" y="31" width="11" height="5" rx="2.5"/>
    <path class="f a" d="M30 32l-6-7-3-10M38 32l6-7 3-10"/><path class="f l" d="M33 44h11v12"/><path class="f t" d="M34 33l-1 9"/><circle class="h" cx="34" cy="21" r="6"/>`,
  rudermaschine: `<path class="m" d="M6 58h52M43 36h10"/><rect class="pf" x="14" y="48" width="18" height="6" rx="3"/><rect class="pf" x="50" y="30" width="6" height="20" rx="3"/>
    <path class="f l" d="M23 45l12-5 14 5"/><path class="f t" d="M22 30v11"/><path class="f a" d="M24 31l9 5h10"/><circle class="h" cx="21" cy="18" r="6"/>`,
  brustpresse: `<rect class="pf" x="8" y="12" width="7" height="36" rx="3.5"/><rect class="pf" x="8" y="48" width="28" height="6" rx="3"/><path class="m" d="M22 54v4M50 8v38M41 31h12"/>
    <path class="f l" d="M23 44h12v14"/><path class="f t" d="M23 27v13"/><path class="f a" d="M25 28l8 3h9"/><circle class="h" cx="23" cy="15" r="6"/>`,
  butterfly: `<rect class="pf" x="28" y="20" width="8" height="28" rx="4"/><rect class="pf" x="10" y="8" width="5" height="20" rx="2.5"/><rect class="pf" x="49" y="8" width="5" height="20" rx="2.5"/><rect class="pf" x="20" y="45" width="24" height="5" rx="2.5"/>
    <path class="f l" d="M29 40l-3 7v11M35 40l3 7v11"/><path class="f t" d="M32 22v12"/><path class="f a" d="M25 23h-7V12M39 23h7V12M25 23h14"/><circle class="h" cx="32" cy="10" r="6"/>`,
  beinpresse: `<path class="m" d="M14 60l44-34"/><path class="p" d="M6 46l12 11M44 10l12 17"/>
    <path class="f l" d="M24 52l9-14 13-14"/><path class="f a" d="M18 47l3 9"/><path class="f t" d="M14 43l8 7"/><circle class="h" cx="9" cy="35" r="6"/>`,
  legextension: `<rect class="pf" x="9" y="12" width="7" height="32" rx="3.5"/><rect class="pf" x="9" y="44" width="26" height="6" rx="3"/><path class="m" d="M30 50v8M36 46l14-8"/><circle class="pf" cx="50" cy="37" r="4.5"/>
    <path class="f l" d="M23 41h11l13-6"/><path class="f t" d="M22 26v12"/><path class="f a" d="M23 28l4 12"/><circle class="h" cx="22" cy="14" r="6"/>`,
  preacher: `<rect class="pf" x="5" y="47" width="18" height="6" rx="3"/><path class="m" d="M14 53v5M39 52v6M32 23h10"/><path class="p" d="M27 38l12 11"/>
    <path class="f l" d="M18 44h10v14"/><path class="f t" d="M19 28l-1 12"/><path class="f a" d="M21 29l12 11 4-15"/><circle class="h" cx="19" cy="16" r="6"/>`,
  kabelturm: `<rect class="pm" x="46" y="6" width="12" height="52" rx="4"/><circle class="m" cx="46" cy="22" r="3"/><path class="m" d="M44 23l-7 6"/>
    <path class="f l" d="M21 38l-5 20M23 38l5 20"/><path class="f t" d="M22 22v12"/><path class="f a" d="M24 23l7 6h6"/><circle class="h" cx="22" cy="10" r="6"/>`
};
export const pikto = (type, cls = "") =>
  `<svg class="pk ${cls}" viewBox="0 0 64 64" aria-hidden="true">${P[type] || ""}</svg>`;
export const hasPikto = (type) => type in P;
