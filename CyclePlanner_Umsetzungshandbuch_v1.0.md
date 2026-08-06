# CyclePlanner – Umsetzungshandbuch (Version 1.0)

**Begleitdokument zu:** `CyclePlanner_Konzept_v2.0.md`
**Zweck:** Von „leerer Rechner" bis „lauffähiges, tunebares Routing-System" – mit konkreten Befehlen, Reihenfolge, Prüfschritten und fertigen Übergabetexten für den Coding-Agenten.
**Zielumgebung:** Visual Studio Code mit dem Claude-Code-Plugin, dahinter ein alternativer Modellanbieter (DeepSeek).
**Stand:** August 2026

---

## Teil A – Entwicklungsumgebung einrichten

### A.1 Was gebraucht wird (Übersicht)

| Werkzeug | Zweck | Pflicht |
|---|---|---|
| Docker Engine + Compose | Routing-Engine, Backend, Webserver als Container | ja |
| Node.js 22 LTS | Frontend- und Backend-Entwicklung | ja |
| pnpm 10 | Paket- und Monorepo-Verwaltung | ja |
| Git | Versionierung; unverzichtbar bei KI-generiertem Code | ja |
| Visual Studio Code | Editor und Host des Coding-Agenten | ja |
| Claude Code (CLI/Plugin) | der Coding-Agent | ja |
| osmium-tool | Kartendaten zusammenfügen und zuschneiden | erst Phase 5 |
| curl, jq | Schnittstellen von Hand prüfen | empfohlen |

**Speicherplatz:** Für die Startstufe (ein Bundesland) genügen rund 10 GB frei. Für Mitteleuropa später 60–100 GB, idealerweise auf einer SSD.

### A.2 Windows

Empfehlung: Alles innerhalb des Linux-Subsystems entwickeln. Das vermeidet Pfad- und Zeilenende-Probleme und ist deutlich schneller beim Dateizugriff.

```powershell
# In PowerShell als Administrator
wsl --install -d Ubuntu
# Rechner neu starten, Ubuntu-Benutzer anlegen
```

Anschließend Docker Desktop installieren (`https://www.docker.com/products/docker-desktop/`) und in dessen Einstellungen unter „Resources → WSL Integration" die Ubuntu-Distribution aktivieren. Wichtig: In den Ressourcen-Einstellungen den Arbeitsspeicher für WSL auf mindestens 8 GB setzen, für den späteren Mitteleuropa-Aufbau auf 24 GB oder mehr.

**Ab hier alle Befehle in der Ubuntu-Shell ausführen** (VS Code später mit der WSL-Erweiterung im Linux-Kontext öffnen).

### A.3 Linux und macOS

Linux: Docker Engine nach Anleitung des eigenen Systems installieren, dann `sudo usermod -aG docker $USER` und neu anmelden. macOS: Docker Desktop installieren; in den Einstellungen genügend Arbeitsspeicher zuweisen.

### A.4 Node, pnpm, Git (alle Systeme, in der Linux-Shell bzw. dem Terminal)

```bash
# Node über nvm (kein System-Node, vermeidet Rechteprobleme)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
exec $SHELL
nvm install 22
nvm alias default 22

# pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Hilfswerkzeuge
sudo apt update && sudo apt install -y git curl jq   # Debian/Ubuntu
# macOS: brew install git curl jq

# Prüfen
node -v      # v22.x
pnpm -v      # 10.x
docker --version
docker compose version
```

### A.5 Visual Studio Code

VS Code installieren, dann folgende Erweiterungen: **WSL** (nur Windows), **ESLint**, **Prettier**, **Docker**, **Tailwind CSS IntelliSense** und die **Claude Code**-Erweiterung. Unter Windows das Projekt immer über „Open Folder in WSL" öffnen, nicht über den Windows-Pfad.

### A.6 Coding-Agent einrichten (Claude Code mit alternativem Anbieter)

Installation der Kommandozeile:

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

**Umleitung auf einen anderen Modellanbieter.** Claude Code liest Endpunkt und Zugangsdaten aus Umgebungsvariablen. Maßgeblich sind zwei Variablen: `ANTHROPIC_BASE_URL` zeigt auf den Endpunkt, `ANTHROPIC_AUTH_TOKEN` liefert die Zugangsdaten als Bearer-Token. Entscheidend ist, dass die Gegenstelle das **Anthropic-Messages-Format** spricht – ein rein OpenAI-kompatibler Endpunkt funktioniert ohne Übersetzungsschicht nicht. DeepSeek veröffentlicht für diesen Zweck eine eigene Anleitung mit einem Anthropic-kompatiblen Endpunkt; alternativ setzt man einen Übersetzungsdienst wie LiteLLM davor.

```bash
# Beispielhaft in ~/.bashrc oder ~/.zshrc ergänzen
export ANTHROPIC_BASE_URL="<Anthropic-kompatibler Endpunkt des Anbieters>"
export ANTHROPIC_AUTH_TOKEN="<eigener Schlüssel>"
```

