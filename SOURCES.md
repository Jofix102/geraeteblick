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

## Produktseite ab v0.11 (17.11.2026)
`index.html` und `web.css` bilden die Produktseite der App Geräteblick. Sie zeigt kein bestimmtes Studio. In der Demo heißt das Studio „Beispielstudio“. Den Aufbau haben wir an der Produktseite des iPhone Duo auf apple.com/de angelehnt (https://www.apple.com/de/iphone-duo/, gelesen am 17.11.2026): Produktname, ein kurzer Claim, das Produkt groß in der Mitte, eine einzige Handlung, Ansichten zum Umschalten und Kennzahlen statt Fließtext. Apple-Dateien, -Bilder und -Schriften verwenden wir nicht. Das „Produkt“ auf der Seite ist die echte App in einem eingebetteten Rahmen.
Fotos werden ab v0.11 nicht mehr verwendet. Die Stockfotos aus v0.9 und v0.10 (Unsplash/Pexels) sind entfernt. Ihre Quellen stehen in der Git-Historie (fotos/quellen.csv).
