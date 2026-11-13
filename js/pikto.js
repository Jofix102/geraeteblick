// Piktogramme v2 (13.11.2026): eigene Zeichnungen, 64×64, runde Linienenden, gleiche Strichstärken.
// Als Inline-SVG, damit Farben aus dem Stylesheet kommen (hell/dunkel, Akzentfarbe).
// .m = Gerät (gedämpft), .p = Polster (gefüllt), .f = Figur, .h = Kopf.
const P = {
  latzug: `<path class="m" d="M10 56V9h40M34 9v6"/><path class="p" d="M18 13h32"/><rect class="pf" x="22" y="43" width="20" height="6" rx="3"/><rect class="pf" x="38" y="34" width="10" height="5" rx="2.5"/>
    <circle class="h" cx="34" cy="25" r="5.5"/><path class="f" d="M34 32l-1 11h10v13M34 33l-9-7-3-11M34 33l9-7 3-11"/>`,
  rudermaschine: `<path class="m" d="M6 55h52M44 36h9"/><rect class="pf" x="15" y="44" width="16" height="6" rx="3"/><rect class="pf" x="50" y="28" width="6" height="20" rx="3"/>
    <circle class="h" cx="22" cy="20" r="5.5"/><path class="f" d="M22 27v17M22 44l13-6 14 7M22 31l11 5h10"/>`,
  brustpresse: `<rect class="pf" x="9" y="13" width="7" height="34" rx="3.5"/><rect class="pf" x="9" y="45" width="26" height="6" rx="3"/><path class="m" d="M22 51v7M50 8v38M41 30h12"/>
    <circle class="h" cx="22" cy="18" r="5.5"/><path class="f" d="M22 25v20h12v13M22 29l11 3h9"/>`,
  butterfly: `<rect class="pf" x="28" y="16" width="8" height="30" rx="4"/><rect class="pf" x="10" y="12" width="6" height="20" rx="3"/><rect class="pf" x="48" y="12" width="6" height="20" rx="3"/><path class="m" d="M22 52h20M32 52v6"/>
    <circle class="h" cx="32" cy="12" r="5.5"/><path class="f" d="M32 19v20M32 24H19v-9M32 24h13v-9M32 39l-6 6v13M32 39l6 6v13"/>`,
  beinpresse: `<path class="m" d="M14 58l44-34"/><path class="p" d="M8 45l12 10M44 12l12 16"/>
    <circle class="h" cx="10" cy="36" r="5.5"/><path class="f" d="M14 42l11 9M25 51l9-13 14-13M17 45l5 9"/>`,
  legextension: `<rect class="pf" x="11" y="12" width="7" height="32" rx="3.5"/><rect class="pf" x="11" y="42" width="24" height="6" rx="3"/><path class="m" d="M31 48v10M35 46l14-6"/><circle class="pf" cx="51" cy="38" r="4.5"/>
    <circle class="h" cx="22" cy="17" r="5.5"/><path class="f" d="M22 24v18h12l12-6M22 28l5 12"/>`,
  preacher: `<rect class="pf" x="6" y="45" width="18" height="6" rx="3"/><path class="m" d="M15 51v7M38 50v8M33 24h10"/><path class="p" d="M26 36l12 11"/>
    <circle class="h" cx="19" cy="19" r="5.5"/><path class="f" d="M19 26l-1 19h10v13M20 30l14 10 4-15"/>`,
  kabelturm: `<rect class="pm" x="46" y="6" width="12" height="52" rx="4"/><circle class="m" cx="46" cy="22" r="3"/><path class="m" d="M44 23l-8 7"/>
    <circle class="h" cx="22" cy="12" r="5.5"/><path class="f" d="M22 19v19M22 38l-6 20M22 38l6 20M22 25l8 5h6"/>`
};
export const pikto = (type, cls = "") =>
  `<svg class="pk ${cls}" viewBox="0 0 64 64" aria-hidden="true">${P[type] || ""}</svg>`;
export const hasPikto = (type) => type in P;
