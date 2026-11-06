# Architektur (v0.3)

| Datei | Aufgabe | Ausbau zur echten App |
|---|---|---|
| `index.html`, `styles.css` | Oberfläche | bleibt |
| `js/app.js` | Ansichten, Navigation über die Adresse (`?geraet=…`, `?ansicht=qr`), Regeln | bleibt; spricht nur mit der Store-Schnittstelle |
| `js/identity.js` | anonyme Gast-ID pro Tab (sessionStorage) | ID vom Server oder Studiokonto |
| `js/store-local.js` | Warteschlange im Browser, Abgleich zwischen Tabs (BroadcastChannel) | ersetzt durch `store-server.js` (WebSocket/HTTP), gleiche Schnittstelle |
| `data/devices.json` | Geräte, Standorte, Regeln (per `fetch`) | kommt vom Server, gleiche Struktur |

Simulation: Verschiedene Geräte (Handys) sehen sich im Prototyp nicht. Das ist bewusst so und in der Oberfläche gekennzeichnet.