Alternativ dieselben Werte in der Datei `~/.claude/settings.json` unter dem Schlüssel `env` hinterlegen, damit sie auch gelten, wenn der Agent aus der grafischen Oberfläche von VS Code gestartet wird und nicht aus einer Login-Shell.

**Zwei ehrliche Hinweise dazu:**

1. Anthropic unterstützt das Betreiben von Claude Code mit Nicht-Claude-Modellen ausdrücklich **nicht** – es funktioniert in der Praxis über kompatible Endpunkte, ist aber kein zugesagter Betriebsfall. Bei merkwürdigem Verhalten des Agenten ist das immer als Ursache mitzuprüfen, insbesondere bei Werkzeugaufrufen und langen Arbeitsläufen.
2. Genau deshalb ist der Fahrplan unten so geschnitten: kleine Arbeitspakete, jeweils mit klaren Abnahmekriterien und einem Prüfbefehl. Je schwächer die Werkzeugtreue des Modells, desto wichtiger sind kleine Schritte, häufige Zwischenstände in der Versionsverwaltung und automatisierte Tests, die eine Fehlleistung sofort sichtbar machen.

**Kostenkontrolle:** Beim Anbieter ein Ausgabenlimit setzen, bevor der erste längere Arbeitslauf startet.

---

## Teil B – Projekt anlegen

### B.1 Verzeichnisstruktur

```
cycleplanner/
├─ apps/
│  ├─ web/                 Frontend (React, TypeScript, Vite)
│  └─ api/                 Backend (Node, Fastify, TypeScript)
├─ packages/
│  └─ shared/              gemeinsame Typen: Route, Profil, Analyse, Score
├─ config/
│  ├─ region.yaml          aktive Region und Bezugsquellen
│  ├─ valhalla.json        Dienstkonfiguration der Routing-Engine
│  ├─ profiles.json        die vier Profile inkl. Ausschluss-Implikationen
│  └─ score-weights.json   Gewichte des Qualitätswerts je Profil
├─ calibration/            Referenztouren als Dateien
├─ scripts/
│  ├─ fetch-region.sh      Rohdaten holen und ggf. zusammenfügen
│  └─ calibrate.ts         Kalibrierläufe gegen die Referenztouren
├─ data/                   (nicht versioniert) Rohdaten, Graph, Datenbank
│  ├─ custom_files/        Arbeitsverzeichnis der Routing-Engine
│  └─ cycleplanner.db      SQLite-Datei
├─ docker-compose.yml
├─ .env.example
├─ CLAUDE.md               Daueranweisung für den Coding-Agenten
└─ README.md
```

### B.2 Erste Schritte

```bash
mkdir -p ~/projects/cycleplanner && cd ~/projects/cycleplanner
git init
mkdir -p apps packages config calibration scripts data/custom_files
printf 'data/\nnode_modules/\n.env\ndist/\n*.osm.pbf\n' > .gitignore
```

### B.3 Datei `CLAUDE.md` – die Daueranweisung

Diese Datei liest der Agent bei jedem Start. Sie ist der wirksamste Hebel gegen Abweichungen. Inhalt anlegen:

```markdown
# CyclePlanner – Arbeitsanweisung für den Coding-Agenten

## Projektkontext
Lokal betriebener Fahrradtourenplaner. Kern ist ein tief konfigurierbares
Routing-System auf Basis der Routing-Engine Valhalla (Docker-Container).
Vollständige Fachvorgaben: siehe CyclePlanner_Konzept_v2.0.md im Projektordner.

## Verbindliche technische Vorgaben
- Sprache: TypeScript im strict-Modus. Kein `any` ohne begründenden Kommentar.
- Frontend: React 19, Vite, MapLibre GL JS, Zustand, TanStack Query, Tailwind.
- Backend: Node 22, Fastify, better-sqlite3 mit Drizzle ORM.
- Keine Browser-Speicher-APIs (localStorage/sessionStorage) im Frontend-Zustand.
- Keine Zugangsschlüssel im Frontend. Alle Aufrufe mit Schlüsseln laufen über das Backend.
- Der Routing-Container ist nie direkt aus dem Browser erreichbar, nur über das Backend.
- Gemeinsame Typen gehören nach packages/shared, nicht doppelt in Web und API.
- Konfiguration gehört nach config/ als Datei, nicht als Konstante in den Code.

## Arbeitsweise
- Ein Arbeitspaket pro Sitzung. Nicht vorgreifen, keine Funktionen aus späteren Paketen.
- Vor dem Schreiben: kurz den Plan nennen (Dateien, Reihenfolge). Danach umsetzen.
- Nach dem Umsetzen: die im Arbeitspaket genannten Prüfbefehle ausführen und
  das Ergebnis zeigen. Bei Fehlern selbst nachbessern, bevor gemeldet wird.
- Am Ende: ein Commit mit sprechender Nachricht, Format "P<Phase>-<Nr>: <Kurztext>".
- Unklarheiten: fragen statt annehmen. Keine erfundenen Endpunkte oder Feldnamen.

## Tests
Für jede reine Rechenlogik (Qualitätswert, Höhenprofil-Auswertung, Score-Aggregation,
GPX-Erzeugung) ein Vitest-Test mit mindestens einem Normalfall und einem Randfall.
```

