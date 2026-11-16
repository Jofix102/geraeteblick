# Datenherkunft und Fremdcode

- `data/devices.json`: eigens erstellte, fiktive Beispieldaten (Geräte, Standorte, Status, simulierte Gäste „Sim-Gast …“, fiktiver Grundriss mit Gerätekoordinaten). Die Simulation erzeugt laufend weitere Sim-Gäste (10–15 gleichzeitig). Keine Daten aus einem realen Studio oder aus Systemen eines Arbeitgebers.
- `app/assets/pikto/*.svg`: für diesen Prototyp selbst erstellte Piktogramme der Übungen (Person als Silhouette in Indigo, Gerät grau), mit KI-Unterstützung aus einfachen SVG-Linien gezeichnet.
- `app/js/vendor/qrcode.js`: QR-Code-Generator von Kazuhiko Arase, Version 1.4.4, MIT-Lizenz (npm-Paket „qrcode-generator“, Lizenzhinweis im Dateikopf). Unverändert übernommen.
- `server.js`: kleiner Webserver nur für StackBlitz und lokales Testen, kein Teil der Anwendung. Auf GitHub Pages wird er nicht gebraucht.
- `app/assets/dran.wav`: Signalton „Du bist dran“, für diesen Prototyp per Skript aus zwei Sinustönen erzeugt (keine fremde Aufnahme).

## Trainingspläne (`plans` in data/devices.json)
Drei feste Beispielpläne (Oberkörper-, Unterkörper-, Ganzkörper-Tag), am 06.11.2026 nach Vorgabe des Verfassers der Seminararbeit aus den simulierten Geräten zusammengestellt. Keine Trainingsempfehlung, keine externe Quelle.

## Gestaltung ab v0.7 (13.11.2026)
Aufbau und Stil angelehnt an die Apple Human Interface Guidelines (https://developer.apple.com/design/human-interface-guidelines/, Seiten Tab bars, Layout, Typography, Color, Images, Lists and tables; gelesen am 13.11.2026). Es werden keine Apple-Dateien, Schriften oder Symbole verwendet; die Schrift ist die Systemschrift des Geräts. Piktogramme: eigene Zeichnungen (app/js/pikto.js, Kopien als Dateien in app/assets/pikto/), ab v0.7.1 runder gezeichnet, Akzentfarbe Indigo (#5856D6, Apple-Systemfarbe als Farbwert, keine Apple-Datei).

## Studio-Website ab v0.8 (16.11.2026)
`index.html`, `site.css`, `site.js`: Startseite des fiktiven „Studio Indigo“. Name, Adresse (Beispielweg 1, 12345 Musterstadt), E-Mail-Adresse unter der reservierten Domain `.example`, Öffnungszeiten und Preise sind ausgedacht und als Beispiel gekennzeichnet. Die Live-Auslastung auf der Website liest denselben simulierten Zustand wie die App (data/devices.json plus Simulation im Browser). Keine Fotos, keine fremden Bilder oder Schriften.
