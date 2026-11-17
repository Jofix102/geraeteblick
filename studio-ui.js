// Studio BGM – Bedienelemente der Website-Entwürfe (Diashow, Galerie, Fotoauswahl, Tarif-Zusammenfassung).
// Kein Framework, keine Daten werden gespeichert oder verschickt.
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Diashow (Entwurf A): wechselt alle 6 s, anhaltbar, bei „Bewegung reduzieren“ nur per Hand.
  var slides = $$(".slide"), dots = $$("[data-slide]"), pp = $("[data-pause]"), cur = 0, timer = null;
  function show(i) {
    cur = (i + slides.length) % slides.length;
    slides.forEach(function (s, k) { s.classList.toggle("on", k === cur); s.setAttribute("aria-hidden", String(k !== cur)); });
    dots.forEach(function (d, k) { d.setAttribute("aria-current", String(k === cur)); });
  }
  function play() { stop(); timer = setInterval(function () { show(cur + 1); }, 6000); if (pp) { pp.textContent = "❚❚"; pp.setAttribute("aria-label", "Diashow anhalten"); } }
  function stop() { clearInterval(timer); timer = null; if (pp) { pp.textContent = "▶"; pp.setAttribute("aria-label", "Diashow abspielen"); } }
  if (slides.length) {
    dots.forEach(function (d) { d.addEventListener("click", function () { show(+d.dataset.slide); stop(); }); });
    if (pp) pp.addEventListener("click", function () { timer ? stop() : play(); });
    still ? stop() : play();
  }

  // Galerie (Entwurf B): Pfeile scrollen um eine Karte.
  var gal = $(".gallery");
  $$("[data-gal]").forEach(function (b) {
    b.addEventListener("click", function () {
      var card = $(".card", gal); var step = card ? card.getBoundingClientRect().width + 20 : 400;
      gal.scrollBy({ left: step * +b.dataset.gal, behavior: still ? "auto" : "smooth" });
    });
  });

  // Fotoauswahl (Entwurf C)
  var main = $("#buy-main");
  $$("[data-thumb]").forEach(function (b) {
    b.addEventListener("click", function () {
      var src = $("img", b).getAttribute("src");
      $("img", main).setAttribute("src", src);
      $("img", main).setAttribute("alt", b.getAttribute("aria-label"));
      $$("[data-thumb]").forEach(function (o) { o.setAttribute("aria-current", String(o === b)); });
    });
  });

  // Tarif-Zusammenfassung (Entwurf C)
  function sum() {
    var t = $("input[name=tarif]:checked"); if (!t) return;
    var price = (+t.value).toFixed(2).replace(".", ",") + " €" + (t.dataset.name === "Tageskarte" ? "" : "/Monat");
    $("#sum-name").textContent = t.dataset.name;
    $("#sum-total").textContent = price;
    var z = $("input[name=zeit]:checked");
    if (z && $("#zeit-hint")) $("#zeit-hint").textContent = "Tipp: In der App siehst du vor dem Losgehen, wie voll es " + z.value + " gerade ist.";
  }
  $$("input[name=tarif],input[name=zeit]").forEach(function (i) { i.addEventListener("change", sum); });
  sum();
})();