---

## Teil C – Routing-Engine installieren und Graph bauen

Das ist der einzige technisch eigenständige Schritt, den man am besten **von Hand einmal durchspielt**, bevor der Agent ihn in den Containerverbund einbaut. Danach weiß man, wie ein funktionierender Zustand aussieht.

### C.1 Rohdaten holen

Bundesland-Auszüge liegen bei Geofabrik unter dem Deutschland-Pfad. Beispiel Mecklenburg-Vorpommern:

```bash
cd ~/projects/cycleplanner/data/custom_files
wget https://download.geofabrik.de/europe/germany/mecklenburg-vorpommern-latest.osm.pbf
```

Andere Bundesländer analog, etwa `bayern-latest.osm.pbf`, `sachsen-latest.osm.pbf`, `niedersachsen-latest.osm.pbf`. Die Übersicht aller Auszüge steht unter `https://download.geofabrik.de/europe/germany.html`.

### C.2 Graph aufbauen und Dienst starten

Verwendet wird das offizielle Container-Abbild mit Aufbau-Automatik. Es erkennt die Rohdaten im gemounteten Arbeitsverzeichnis, baut daraus den Graphen und startet anschließend den Dienst auf Port 8002.

```bash
cd ~/projects/cycleplanner
docker run -dt --name valhalla \
  -p 8002:8002 \
  -v "$PWD/data/custom_files:/custom_files" \
  -e build_elevation=True \
  -e build_admins=True \
  -e build_time_zones=False \
  -e build_tar=True \
  -e server_threads=4 \
  ghcr.io/valhalla/valhalla-scripted:latest

# Aufbau beobachten (bei einem Bundesland Minuten, nicht Stunden)
docker logs -f valhalla
```

Bedeutung der wichtigsten Schalter: `build_elevation` lädt Höhendaten für den vom Graphen abgedeckten Bereich und rechnet die Steigungen dauerhaft in die Kanten ein – für Fahrradrouting unverzichtbar. `build_admins` erzeugt die Verwaltungsgrenzen, was Grenzübertritts-Zuschläge ermöglicht. `build_tar` legt ein indiziertes Archiv des Graphen an, wodurch der Dienst später schneller startet. Alternativ lässt man den Container die Rohdaten selbst herunterladen, indem man `tile_urls` mit einer oder mehreren durch Leerzeichen getrennten Adressen setzt. Je nach Abbild-Variante gibt es zusätzliche Variablen für den Höhendaten-Bereich und für einen erzwungenen Neuaufbau; die Beschreibung des Abbilds unter `https://github.com/valhalla/valhalla/tree/master/docker` ist hier die maßgebliche Quelle.

### C.3 Funktionsprüfung

```bash
# Ist der Dienst da?
curl -s http://localhost:8002/status | jq .

# Fahrradroute (Koordinaten an die eigene Region anpassen)
curl -s http://localhost:8002/route --data-raw '{
  "locations":[{"lat":54.0887,"lon":12.1405},{"lat":54.1780,"lon":12.0870}],
  "costing":"bicycle",
  "costing_options":{"bicycle":{"bicycle_type":"Hybrid","use_hills":0.35,"avoid_bad_surfaces":0.6}}
}' | jq '.trip.summary'
```

Erwartet wird ein Objekt mit Länge und Fahrzeit. Kommt eine Fehlermeldung über nicht gefundene Punkte, liegen die Koordinaten außerhalb des aufgebauten Bereichs.

**Zweite Prüfung – Kantenattribute**, weil davon die gesamte Analyse abhängt: Dieselbe Routengeometrie an den Endpunkt `/trace_attributes` senden und prüfen, ob je Kante Oberfläche und Straßenklasse zurückkommen. Der Agent baut später darauf auf; wenn es hier klemmt, klemmt es an der Datengrundlage, nicht am eigenen Code.

**Dritte Prüfung – harte Ausschlüsse:** Eine Anfrage mit `"exclude_ferries": true` in den Kostenoptionen senden. Kommt eine Warnung zurück, dass harte Ausschlüsse nicht erlaubt sind, fehlt in der Dienstkonfiguration die Freigabe. Genau dafür wird in Arbeitspaket P0-2 eine eigene `config/valhalla.json` mit gesetzter Freigabe und einer Höchstdistanz von mindestens 400 Kilometern in den Container gemountet.

### C.4 Aufräumen vor dem Übergang in den Containerverbund

```bash
docker stop valhalla && docker rm valhalla
```

Der aufgebaute Graph bleibt im Arbeitsverzeichnis erhalten und wird vom späteren Verbund weiterverwendet – kein zweiter Aufbau nötig.

---

## Teil D – Wie man mit dem Agenten arbeitet

**Sitzungsstart.** Im Projektordner `claude` starten. Der Agent liest `CLAUDE.md` und hat damit den Rahmen. Zusätzlich zu Beginn einer Sitzung das Konzeptdokument als Kontext benennen, damit Fachfragen aus dem Konzept beantwortet werden statt geraten.

