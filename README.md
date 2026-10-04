# Neon City

Eine Third-Person-Crime-Sandbox im Browser, inspiriert von GTA: San Andreas und GTA V. Läuft komplett im Browser, mit einer eigenen kleinen WebGL-Engine, ohne Bibliotheken und ohne Build-Schritt.

## Features

- **Offene Insel mit Kleinstadt:** fünf Stadtviertel (Downtown, Altstadt, Palmenhain, Villenhügel, Hafenviertel), drumherum eine Ringstraße, Berge mit Nadelwald, See, Sendemast und Neon-Schriftzug im Norden, ein Flughafen im Westen, Arena, Jachthafen mit Riesenrad und Strand im Osten, Hafen mit Frachter im Süden und eine Leuchtturm-Insel mit Brücke. Cyberpunk-Look mit Neonschildern an jedem Laden, Leuchtreklamen, Hängeschildern, Dach-Billboards, Hologrammen und flackernden Röhren. Mit Tag-Nacht-Wechsel (Start am Abend), bunt beleuchteten Fenstern und LED-Straßenlaternen.
- **Autos klauen und fahren:** sechs Fahrzeugtypen, Verkehr mit KI, Driften mit der Handbremse, Nitro-Schub (lädt sich mit der Zeit auf; leer gefahren erst wieder nutzbar, wenn es voll ist), Schaden, Brände und Explosionen. Über der Stadt kreisen fliegende Autos.
- **Lebendige Straßen:** Häuserzeilen mit leuchtenden Läden, Markisen und Balkonen, Hochhäuser mit Ladensockel, Plätze mit Brunnen und Imbissständen, Bushaltestellen, Bänke, Stadtbäume und dampfende Gullydeckel. Passanten joggen, tragen Einkaufstüten, telefonieren, sitzen auf Bänken, warten an Haltestellen, stehen in Gruppen zusammen oder kaufen am Imbiss.
- **Läden:** Waffenladen (Pistole, Uzi, Schrotflinte, Sturmgewehr, Schutzweste), Späti, Kleiderladen und Klinik.
- **NPCs:** Passanten zum Ansprechen und Ausrauben, die bei Gefahr flüchten.
- **Polizei:** Fahndungssystem mit bis zu 5 Sternen, Streifenwagen mit Sirene, Festnahme („BUSTED“). Die Lackiererei löscht die Fahndung.
- **Aufträge:** Nova am Späti vermittelt fünf Kurierjobs unter Zeitdruck (Eilpost, zerbrechliche Fracht, drei Stopps, Luftfracht zur Leuchtturm-Insel, heiße Ware mit Polizei im Nacken). Tony am Hafen führt einen Bandenkrieg gegen die Chrome Vipers: vier zusammenhängende Aufträge mit mehreren Schritten (Revier räumen, Garage gegen Angriffswellen halten, Fluchtwagen stoppen, Waffenlieferung kapern, Boss Rico ausschalten und die Polizei abhängen). Dazu Spezialjobs (Autoexport, Auftragsmord). Nach jeder geschlagenen Runde steigt die Bezahlung.
- **Flugzeug:** Am Flughafen steht ein fliegbarer Neon Jet. Schub geben, ab rund 110 km/h die Nase hochziehen, Kurven über die Querlage. Landen geht nur sanft auf flachem Boden, sonst gibt es einen Absturz. Ein zerstörter Jet wird am Flughafen ersetzt.
- **Eigener Wagen:** Du startest mit einer eigenen Limousine, die du jederzeit mit L zu dir rufen kannst. Auf dem Radar zeigt ein Auto-Symbol, wo sie steht. In der Lackiererei kannst du ein frisch lackiertes Auto zum neuen Hauptwagen machen.
- **Export-Garage:** kauft geklaute Autos.
- **GTA-artige Anzeige:** Radar, Geld, Gesundheit und Schutzweste, Fahndungssterne, Waffenrad, Bezirksnamen.
- **Pausenmenü mit Karte:** Esc öffnet eine zoombare Inselkarte mit Läden, Aufträgen und deinem Wagen. Per Klick setzt du bis zu acht Markierungen; sie erscheinen auf dem Radar und als Lichtsäule in der Welt und verschwinden, wenn du sie erreichst.
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
| Auto: Nitro (halten) | Shift | A |
| Flugzeug: Schub mehr / weniger | W / S | RT / LT |
| Flugzeug: Kurve (Querlage) | A / D | Linker Stick ← → |
| Flugzeug: Nase hoch / runter | Pfeil ↓ / ↑ | Linker Stick ziehen / drücken |
| Auto: Hupe bzw. Sirene | E | L3 |
| Drive-by | Rechte + linke Maustaste | LB + RB |
| Eigenen Wagen rufen | L | Steuerkreuz ↓ |
| Zurückschauen | C | R3 |
| Kamera nah / mittel / weit | V | Back |
| Pause mit Karte | Esc oder P | Start |
| Karte: zoomen | Mausrad, + / − | LB / RB |
| Karte: verschieben | Ziehen, Pfeiltasten | Linker Stick |
| Karte: Markierung setzen / entfernen | Klick (Rechtsklick entfernt) | A (in der Mitte) |
| Ton an/aus | M | – |

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche (HUD, Menüs, Startbildschirm) und Verbindung zum Spiel |
| `game.js` | Das Spiel: WebGL-Renderer, Stadtgenerator, Fahrzeugphysik, Verkehrs- und Polizei-KI, Waffen, Aufträge, Steuerung, Sound |

`game.js` stellt eine Funktion `buildGame(canvas, radarCanvas, rootElement, ui)` bereit. Das Spiel meldet Änderungen für die Oberfläche über `ui(patch)`, und `index.html` zeichnet sie.
