# Architektur (v0.4)

| Datei | Aufgabe | Ausbau zur echten App |
|---|---|---|
| `index.html`, `web.css` | Produktseite der App (dunkel, eingebettete App zum Antippen), Link und QR-Code zur Demo | bleibt |
| `app/index.html`, `app/styles.css` | Oberfläche der App (Handy: Tab-Leiste, Rechner: Seitenleiste) | bleibt |
| `app/js/app.js` | Ansichten, Navigation über die Adresse (`?geraet=…`, `?ansicht=qr`), Regeln | bleibt; spricht nur mit der Store-Schnittstelle |
| `app/js/identity.js` | anonyme Gast-ID pro Tab (sessionStorage) | ID vom Server oder Studiokonto |
| `app/js/queue-logic.js` | Regeln als reine Funktionen: eine Warteschlange je Gerätetyp, Sätze und Zeitmodell, Wartezeit-Schätzung, Reservierung (1 bzw. 2 Min.), Anwesenheit, 50-%-Regel, Bots | läuft unverändert auf dem Server und prüft dort jede Aktion |
| `app/js/store-local.js` | Warteschlange im Browser, Abgleich zwischen Tabs (BroadcastChannel) | ersetzt durch `store-server.js` (WebSocket/HTTP), gleiche Schnittstelle |
| `data/devices.json` | Geräte, Gerätetypen, Grundriss-Koordinaten, Regeln, Start-Warteschlangen (per `fetch`) | kommt vom Server, gleiche Struktur |

Simulation: Verschiedene Geräte (Handys) sehen sich im Prototyp nicht. Das ist bewusst so und in der Oberfläche gekennzeichnet.
