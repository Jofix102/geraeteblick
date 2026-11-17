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

## Produktseite ab v0.10 (17.11.2026)
`index.html` und `web.css`: Produktseite der App Geräteblick, ohne bestimmtes Studio. In der Demo heißt das Studio „Beispielstudio“. Die Seite hat einen QR-Code zur App, der aus `data/devices.json` (meta.publicBaseUrl) erzeugt wird. Von v0.8 bis v0.9 gab es stattdessen eine Website eines fiktiven Studios, die am 17.11.2026 auf Wunsch des Verfassers gestrichen wurde.

## Fotos der Produktseite
Vier Stockfotos von Unsplash und Pexels, ausgewählt am 16.11.2026. Fotoseite, Fotograf und Lizenz stehen in `fotos/quellen.csv` und im Fußbereich der Seite. Die Bilder sind verkleinert (1600 px und 800 px) und liegen im Ordner `fotos/`. Sie werden also nicht von fremden Servern geladen.
- Unsplash-Lizenz (https://unsplash.com/license): kostenlose Nutzung, auch kommerziell, Bearbeitung erlaubt. Eine Namensnennung ist nicht nötig, wird aber gern gesehen.
- Pexels-Lizenz (https://www.pexels.com/license/): kostenlose Nutzung, Bearbeitung erlaubt, Namensnennung nicht nötig. Abgebildete Personen oder Marken dürfen nicht als Empfehlung erscheinen.
- Auswahlregel: keine deutlich lesbaren Marken- oder Studionamen und keine klar erkennbaren Gesichter. Die Bilder 02 und 03 wirken wie 3D-Renderings. Auf den Fotoseiten ist das nicht angegeben, es ist nur ein Eindruck.
