# Fitness Tracker

Persönliche Fitness-App fürs iPhone als Web-App (PWA). Kein Server, kein Account, kein App Store.
Alle Daten bleiben lokal auf dem iPhone.

## Funktionen

- **Heute**: zeigt automatisch das nächste Training (Oberkörper A → Unterkörper A → Oberkörper B → Unterkörper B), den Tages-Check und die Gewichtseingabe
- **Standardplan**: Oberkörper/Unterkörper 4× pro Woche, nur Maschine, Kabel und Smith-Maschine, ohne Kniebeuge und Kreuzheben
- **Training**: Checkliste pro Übung mit kg und Wiederholungen. Die Werte vom letzten Mal sind vorausgefüllt. Wer alle Sätze am oberen Ende der Wiederholungsspanne schafft, bekommt den Vorschlag „+2,5 kg“. Nach jedem Satz läuft ein Pausen-Timer.
- **Gewicht**: Tageswerte mit 7-Tage-Schnitt, Kurve, Veränderung seit Start und Tempo in kg pro Woche
- **Verlauf**: Kalender und alle Trainings mit Details
- **Plan**: Übungen, Sätze, Wiederholungen und Tages-Check frei anpassbar, dazu Backup als JSON-Datei

## Auf dem iPhone installieren

1. In **Safari** öffnen: `https://nawdar1226.github.io/fitness-tracker/`
2. Auf **Teilen** (Quadrat mit Pfeil) → **Zum Home-Bildschirm** tippen
3. Die App ab jetzt nur noch über das Icon auf dem Home-Bildschirm starten

## Backup

Die Daten liegen im Speicher dieser Web-App auf dem iPhone. Unter **Plan → Backup sichern** wird eine Datei erzeugt,
die du z. B. in iCloud Drive ablegen kannst. Mit **Backup laden** holst du sie wieder zurück, etwa auf einem neuen iPhone.

## Updates

1. Code ändern
2. In `sw.js` die Versionsnummer bei `CACHE` erhöhen (z. B. `v1.0.1`)
3. Committen und pushen. GitHub Pages ist nach etwa einer Minute aktualisiert.
4. Die App auf dem iPhone schließen und neu öffnen, notfalls zweimal

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Grundgerüst |
| `styles.css` | Design |
| `app.js` | gesamte Logik: Daten, Ansichten, Eingaben |
| `sw.js` | Offline-Modus (Service Worker) |
| `manifest.webmanifest`, `icons/` | App-Name und Icon für den Home-Bildschirm |
