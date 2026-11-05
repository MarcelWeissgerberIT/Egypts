# Purpursonne Pyramide

Isometrisches Pyramiden-Puzzle für das iPhone (Safari / Home-Bildschirm).

**Spielen:** https://marcelweissgerberit.github.io/Egypts/
(auf dem iPhone in Safari öffnen, dann „Teilen → Zum Home-Bildschirm“ für Vollbild) Alle Grafiken, Icons,
Ziffern, 3D-Figuren, Musik und Fanfare wurden mit **Higgsfield** erzeugt, die 3D-Modelle,
Rigs und Animationen mit **Meshy** (über Higgsfield). Im Spiel gibt es keine Schrift: jede
Beschriftung, jede Zahl und jeder Knopf ist ein Bild.

## Spielprinzip – Pyramidenwerk

Du baust eine Produktionswirtschaft auf, die die Pyramide Block für Block wachsen lässt.

* **Bauplätze antippen** öffnet das Baumenü (nur passende Gebäude für Sand, Fels oder Nilufer).
  Jede Karte zeigt Kosten in Deben, benötigte Arbeiter und die Produktionskette als Symbole.
* **Gebäude antippen** zeigt Stufe, Produktion und den Ausbau (schneller, braucht +1 Arbeiter).
* **Wischen** verschiebt die Kamera, **zwei Finger** zoomen, der Knopf unten rechts schaltet
  die Geschwindigkeit (x1, x2, x3).

Produktionsketten:

| Gebäude | Bauplatz | Verbraucht | Erzeugt |
|---|---|---|---|
| Arbeiterhaus | Sand | Brot | Arbeiter |
| Getreidefeld | Nilufer | – | Getreide |
| Bäckerei | Sand | Getreide | Brot |
| Steinbruch | Fels | (Werkzeug ab Level 3) | Rohstein |
| Steinmetz | Sand | Rohstein | Quader |
| Kupfermine | Fels | – | Erz |
| Schmiede | Sand | Erz | Werkzeug |

* Quader ziehen Arbeiter auf Schlitten zur Pyramide. Jeder verbaute Quader bringt Deben,
  jede fertige Stufe einen Bonus. Ganz oben setzt du die goldene Spitze.
* Ohne Brot streiken die Arbeiter (die Produktion halbiert sich etwa), ohne Werkzeug arbeitet
  der Steinbruch viel langsamer.
* Die **Nilflut** setzt die Felder regelmäßig unter Wasser, danach wächst das Getreide schneller.
  In Level 5 bremsen zusätzlich **Sandstürme**.
* Die Sonnenleiste ist die Regierungszeit des Pharaos. Horusaugen: 3 bei Fertigstellung in
  höchstens 75 % der Zeit, 2 bei höchstens 90 %.
* Die Fristen sind mit `tools/balance_sim.mjs` (ein Bot, der nach Regeln baut) eingestellt.

## Entwickeln

```bash
npm install
npm run build              # bündelt src/ nach dist/
node tools/serve.cjs dist  # http://localhost:8080
```

| Ordner | Inhalt |
|---|---|
| `src/` | Spielcode (Three.js): `world.js` 3D-Diorama, `main.js` Spielablauf/Steuerung, `ui.js` bildbasierte Oberfläche, `economy.js` Produktionswirtschaft, `levels.js`/`plots.js` Level und Bauplätze, `audio.js` Musik und erzeugte Klänge |
| `public/assets/` | aufbereitete Assets (WebP/JPG, meshopt-komprimierte GLBs, MP3) |
| `tools/` | Bild-/Modell-Aufbereitung, Build, lokaler Server, Balancing-Simulation |
| `art/jobs.json` | Higgsfield/Meshy-Job-IDs der Rohdateien |

Jeder Push auf `claude/purpursonne-pyramide` (oder `main`) baut das Spiel per GitHub Actions
(`.github/workflows/pages.yml`) und veröffentlicht es auf GitHub Pages
(Settings → Pages → Source: „GitHub Actions“).