**Ein Paket pro Sitzung.** Nach jedem abgeschlossenen Arbeitspaket eine neue Sitzung starten. Das hält den Kontext klein und die Ergebnisse stabil.

**Versionsverwaltung als Sicherheitsnetz.** Vor jedem Paket ein eigener Zweig oder mindestens ein saubererer Ausgangsstand. Nach jedem Paket ein Commit. So ist ein misslungener Lauf ein `git checkout .` und keine Rekonstruktionsarbeit.

**Abnahme selbst durchführen.** Jedes Paket unten enthält Abnahmekriterien. Diese selbst prüfen und nicht auf die Zusammenfassung des Agenten verlassen – das gilt für jedes Modell.

**Wenn der Agent abdriftet:** unterbrechen, den letzten Stand verwerfen, das Paket in zwei kleinere Aufträge teilen. Nicht nachverhandeln, sondern neu beauftragen.

---

## Teil E – Arbeitspakete mit fertigen Übergabetexten

Die Texte in den Codeblöcken sind zum direkten Einfügen in den Agenten gedacht.

### Phase 0 – Fundament

**P0-1 Projektgerüst**

```
Lege das Monorepo-Grundgerüst an.

Aufgabe:
- pnpm-Workspace mit apps/web, apps/api, packages/shared.
- apps/web: React 19 + TypeScript + Vite + Tailwind, eine leere Startseite.
- apps/api: Fastify + TypeScript, ein Endpunkt GET /api/health, der {status:"ok"} liefert.
- packages/shared: leeres Paket mit index.ts, von beiden Apps importierbar.
- TypeScript strict in allen Paketen, ESLint und Prettier gemeinsam konfiguriert.
- Vitest in web und api eingerichtet, je ein Beispieltest.
- Skripte im Wurzelverzeichnis: dev, build, test, lint.

Abnahme:
- `pnpm install && pnpm build && pnpm test && pnpm lint` läuft fehlerfrei durch.
- `pnpm dev` startet Frontend und Backend gleichzeitig.
- curl http://localhost:3000/api/health liefert {"status":"ok"}.
Führe diese Befehle aus und zeige die Ausgaben. Danach committen.
```

**P0-2 Containerverbund und Routing-Anbindung**

```
Baue den Docker-Compose-Verbund und binde die vorhandene Routing-Engine an.

Ausgangslage: In data/custom_files liegt ein bereits aufgebauter Valhalla-Graph
für ein Bundesland (manuell erzeugt mit ghcr.io/valhalla/valhalla-scripted).

Aufgabe:
1. config/valhalla.json anlegen mit mindestens:
   - service_limits.allow_hard_exclusions = true
   - service_limits.bicycle.max_distance >= 400000 (Meter)
   - großzügige Hierarchie-Limits, jede Einstellung kommentiert
2. docker-compose.yml mit drei Diensten:
   - valhalla: Abbild ghcr.io/valhalla/valhalla-scripted, data/custom_files gemountet,
     config/valhalla.json gemountet, use_tiles_ignore_pbf=True (kein Neuaufbau),
     Port NUR intern im Compose-Netz, nicht nach außen veröffentlicht.
   - api: unser Backend, erreicht valhalla über den Dienstnamen.
   - web: Caddy, liefert das gebaute Frontend aus und leitet /api an api weiter.
   - Alle nach außen veröffentlichten Ports auf 127.0.0.1 binden, über .env umschaltbar.
   - In der Caddy-Konfiguration einen deaktivierten, kommentierten Block für
     TLS und Zugangsschutz vorsehen (für späteren Serverbetrieb).
3. Zweites Compose-Profil "build" für den Graphaufbau mit build_elevation=True.
4. .env.example mit allen Variablen und Erklärung.
5. Backend-Endpunkt POST /api/route: nimmt {waypoints, profile, costingOptions},
   ruft valhalla /route auf, gibt Geometrie und Zusammenfassung zurück.
   Eingabevalidierung über Fastify-Schema. Typen nach packages/shared.

Abnahme:
- `docker compose up -d` startet alle Dienste, `docker compose down` beendet sie.
- POST auf /api/route mit zwei Koordinaten der Region liefert eine Fahrradroute.
- Eine Anfrage mit exclude_ferries=true wird OHNE Warnung verarbeitet
  (Beweis, dass die Freigabe harter Ausschlüsse greift).
- Der Valhalla-Port ist von außen NICHT erreichbar (nachweisen).
Zeige die Ausgaben. Danach committen.
```

**P0-3 Karte und Layer-Registry**

```
Baue die Kartenoberfläche mit einer erweiterbaren Layer-Registry.

Aufgabe:
1. MapLibre GL JS einbinden, Vollbildkarte.
2. Layer-Registry: ein Modul definiert Layer als Objekte mit
   {id, label, source, styleLayers, legend, attribution, minZoom, defaultVisible}.
   Neue Layer dürfen nur durch Hinzufügen eines Registry-Eintrags entstehen.
3. Drei Layer registrieren:
   - L1 Basiskarte: Stil https://tiles.openfreemap.org/styles/liberty,
     als lokale Stilkopie, Farben entsättigt, damit Route und Overlays hervortreten.
   - L2 Relief: raster-dem aus
     https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png,
     encoding "terrarium", darauf ein hillshade-Layer.
   - L3 Radroutennetz: Raster von
     https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png
4. Bedienelement zum Ein- und Ausschalten je Layer, mit Legende.
5. Quellenangaben aller aktiven Layer werden dauerhaft angezeigt.

Abnahme:
- Karte lädt, Pan und Zoom flüssig.
- Jeder Layer einzeln schaltbar, Relief sichtbar wirksam.
- Quellenangaben korrekt sichtbar.
- Ein vierter Layer wäre durch einen reinen Registry-Eintrag ergänzbar
  (kurz im Code zeigen, wo).
Danach committen.
```

