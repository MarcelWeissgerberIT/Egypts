# Purpursonne Pyramide

Isometrisches Pyramiden-Puzzle für das iPhone (Safari / Home-Bildschirm).

**Spielen:** https://marcelweissgerberit.github.io/Egypts/
(auf dem iPhone in Safari öffnen, dann „Teilen → Zum Home-Bildschirm“ für Vollbild) Alle Grafiken, Icons,
Ziffern, 3D-Figuren, Musik und Fanfare wurden mit **Higgsfield** erzeugt, die 3D-Modelle,
Rigs und Animationen mit **Meshy** (über Higgsfield). Im Spiel gibt es keine Schrift: jede
Beschriftung, jede Zahl und jeder Knopf ist ein Bild.

## Spielprinzip

* Jede Pyramide besteht aus Stufen (z. B. 7×7 → 5×5 → 3×3). Ganz oben setzt du als Belohnung
  die goldene Spitze.
* Unten liegen drei Steine. **Ziehen** legt einen Stein auf die aktuelle Stufe: Der violett
  umrandete Vorschau-Stein zeigt genau, wo er landet, goldenes Leuchten zeigt Reihen und Spalten,
  die dadurch fertig würden. **Antippen** dreht einen Stein um 90°.
* Neue Steine gibt es erst, wenn alle drei verbaut sind – die Reihenfolge will geplant sein.
* Die **Sonnenleiste** ist die Zeit für die Stufe: Der Tag läuft ab, der Himmel färbt sich purpur.
  Geht die Sonne unter, verlierst du einen **Skarabäus** (3 Leben).
* Volle Reihen und Spalten geben Punkte und etwas Sonnenzeit, mehrere hintereinander einen
  Kombo-Multiplikator.
* **Ankh-Felder** abdecken: viel Sonnenzeit und Punkte, die Priesterin wirkt einen Segen.
* **Goldsteine** zählen dreifach. Roter **Granit** ist schon verbaut und macht die Formen kniffliger.
* Passt kein Stein mehr? Der **Nil-Knopf** spült alle drei Steine fort (kostet 7 Sekunden Sonne).
* Wertung: 3 Horusaugen nur ohne verlorenen Skarabäus und mit mindestens einem Viertel
  Sonnenzeit übrig, 2 Augen mit höchstens einem verlorenen Skarabäus. 6 Level, steigende
  Schwierigkeit (knappere Zeit, mehr Granit, seltener garantiert passende Steine).

## Entwickeln

```bash
npm install
npm run build              # bündelt src/ nach dist/
node tools/serve.cjs dist  # http://localhost:8080
```

| Ordner | Inhalt |
|---|---|
| `src/` | Spielcode (Three.js): `world.js` 3D-Diorama, `main.js` Spielablauf/Steuerung, `ui.js` bildbasierte Oberfläche, `logic.js`/`pieces.js`/`levels.js` Puzzle-Regeln, `audio.js` Musik und erzeugte Klänge |
| `public/assets/` | aufbereitete Assets (WebP/JPG, meshopt-komprimierte GLBs, MP3) |
| `tools/` | Bild-/Modell-Aufbereitung, Build, lokaler Server, Balancing-Simulation |
| `art/jobs.json` | Higgsfield/Meshy-Job-IDs der Rohdateien |

`npm run deploy` baut das Spiel und veröffentlicht `dist/` auf dem Branch `gh-pages`
(GitHub Pages: Settings → Pages → „Deploy from a branch“, Branch `gh-pages`, Ordner `/ (root)`).
