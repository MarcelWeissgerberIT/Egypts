# Purpursonne Pyramide

Isometrisches Pyramiden-Puzzle für das iPhone (Safari / Home-Bildschirm).

**Spielen:** https://marcelweissgerberit.github.io/Egypts/
(auf dem iPhone in Safari öffnen, dann „Teilen → Zum Home-Bildschirm“ für Vollbild) Alle Grafiken, Icons,
Ziffern, 3D-Figuren, Musik und Fanfare wurden mit **Higgsfield** erzeugt, die 3D-Modelle,
Rigs und Animationen mit **Meshy** (über Higgsfield). Im Spiel gibt es keine Schrift: jede
Beschriftung, jede Zahl und jeder Knopf ist ein Bild.

## Spielprinzip – Pyramidenwerk mit eigenen Transportrouten

Du baust Betriebe und verbindest sie selbst mit Transportrouten. Waren bewegen sich nur über
deine Routen; jeder Betrieb hat ein kleines eigenes Lager.

* **Bauplatz antippen**: Baumenü (passend zu Sand, Fels, Nilufer, Kai-Ufer oder anderem Nilufer).
* **Betrieb antippen**: Stufe, Produktion, Lagerbestand, Ausbau – und der **Routen-Knopf**.
  Danach das leuchtende Ziel antippen (Betrieb oder Baustelle) und das Transportmittel wählen.
  Jede Route zeigt Fahrzeuge (+ fügt eines hinzu, ✕ löscht die Route).
* **Baustelle antippen**: benötigter Stein, Lager am Rampenfuß, Ausbau der Rampenmannschaft.
* **Wischen** verschiebt die Kamera, **zwei Finger** zoomen, unten rechts: Tempo x1–x3.

| Transport | Kosten | Arbeiter | Ladung | Tempo | Darf |
|---|---|---|---|---|---|
| Träger | 0 | 1 | 1 | schnell | nur leichte Waren (Getreide, Brot, Erz, Werkzeug) |
| Schlittentrupp | 20 | 1 | 2 | langsam | alles an Land |
| Ochsenkarren | 45 | 1 | 4 | mittel | alles an Land |
| Nilboot | 60 | 1 | 4 | mittel | Granit vom anderen Ufer zum Kai |

Ketten: Steinbruch → Steinmetz → Baustelle · Feld → Bäckerei → Arbeiterhäuser (gemeinsame
Vorratskammer) · Kupfermine → Schmiede → Steinbruch (ab Level 3) · Granitbruch → Nilboot → Kai
→ Baustelle (obere Stufen ab Level 4).

Die **Baustelle** ist echt animiert: Eine Lehmziegel-Rampe wächst mit jeder Stufe, ein
Schlittentrupp schiebt die Quader hinauf, ein Wasserträger nässt die Bahn, oben setzen Arbeiter
die Blöcke mit Hebeln, am Rampenfuß stapelt sich der Vorrat und ein Aufseher gibt Kommandos.
In den **Betrieben** arbeiten Meshy-Figuren mit eigenen Animationen und Werkzeugen (Hämmern,
Meißeln, Ernten mit der Sichel, Brot einlegen, Erz aufheben); fehlt Material, zucken sie mit den
Schultern.

Herausforderung: Regierungszeit des Pharaos (Sonnenleiste), Hunger-Streiks ohne Brot, Nilflut
über den Feldern, Sandstürme in Level 5. Horusaugen: 3 bei höchstens 75 % der Zeit, 2 bei 90 %.
Fristen sind mit `tools/balance_sim.mjs` (ein Bot, der Betriebe und Routen anlegt) eingestellt.

## Entwickeln

```bash
npm install
npm run build              # bündelt src/ nach dist/
node tools/serve.cjs dist  # http://localhost:8080
```

| Ordner | Inhalt |
|---|---|
| `src/` | Spielcode (Three.js): `world.js` 3D-Diorama, `main.js` Spielablauf/Steuerung, `ui.js` bildbasierte Oberfläche, `economy.js` Produktionswirtschaft mit Routen und Fahrzeugen, `routes.js` Wegegeometrie, `levels.js`/`plots.js` Level und Bauplätze, `audio.js` Musik und erzeugte Klänge |
| `public/assets/` | aufbereitete Assets (WebP/JPG, meshopt-komprimierte GLBs, MP3) |
| `tools/` | Bild-/Modell-Aufbereitung, Build, lokaler Server, Balancing-Simulation |
| `art/jobs.json` | Higgsfield/Meshy-Job-IDs der Rohdateien |

Jeder Push auf `claude/purpursonne-pyramide` (oder `main`) baut das Spiel per GitHub Actions
(`.github/workflows/pages.yml`) und veröffentlicht es auf GitHub Pages
(Settings → Pages → Source: „GitHub Actions“).