### Phase 1 – Kern-Tourplanung

**P1-1 Wegpunktplanung**

```
Implementiere die interaktive Wegpunktplanung.

Aufgabe:
- Klick auf die Karte hängt einen Wegpunkt an (Typ break).
- Ziehen der Routenlinie erzeugt an dieser Stelle einen Durchfahrtpunkt (Typ through).
- Wegpunkte sind auf der Karte verschiebbar und in einer Seitenleiste per
  Drag-and-Drop sortierbar, einzeln löschbar.
- Neuberechnung entprellt (250 ms), parallele Anfragen werden verworfen,
  wenn eine neuere unterwegs ist.
- Zustand in Zustand-Store, Serveraufrufe über TanStack Query.
- Anzeige von Länge und Fahrzeit über der Karte.

Abnahme: Route folgt dem Ziehen ohne Flackern; beim schnellen Ziehen entstehen
keine veralteten Ergebnisse; Sortieren ändert die Route entsprechend.
```

**P1-2 Profile und Regler**

```
Implementiere die vier Profile samt ihrer automatischen Implikationen.

Aufgabe:
- config/profiles.json mit den vier Profilen (Tourenrad, Rennrad, Gravel, MTB)
  gemäß Konzept Kapitel 5.2 und 7.2. Jedes Profil enthält Gewichte UND Ausschlüsse.
- Rennrad setzt exclude_unpaved=true und Oberflächenstrenge 0.95 automatisch.
- Profilwahl in der Oberfläche; drei Regler für Steigungsmeidung, Straßenmeidung
  und Oberflächenstrenge, die die Profilwerte überschreiben.
- Automatisch gesetzte Ausschlüsse bleiben sichtbar und überschreibbar.
- Widersprüche (z. B. Gravel plus Ausschluss unbefestigter Wege) erzeugen einen
  sichtbaren Hinweis, werden aber nicht stillschweigend korrigiert.
- Ein Profil ist technisch eine gespeicherte Voreinstellung; die Struktur muss
  später vom Tuning-Werkzeug (P2-1) unverändert weiterverwendbar sein.

Abnahme: Profilwechsel verändert die Route sichtbar; Rennrad meidet Schotter
nachweislich; Reglerwerte gehen unverändert in die Routing-Anfrage ein.
```

**P1-3 Höhenprofil**

```
Implementiere Höhenprofil-Dienst und -Anzeige.

Backend: POST /api/elevation/profile nimmt eine Polyline, tastet sie etwa alle
50 m ab, liest die Höhen aus den Terrarium-Kacheln (Formel Höhe =
R*256 + G + B/256 - 32768), speichert Kacheln in SQLite zwischen, glättet mit
gleitendem Median und liefert Punkte plus Kennzahlen (Anstieg, Abstieg,
mittlere und maximale Steigung, Verteilung nach Steigungsklassen).

Frontend: eigenes SVG-Diagramm unter der Karte, Hover zeigt Position auf der
Karte und umgekehrt.

Abnahme: Vitest-Tests für Dekodierung, Glättung und Kennzahlen (Normalfall und
Randfall leere/einpunktige Linie); zweiter Aufruf derselben Route ist durch den
Zwischenspeicher deutlich schneller.
```

**P1-4 Rundtour, Umkehren, Sperren**

```
Implementiere die drei Streckenfunktionen.

- Strecke umkehren: Wegpunktreihenfolge invertieren.
- Teilstück sperren: gewähltes Segment mit etwa 30 m Puffer als Ausschlussfläche
  an die Routing-Anfrage übergeben.
- Rundtour zweistufig:
  a) manuell: Start gleich Ziel mit eigenen Zwischenpunkten.
  b) POST /api/tours/roundtrip: nimmt Startpunkt, Wunschlänge und Profil,
     berechnet aus der Wunschlänge einen Kreisradius (Länge / 2π), verteilt
     3 bis 4 Zwischenpunkte darauf, erzeugt mehrere Varianten mit
     unterschiedlichen Drehwinkeln (z. B. 0, 60, 120, 180 Grad), berechnet
     alle parallel und liefert sie sortiert nach Abweichung von der Wunschlänge.
     Punkte, die nicht auf das Wegenetz gezogen werden können, werden verworfen
     und die Variante ohne sie erneut versucht.
- Oberfläche: Varianten als Auswahlliste mit Länge und Höhenmetern.

Abnahme: Für eine 60-km-Wunschrunde entstehen mindestens zwei Varianten
zwischen 50 und 70 km; Sperren eines Segments führt zu nachweislicher Umfahrung.
```

