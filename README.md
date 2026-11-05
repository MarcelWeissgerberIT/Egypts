# Purpursonne Pyramide

Isometrisches Aufbauspiel für das iPhone (Safari / Home-Bildschirm): Vorkommen erschließen, Wege bauen, Pyramide errichten.

**Spielen:** https://marcelweissgerberit.github.io/Egypts/
(auf dem iPhone in Safari öffnen, dann „Teilen → Zum Home-Bildschirm“ für Vollbild) Alle Grafiken, Icons,
Ziffern, 3D-Figuren, Musik und Fanfare wurden mit **Higgsfield** erzeugt, die 3D-Modelle,
Rigs und Animationen mit **Meshy** (über Higgsfield). Im Spiel gibt es keine Schrift: jede
Beschriftung, jede Zahl und jeder Knopf ist ein Bild.

## Spielprinzip – Vorkommen erschließen, Wege bauen, Pyramide errichten

Du startest mit etwas Deben und einem Arbeiterhaus. Auf der Insel liegen sichtbare
**Vorkommen**: cremefarbene Kalksteinfelsen, Kupferadern mit grünem Malachit, rosa Granit am
anderen Nilufer und dunkler, fruchtbarer Nilschlamm. Ein Steinbruch geht nur auf Kalkstein, eine
Mine nur auf Kupfer, ein Feld nur auf Nilschlamm. Werkstätten und Häuser stehen auf Sandplätzen.

Waren bewegen sich **nur über Wege, die du Kachel für Kachel baust**:

* **Wege-Knopf** (unten links) öffnet den Wegebau: ein Raster zeigt jede baubare Kachel.
  * **Pfad** (1 Deben/Kachel): für leichte Waren (Getreide, Brot, Erz, Werkzeug).
  * **Schlittenbahn** (3 Deben/Kachel, nasser Lehm mit Holzschwellen): für Rohstein, Quader und
    Granit, und natürlich auch für leichte Waren. Ein Pfad lässt sich zur Schlittenbahn ausbauen.
  * **Abriss**: Kachel entfernen (halbe Kosten zurück).
  * Mit **einem Finger ziehen** malt Kacheln, **zwei Finger** verschieben und zoomen die Kamera.
* Ein Weg muss die Kante eines Betriebs (bzw. den Steinplatz am Rampenfuß) berühren. Längere Wege
  kosten mehr und machen die Träger langsamer.
* Jeder Betrieb hat eigene **Träger**: Sie holen die Ware vom Stapel neben dem Betrieb und bringen
  sie über die Wege zum nächsten verbundenen Abnehmer mit Platz. Leichte Waren tragen Träger mit
  einem Korb auf dem Kopf, schwere Steine zieht ein Schlittentrupp (einer zieht am Seil, einer
  schiebt), voll ausgebaute Betriebe fahren ab Level 2 mit Ochsenkarren, Granit kommt per Nilboot
  zum Kai. Im Betriebsfenster: **+** stellt einen weiteren Träger ein (max. 3).
* Fehlt die Verbindung, zeigt der Betrieb eine Sprechblase mit Pfad oder Schlittenbahn.

Ketten: Steinbruch → Steinmetz → Baustelle · Feld → Bäckerei → Arbeiterhäuser (gemeinsame
Vorratskammer) · Kupfermine → Schmiede → Steinbruch (ab Level 3) · Granitbruch → Nilboot → Kai
→ Baustelle (obere Stufen ab Level 4).

Level 1 führt mit einer Hand durch alles: Vorkommen erschließen, Steinmetz bauen, Wegebau öffnen,
Schlittenbahn wählen, die golden pulsierende Wegvorlage nachmalen, später Feld, Bäckerei und
Pfade für das Brot.

Die **Baustelle** ist echt animiert: Eine Lehmziegel-Rampe wächst mit jeder Stufe, ein
Schlittentrupp schiebt die Quader hinauf, ein Wasserträger nässt die Bahn, oben setzen Arbeiter
die Blöcke mit Hebeln, auf dem Steinplatz stapelt sich der Vorrat und ein Aufseher gibt Kommandos.
In den **Betrieben** arbeiten Meshy-Figuren mit eigenen Animationen und Werkzeugen (Hämmern,
Meißeln, Hacken, Ernten mit der Sichel, Brot einlegen); beim Schlag fliegen Splitter, die fertige
Ware stapelt sich sichtbar neben dem Betrieb.

Herausforderung: Regierungszeit des Pharaos (Sonnenleiste), Hunger-Streiks ohne Brot, Nilflut
über den Feldern, Sandstürme in Level 5. Horusaugen: 3 bei höchstens 75 % der Zeit, 2 bei 90 %.
Fristen sind mit `tools/balance_sim.mjs` eingestellt (ein Bot, der Vorkommen erschließt, Wege
legt und Träger einstellt).

## Entwickeln

```bash
npm install
npm run build              # bündelt src/ nach dist/
node tools/serve.cjs dist  # http://localhost:8080
```

| Ordner | Inhalt |
|---|---|
| `src/` | Spielcode (Three.js): `world.js` 3D-Diorama, `main.js` Spielablauf/Steuerung, `ui.js` bildbasierte Oberfläche, `economy.js` Produktionswirtschaft mit Trägern, `roads.js` Wegenetz auf dem Kachelraster (Wegsuche, Wegvorschläge), `map.js` Inselkarte (Vorkommen, Bauplätze, Monumente), `levels.js` Level, `audio.js` Musik und erzeugte Klänge |
| `public/assets/` | aufbereitete Assets (WebP/JPG, meshopt-komprimierte GLBs, MP3) |
| `tools/` | Bild-/Modell-Aufbereitung, Build, lokaler Server, Balancing-Simulation |
| `art/jobs.json` | Higgsfield/Meshy-Job-IDs der Rohdateien |

Jeder Push auf `claude/purpursonne-pyramide` (oder `main`) baut das Spiel per GitHub Actions
(`.github/workflows/pages.yml`) und veröffentlicht es auf GitHub Pages
(Settings → Pages → Source: „GitHub Actions“).
