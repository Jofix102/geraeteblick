# Datenherkunft und Fremdcode

- `data/devices.json`: eigens erstellte, fiktive Beispieldaten (Geräte, Standorte, Status, simulierte Gäste „Sim-Gast …“, fiktiver Grundriss mit Gerätekoordinaten). Die Simulation erzeugt laufend weitere Sim-Gäste (10–15 gleichzeitig). Keine Daten aus einem realen Studio oder aus Systemen eines Arbeitgebers.
- `assets/pikto/*.svg`: für diesen Prototyp selbst erstellte Piktogramme der Übungen (Person gelb, Gerät grau), mit KI-Unterstützung aus einfachen SVG-Linien gezeichnet.
- `js/vendor/qrcode.js`: QR-Code-Generator von Kazuhiko Arase, Version 1.4.4, MIT-Lizenz (npm-Paket „qrcode-generator“, Lizenzhinweis im Dateikopf). Unverändert übernommen.
- `server.js`: kleiner Webserver nur für StackBlitz und lokales Testen, kein Teil der Anwendung. Auf GitHub Pages wird er nicht gebraucht.
- `assets/dran.wav`: Signalton „Du bist dran“, für diesen Prototyp per Skript aus zwei Sinustönen erzeugt (keine fremde Aufnahme).