**P1-5 Import und Export**

```
Implementiere Datenimport und -export für Touren.

- Export in drei Varianten: Spur (track), Route (route), Wegpunkte (waypoints),
  jeweils gültiges GPX 1.1 mit Metadaten.
- Import: GPX-Datei einlesen, Spur über den Kartenabgleich der Routing-Engine
  (/trace_route) auf das Wegenetz ziehen, daraus eine bearbeitbare Route mit
  automatisch gesetzten Durchfahrtpunkten an Richtungswechseln erzeugen.
- Fehlerbehandlung für unbrauchbare Dateien mit verständlicher Meldung.

Abnahme: Export–Import–Export erzeugt eine vergleichbare Route; Vitest-Tests
für Erzeugung und Einlesen.
```

**P1-6 Ausschlusspanel**

```
Implementiere die harten Ausschlüsse mit verständlicher Fehlerbehandlung.

- Bedienpanel mit Schaltern gemäß Konzept Kapitel 7.1: Fähren, unbefestigte Wege,
  Brücken, Tunnel; jeweils dreistufig wählbar wo sinnvoll (aus / weich meiden / hart).
- Landstraßen: Stufe 1 weich (Straßenmeidung 0) und Stufe 2 als Kandidatenfilter
  vorbereiten – der Filter selbst wird in P3-4 aktiv, die Einstellung existiert hier
  bereits und wird durchgereicht.
- Zentrale Fehlerbehandlung im Backend: schlägt eine Anfrage wegen eines harten
  Ausschlusses fehl, wird eine Meldung erzeugt, die den verursachenden Ausschluss
  benennt und dessen Lockerung vorschlägt. Kein technischer Fehler in der Oberfläche.

Abnahme: Eine Route, die zwingend eine Fähre braucht, erzeugt mit hartem
Fährenausschluss die verständliche Meldung statt eines Fehlers.
```

**P1-7 Europäisches Fernradwegenetz**

```
Ergänze den Layer L3a für das europäische Fernradwegenetz.

- Backend: GET /api/layers/eurovelo?bbox=... fragt über Overpass die Relationen
  mit type=route, route=bicycle, network=icn ab, liefert GeoJSON, Zwischenspeicher
  wie bei den Punkten von Interesse (14 Tage).
- Frontend: neuer Registry-Eintrag, kräftiges eigenes Styling deutlich abweichend
  von L3, Routennummer als Beschriftung entlang der Linie, Klick zeigt Name und
  Nummer der Route.

Abnahme: In einer Region mit EuroVelo-Route ist diese deutlich erkennbar und
klar von den übrigen Radroutennetzen unterscheidbar.
```

### Phase 2 – Tuning-Werkzeuge (der Produktkern)

**P2-1 Tuning-Werkzeug**

```
Baue das Tuning-Werkzeug – das zentrale Werkzeug des Projekts.

Aufgabe:
1. Per Tastenkürzel einblendbares Panel mit ALLEN Kostenparametern der Ebene 1
   (Konzept Kapitel 6): Radtyp, Reisegeschwindigkeit, Straßenmeidung,
   Steigungsbereitschaft, Oberflächenstrenge, Fähren- und
   Wohnstraßenbereitschaft, Strafkosten (Richtungswechsel, Tore, Gassen,
   Anliegerwege, Wirtschaftswege) sowie den Schalter zum Abschalten der
   Hierarchiebeschneidung (disable_hierarchy_pruning).
2. Vergleichsmodus: zwei Parameterstände A und B gleichzeitig, beide Routen
   übereinander in unterschiedlichen Farben, Kennzahlen nebeneinander.
3. Voreinstellungen: speichern, laden, benennen, löschen
   (Backend-CRUD /api/tuning/presets, Tabelle tuning_presets).
   Gewichte UND Ausschlüsse gemeinsam. Die vier Profile aus P1-2 sind
   vorinstallierte Voreinstellungen desselben Mechanismus.
4. Jede Parameteränderung löst eine Neuberechnung aus, entprellt.

Abnahme: Verschieben eines Reglers verändert die Route sichtbar ohne Neustart
irgendeines Dienstes; A/B-Vergleich zeigt beide Routen und beide Kennzahlensätze;
eine gespeicherte Voreinstellung lässt sich neu laden und reproduziert die Route.
```

**P2-2 Suchraumdarstellung und Dienstkonfiguration**

```
Mache das Suchverhalten sichtbar und lege die Dienstkonfiguration fest.

- Backend: GET /api/debug/expansion reicht den Expansions-Endpunkt der
  Routing-Engine durch (Suchbaum als GeoJSON).
- Frontend: Layer L6, nur im Tuning-Panel zuschaltbar, stellt den durchsuchten
  Bereich dar (Färbung nach Reihenfolge oder Kosten).
- config/valhalla.json vervollständigen und JEDE Einstellung kommentieren:
  Hierarchie-Limits je Graph-Ebene, Anzahl Alternativrouten, Dienstgrenzen.
  Zusätzlich eine kurze Datei docs/valhalla-config.md, die erklärt, welche
  Einstellung welche Wirkung hat und welche einen Neustart erfordert.

Abnahme: Bei aktivem Layer ist der Unterschied im durchsuchten Bereich zwischen
eingeschalteter und ausgeschalteter Hierarchiebeschneidung sichtbar.
```

