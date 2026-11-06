# Geräteblick

Prototyp einer digitalen Warteschlange für Trainingsgeräte im Fitnessstudio. Entstanden im Rahmen der Seminararbeit im Modul Web Technologie (FOM, WS 2026).

**Simulation:** Alle Daten sind fiktiv. Die Warteschlange liegt im Browser und gleicht sich zwischen Tabs desselben Browsers ab. Verschiedene Geräte (Handys) sehen sich im Prototyp nicht. Der Ausbau zu einer echten App ist in [ARCHITEKTUR.md](ARCHITEKTUR.md) beschrieben.

| Aufruf | Wirkung |
|---|---|
| `/` | Geräteübersicht |
| `/?geraet=latzug-links` | öffnet direkt ein Gerät (QR-Einstieg) |
| `/?ansicht=qr` | QR-Codes zum Ausdrucken |
| `/?fehler=1` | zeigt den Fehlerfall (Gerätedaten nicht ladbar) |

Technik: HTML, CSS, JavaScript (ES-Module), Daten in `data/devices.json` per `fetch`. Kein Build-Schritt. Lokal starten: `node server.js` oder jeder statische Webserver.

Datenherkunft und Fremdcode: [SOURCES.md](SOURCES.md).
