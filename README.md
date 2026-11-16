# Geräteblick

Prototyp einer digitalen Warteschlange für Trainingsgeräte im Fitnessstudio. Entstanden im Rahmen der Seminararbeit im Modul Web Technologie (FOM).

**Simulation:** Alle Daten sind fiktiv. Die Warteschlange liegt im Browser und gleicht sich zwischen Tabs desselben Browsers ab. Verschiedene Geräte (Handys) sehen sich im Prototyp nicht. Der Ausbau zu einer echten App ist in [ARCHITEKTUR.md](ARCHITEKTUR.md) beschrieben.

| Aufruf | Wirkung |
|---|---|
| `/` | Website des fiktiven „Studio Indigo“ mit Live-Auslastung und Link zur App |
| `/app/` | App Geräteblick (Tabs Jetzt, Geräte, Karte; am Rechner ab 1000 px Seitenleiste und zwei Spalten) |
| `/app/?geraet=latzug-links` | öffnet direkt ein Gerät (QR-Einstieg) |
| `/app/?ansicht=qr` | QR-Codes zum Ausdrucken |
| `/app/?fehler=1` | zeigt den Fehlerfall (Gerätedaten nicht ladbar) |

Alte Links ohne `app/` (z. B. `/?geraet=…`, `/?fehler=1`) werden seit v0.8 automatisch zur App weitergeleitet.

Technik: HTML, CSS, JavaScript (ES-Module), Daten in `data/devices.json` per `fetch`. Kein Build-Schritt. Lokal starten: `node server.js` oder jeder statische Webserver.

Datenherkunft und Fremdcode: [SOURCES.md](SOURCES.md).