**P2-3 Kalibrierwerkzeug**

```
Baue das Kalibrierwerkzeug für nachvollziehbares Feintuning.

- calibration/ enthält Referenztouren als GPX plus je eine kleine JSON-Datei
  mit Startpunkt, Zielpunkt, erwartetem Profil und einer Notiz.
- scripts/calibrate.ts: berechnet zu jeder Referenztour mit einer angegebenen
  Voreinstellung eine Route und vergleicht sie mit der Referenz über zwei Maße:
  (a) Flächenabweichung zwischen den Linien, (b) Anteil gemeinsamer Kanten.
  Ausgabe als Tabelle im Terminal plus Speicherung in der Tabelle calibration_runs.
- Aufruf: pnpm calibrate --preset <name>. Vergleich zweier Läufe:
  pnpm calibrate --compare <lauf1> <lauf2> zeigt Verbesserung und Verschlechterung
  je Referenztour.

Abnahme: Zwei Läufe mit unterschiedlichen Voreinstellungen ergeben
unterschiedliche, plausible Messwerte; die Historie ist abfragbar.
```

### Phase 3 – Analyse, Bewertung, Kandidatenauswahl

**P3-1 Kantenattribute und Analyseobjekt**

```
Implementiere die Analysekette.

- Backend: POST /api/route/analyze nimmt eine Route, ruft /trace_attributes der
  Routing-Engine auf und aggregiert je Kante Oberfläche, Straßenklasse,
  Nutzungsart, Radwegkennzeichen und Steigung.
- Ergebnis (Typ in packages/shared): Gesamtlänge, Fahrzeit, Anstieg, Abstieg,
  mittlere und maximale Steigung, Oberflächenverteilung in Prozent und Kilometern,
  Straßenklassenverteilung, Anteil ausgewiesener Radwege und Radroutennetze,
  Anzahl größerer Kreuzungen.
- Lichtsignalanlagen über eine Korridorabfrage ergänzen (Overpass, gecacht).
- Vitest-Tests der Aggregation mit einem festen Beispieldatensatz als Fixture.

Abnahme: Für eine bekannte Route sind die Prozentwerte plausibel und summieren
sich auf 100; Test läuft grün.
```

**P3-2 Routeneinfärbung**

```
Färbe die Route segmentweise ein (Layer L5).

- Umschaltbar zwischen Oberfläche, Straßentyp und Steigung.
- Legende mit Farbzuordnung, Klick auf ein Segment zeigt dessen Attribute.
- Farbwahl für Farbfehlsichtigkeit geeignet, nicht rot-grün-basiert.

Abnahme: Auf einer gemischten Route sind Asphalt- und Schotterabschnitte
eindeutig unterscheidbar; Umschalten wirkt sofort.
```

**P3-3 Qualitätswert**

```
Implementiere den Qualitätswert samt Aufschlüsselung.

- config/score-weights.json mit Gewichten je Profil (ohne Neuauslieferung änderbar).
- Teilwerte gemäß Konzept Kapitel 10: profilgerechte Oberfläche (Gravel: Optimum
  bei 40–80 % unbefestigt), Radinfrastruktur, Verkehr, Halte- und Kreuzungsdichte,
  Höhenmeterkorridor, Versorgungsdichte. Jeder Teilwert 0–100, gewichtete Summe.
- Oberfläche: Panel mit Gesamtwert und Aufschlüsselung in Klartextzeilen mit
  Symbolen (Anteil Radwege, Anteil größerer Straßen, Anteil asphaltiert bzw.
  Schotter, Kilometer Wald, Anzahl größerer Kreuzungen, später Cafés,
  Trinkwasser, Bahnhöfe). Jede Zeile anklickbar und hebt die betreffenden
  Abschnitte auf der Karte hervor.
- Vitest-Tests je Teilwert inklusive Randfälle (0 %, 100 %, leere Route).

Abnahme: Rennradprofil bewertet eine Asphaltroute deutlich höher als eine
Schotterroute, Gravelprofil umgekehrt; Klick auf eine Zeile hebt korrekt hervor.
```

**P3-4 Kandidatenberechnung und Nachranking**

```
Implementiere die Kandidatenberechnung – Tuning-Ebene 3.

- Backend: POST /api/route/candidates erzeugt mehrere Kandidaten aus
  (a) den Alternativrouten der Engine und (b) einem Parameterschwenk mit
  2 bis 3 Varianten (z. B. Steigungsbereitschaft ±0,2, Straßenmeidung ±0,15),
  alle parallel berechnet.
- Jeder Kandidat durchläuft Analyse und Bewertung; Sortierung nach Qualitätswert.
- Kandidatenfilter: Regeln, die Kandidaten ausschließen, allen voran der
  praktisch harte Landstraßenausschluss aus P1-6 (Schwellenwert konfigurierbar).
  Bleibt kein Kandidat übrig, verständliche Meldung mit Lockerungsvorschlag.
- Frontend: bester Kandidat durchgezogen, übrige gestrichelt mit Qualitätswert;
  Auswahl per Klick.

Abnahme: Für eine Beispielstrecke entstehen mindestens drei unterschiedliche
Kandidaten mit unterschiedlichen Werten; die Auswahl ist nachvollziehbar
begründet; der Landstraßenfilter greift nachweislich.
```

