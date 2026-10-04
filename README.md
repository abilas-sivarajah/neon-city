# Neon City

Eine Third-Person-Crime-Sandbox im Browser, inspiriert von GTA: San Andreas und GTA V. Läuft komplett im Browser, mit einer eigenen kleinen WebGL-Engine, ohne Bibliotheken und ohne Build-Schritt.

## Features

- **Offene 3D-Stadt** mit fünf Vierteln: Downtown, Altstadt, Palmenhain, Villenhügel und Hafenviertel. Cyberpunk-Look mit Neonschildern an jedem Laden, Leuchtreklamen, Hängeschildern, Dach-Billboards, Hologrammen und flackernden Röhren. Mit Tag-Nacht-Wechsel (Start am Abend), bunt beleuchteten Fenstern und LED-Straßenlaternen.
- **Autos klauen und fahren:** sechs Fahrzeugtypen, Verkehr mit KI, Driften mit der Handbremse, Schaden, Brände und Explosionen.
- **Läden:** Waffenladen (Pistole, Uzi, Schrotflinte, Sturmgewehr, Schutzweste), Späti, Kleiderladen und Klinik.
- **NPCs:** Passanten zum Ansprechen und Ausrauben, die bei Gefahr flüchten.
- **Polizei:** Fahndungssystem mit bis zu 5 Sternen, Streifenwagen mit Sirene, Festnahme („BUSTED“). Die Lackiererei löscht die Fahndung.
- **Aufträge** von Tony am Hafen: Autoexport, Kurierfahrt unter Zeitdruck und ein Auftragsmord.
- **Export-Garage:** kauft geklaute Autos.
- **GTA-artige Anzeige:** Radar, Geld, Gesundheit und Schutzweste, Fahndungssterne, Waffenrad, Bezirksnamen.
- **Steuerung wie in GTA V:** Zielen mit Zoom über die Schulter, Magazine und Nachladen, Drive-by.
- **Controller-Unterstützung** (Xbox- und PlayStation-Controller) mit Zielhilfe und Vibration.
- **Synthetischer Sound** über die Web Audio API.

## Spielen

Lokal: `index.html` im Browser öffnen (Doppelklick genügt). Für die Schriftarten wird eine Internetverbindung gebraucht.

Online über GitHub Pages: Repository → **Settings** → **Pages** → Source: *Deploy from a branch* → Branch `main`, Ordner `/ (root)` → Speichern. Nach ein bis zwei Minuten läuft das Spiel unter `https://<benutzername>.github.io/<repo-name>/`.

Einen Controller erkennt der Browser erst, wenn du einmal eine Taste drückst.

## Steuerung

| Aktion | Tastatur & Maus | Controller |
|---|---|---|
| Laufen | WASD | Linker Stick |
| Sprinten / Springen | Shift / Leertaste | A halten / X |
| Umsehen | Maus | Rechter Stick |
| Zielen / Schießen | Rechte / Linke Maustaste | LT (mit Zielhilfe) / RT |
| Nachladen | R | B |
| Waffenrad | Tab halten | LB halten |
| Waffe wechseln | Mausrad, 1–5, Q | Steuerkreuz ← |
| Einsteigen / Auto klauen / Aussteigen | F | Y |
| Läden, Leute, Aufträge | E | Steuerkreuz → |
| Auto: Gas / Bremse | W / S | RT / LT |
| Auto: Handbremse | Leertaste | RB |
| Auto: Hupe bzw. Sirene | E | L3 |
| Drive-by | Rechte + linke Maustaste | LB + RB |
| Zurückschauen | C | R3 |
| Kamera nah / mittel / weit | V | Back |
| Pause | P (Esc gibt die Maus frei und pausiert) | Start |
| Ton an/aus | M | – |

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche (HUD, Menüs, Startbildschirm) und Verbindung zum Spiel |
| `game.js` | Das Spiel: WebGL-Renderer, Stadtgenerator, Fahrzeugphysik, Verkehrs- und Polizei-KI, Waffen, Aufträge, Steuerung, Sound |

`game.js` stellt eine Funktion `buildGame(canvas, radarCanvas, rootElement, ui)` bereit. Das Spiel meldet Änderungen für die Oberfläche über `ui(patch)`, und `index.html` zeichnet sie.