**P3-5 Kalibrierdurchlauf** – kein Programmierpaket, sondern Handarbeit mit dem Werkzeug aus P2-3: Referenztouren einpflegen, Parameter und Score-Gewichte justieren, Läufe vergleichen, Ergebnisse als Voreinstellungen festschreiben.

**Meilenstein nach Phase 3: Das Kernprodukt ist fertig.** Ab hier ist alles Weitere Erweiterung.

### Phasen 4 bis 6 – Kurzfassung

**P4-1** Punkte von Interesse aus der offenen Quelle: dreizehn Kategorien auf Attributmengen abbilden, Backend-Dienst mit kachelweisem Zwischenspeicher und Ausweichinstanz, Kartenlayer mit Gruppierung, Korridormodus entlang der Route mit Kilometerangabe.
**P4-2** Detailanreicherung auf Klick: minimale Feldauswahl, harte Mengenbegrenzung in der Anbieterkonsole, Speicherung höchstens dreißig Tage mit automatischer Löschung, Quellenangabe, Funktionsschalter. Vor der Umsetzung die dann gültigen Nutzungsbedingungen prüfen.
**P4-3** optional: Spuren-Overlay als reiner Anzeigelayer.
**P5-1** Mitteleuropa-Aufbau über dieselbe Pipeline: Regionskonfiguration umstellen, Rohdaten zusammenfügen, Aufbau im Aufbau-Profil starten, Höhen-Rohdaten danach löschen.
**P5-2** Bauumgebung für Anpassungen der Kostenfunktion vorbereiten: Quellcode-Abbild, eigenes Container-Abbild, Patchsatz gegen eine feste Version, dokumentierter Ablauf. Noch keine inhaltliche Änderung.
**P5-3** Eigene Popularitätsebene über Weg B: Tourenarchiv einlesen, Spuren den Graphkanten zuordnen, Häufigkeit aggregieren, als Attribut in die Rohdaten schreiben, Kostenfunktion um einen Popularitätsfaktor erweitern, Regler in der Oberfläche, Anzeigelayer.
**P5-4** Eigener flächendeckender Untergrund-Kachelsatz mit Planetiler; ersetzt die Übergangslösung L5 als Flächendarstellung.
**P6-1** KI-Add-on: Agent mit vier Werkzeugen, höchstens vier Durchläufe, Fortschrittsanzeige, Obergrenzen und Verbrauchszähler; Ergebnis ist eine bearbeitbare Wegpunktliste.
**P6-2** optional Serverbetrieb: dieselbe Verbunddefinition, Zugangsschutz und Verschlüsselung aktivieren, Sicherung und Überwachung ergänzen.

---

## Teil F – Häufige Stolpersteine

| Symptom | Ursache | Lösung |
|---|---|---|
| Routing meldet, ein Punkt sei nicht gefunden | Koordinate außerhalb des aufgebauten Bereichs oder zu weit vom Wegenetz entfernt | Region prüfen; Suchradius der Punktzuordnung erhöhen |
| Harte Ausschlüsse werden ignoriert, nur eine Warnung kommt zurück | Freigabe in der Dienstkonfiguration fehlt | `allow_hard_exclusions` setzen, Container neu starten |
| Route über 400 km schlägt ab | Höchstdistanz der Dienstgrenzen zu niedrig | Höchstdistanz für Fahrrad erhöhen, Container neu starten |
| Graphaufbau bricht ohne klare Meldung ab | Arbeitsspeicher erschöpft | Bei Windows das WSL-Speicherlimit erhöhen; kleinere Region; Auslagerung erlauben |
| Container baut den Graphen bei jedem Start neu | Rohdaten oder Prüfsumme haben sich geändert, oder die Option zum Weiterverwenden fertiger Kacheln fehlt | `use_tiles_ignore_pbf` im Betriebsprofil setzen |
| Kartenkacheln laden nicht, Konsole zeigt Blockade | Sicherheitsregeln des Webservers oder falsche Adresse | Regeln in der Caddy-Konfiguration prüfen, Adressen genau übernehmen |
| Höhenprofil ist stufig oder verrauscht | Glättung fehlt oder Abtastung zu grob | Median-Glättung prüfen, Abtastabstand verringern |
| Agent erfindet Endpunkte oder Feldnamen | fehlender Fachkontext in der Sitzung | Konzeptdokument zu Sitzungsbeginn benennen; Paket kleiner schneiden |
| Agent arbeitet Werkzeugaufrufe unzuverlässig ab | Eigenheit des alternativen Modellanbieters | Aufträge kleiner, Abnahmekriterien als Befehl formulieren, Zwischenstände häufiger sichern |
