# CyclePlanner – Katalog frei nutzbarer Kartenlayer (MapLibre GL JS)

> Stand: Recherche 2024/2025. Zusammenstellung frei verfügbarer Kartenmaterialien/Layer für Fahrrad-Routenplanung und -navigation in Deutschland/Europa.
>
> **Legende:**
> - **✓ sofort einbindbar** = Layer lässt sich direkt als XYZ-Tile-Source in Leaflet/MapLibre einbinden (ohne eigene Datenaufbereitung).
> - ⚠️ = Tile-URL vor Produktiveinsatz gegen die verlinkte Quelle verifizieren.
> - XYZ-Schema: `{z}` = Zoom, `{x}` = Spalte, `{y}` = Zeile; `{s}` = Subdomain (z. B. a/b/c).
>
> **Allgemeine Hinweise:**
> - Attribution (ODbL / CC-BY-SA) ist bei allen OSM-basierten Diensten Pflicht: „© OpenStreetMap-Mitwirkende" + Stil-Urheber.
> - Gemeinschafts-Tile-Server (OSM Carto, CyclOSM, OpenTopoMap, Waymarked, OpenRailwayMap, ÖPNVKarte, OpenSeaMap, OpenSnowMap) haben strikte Usage-Policies → für den Produktivbetrieb selbst hosten (PMTiles / OpenFreeMap / MapLibre-Server).
> - Strava Global Heatmap ist NICHT frei einbindbar (Lizenz); OpenTraffic ist EINGESTELLT; Windy-Tiles nur bezahlt.
> - D-Netz, EuroVelo, Sonny LiDAR, Copernicus DEM, Corine, Esri Landcover sind Download-Daten (GPX/GeoJSON/COG) → einmalig in PMTiles/GeoJSON konvertieren und über Caddy ausliefern (kein API-Key im Frontend, passt zur lokalen CyclePlanner-Architektur).

---

## Basemaps

### 1. OpenStreetMap Standard („OSM Carto")
- **Name:** OpenStreetMap Standard (OSM Carto)
- **Kategorie:** Basemap
- **Beschreibung:** Der klassische OSM-Kartenstil; gute Referenz-Basemap mit Straßen, Radwegen und POIs.
- **Tile-URL:** `https://tile.openstreetmap.org/{z}/{x}/{y}.png` — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** ODbL 1.0; Attribution „© OpenStreetMap-Mitwirkende" zwingend. Strenge Nutzungsrichtlinie (kein massenhafter/kommerzieller Abruf — für Produktion selbst hosten).
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap
- **Quelle:** https://operations.osmfoundation.org/policies/tiles/

### 2. OpenStreetMap Deutschland-Stil („German Style")
- **Name:** OpenStreetMap DE (German Style)
- **Kategorie:** Basemap
- **Beschreibung:** OSM-Karte mit deutschen Labels/Gegebenheiten (u. a. Radwege-Beschriftung); gute deutschsprachige Basemap.
- **Tile-URL:** `https://tile.openstreetmap.de/{z}/{x}/{y}.png` — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** ODbL; Attribution OSM. Von FOSSGIS betrieben.
- **Abdeckung:** Weltweit (deutsche Darstellung)
- **Geeignet als:** Basemap
- **Quelle:** https://www.openstreetmap.de/karte.html

### 3. OpenTopoMap
- **Name:** OpenTopoMap
- **Kategorie:** Basemap (Topo)
- **Beschreibung:** Topografische Karte mit Hillshade, Höhenlinien und Wegenetzen (OSM + SRTM) — sehr nützlich für Touren mit Relief.
- **Tile-URL:** `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` (s = a/b/c) — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** CC-BY-SA; Attribution „Kartendaten © OpenStreetMap-Mitwirkende, SRTM | Kartenstil © OpenTopoMap (CC-BY-SA)". Eigenes Nutzungslimit (geringe Last ok, Massenabruf verboten).
- **Abdeckung:** Weltweit (Europa besonders gut)
- **Geeignet als:** Basemap (Relief/Hillshade ist eingebacken, nicht separat)
- **Quelle:** https://opentopomap.org/

### 4. CyclOSM
- **Name:** CyclOSM
- **Kategorie:** Basemap (Fahrrad)
- **Beschreibung:** Fahrradorientierter OSM-Stil: hebt Radwege, Fahrradstraßen, Surface/Belag, Steigungen, Radrouten und Fahrrad-POIs hervor. Die wichtigste freie Fahrrad-Basemap.
- **Tile-URL:** `https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png` (s = a/b/c) — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** CC-BY-SA 4.0; Attribution OSM + CyclOSM. Kostenlos, keine Registrierung; für Produktion evtl. selbst hosten.
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap (oder Overlay über heller Basemap)
- **Quelle:** https://www.cyclosm.org/ · https://github.com/cyclosm/cyclosm-cartocss-style

### 5. OpenCycleMap (Thunderforest)
- **Name:** OpenCycleMap (Thunderforest)
- **Kategorie:** Basemap (Fahrrad)
- **Beschreibung:** Klassische Fahrradkarte (Surface, Radrouten, Steigungen, Konturlinien). Bekannteste kommerziell gehostete Fahrradkarte.
- **Tile-URL:** `https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=DEIN_KEY` — **✓ sofort einbindbar** (mit API-Key)
- **Lizenz/Nutzung:** Kostenlos mit API-Key bis 150.000 Tiles/Monat; Attribution „Maps © Thunderforest, Data © OpenStreetMap contributors" zwingend. Darüber kostenpflichtig.
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap
- **Quelle:** https://www.thunderforest.com/maps/opencyclemap/ · https://www.thunderforest.com/docs/raster-sources-api/

### 6. Thunderforest Outdoor / Landscape / Transport
- **Name:** Thunderforest Outdoor / Landscape / Transport
- **Kategorie:** Basemap
- **Beschreibung:** Outdoor-/Landschafts-/Verkehrs-Varianten als Ergänzung (z. B. Transport zeigt Bahn/ÖPNV für Bike+Ride).
- **Tile-URL:** `https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=…` (analog `landscape`, `transport`) — **✓ sofort einbindbar** (mit API-Key)
- **Lizenz/Nutzung:** Wie OpenCycleMap (kostenlos mit Key, Attribution).
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap
- **Quelle:** https://www.thunderforest.com/maps/

### 7. OpenFreeMap (Vektor)
- **Name:** OpenFreeMap
- **Kategorie:** Basemap (Vektor)
- **Beschreibung:** Kostenlose, keylose Vektor-Kacheln + fertige Styles (Liberty, Bright, Positron, Dark) inkl. POI- und Straßen-Layer — ideal zum Selbst-Stylen von Fahrradinfos.
- **Tile-URL (Style-JSON):** `https://tiles.openfreemap.org/styles/liberty` (bzw. `bright`, `positron`, `dark`) — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** Frei, kein Key; ODbL-Daten; Usage-Policy vorhanden (Selbsthosting möglich).
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap (Vektor, in MapLibre als `style`-URL)
- **Quelle:** https://openfreemap.org/ · https://simonwillison.net/2024/Sep/28/openfreemap/

### 8. Protomaps (PMTiles/Vektor)
- **Name:** Protomaps Basemap
- **Kategorie:** Basemap (Vektor)
- **Beschreibung:** Open-Source-Basemap als PMTiles oder gehostete Vektor-Tiles; sehr leichtgewichtig, gut für lokale/offline Nutzung (passt zur CyclePlanner-Architektur).
- **Tile-URL:** `https://api.protomaps.com/tiles/v3/{z}/{x}/{y}.mvt?key=DEIN_KEY` (kostenlose Stufe) oder eigenes `protomaps_basemap.pmtiles` — **✓ sofort einbindbar** (mit Key bzw. eigener Datei)
- **Lizenz/Nutzung:** Kostenlos mit Key (Nutzungslimits); Daten ODbL (OSM). Open-Source-Generierung.
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap (auch als lokale PMTiles-Datei via Caddy)
- **Quelle:** https://protomaps.com/ · https://docs.protomaps.com/pmtiles/maplibre

### 9. Stadia Maps – Stamen Terrain / Toner / Watercolor
- **Name:** Stadia Maps (Stamen Terrain / Toner / Watercolor)
- **Kategorie:** Basemap
- **Beschreibung:** Terrain (Hillshade+Höhenlinien), Toner (schwarz/weiß, kontrastreich), Watercolor — beliebte stilvolle Basemaps.
- **Tile-URL:** `https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.png` (analog `stamen_toner`, `stamen_watercolor`; API-Key nötig) — **✓ sofort einbindbar** (mit API-Key)
- **Lizenz/Nutzung:** Kostenlose Stufe mit API-Key + Attribution „© Stadia Maps © Stamen Design © OpenMapTiles © OpenStreetMap contributors".
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap
- **Quelle:** https://docs.stadiamaps.com/map-styles/stamen-terrain/ · https://docs.stadiamaps.com/guides/migrating-from-stamen-map-tiles/

### 10. CARTO Basemaps (Positron / Dark Matter / Voyager)
- **Name:** CARTO Basemaps (Positron / Dark Matter / Voyager)
- **Kategorie:** Basemap
- **Beschreibung:** Helle/dunkle neutrale Basemaps, gut als Unterlage für farbige Overlays.
- **Tile-URL:** `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png` (s = a–d; `dark_all`, `rastertiles/voyager` Varianten) — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** Kostenlos mit Attribution „© OpenStreetMap contributors © CARTO"; kommerzielle Nutzung erlaubt, Fair-Use.
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap
- **Quelle:** https://carto.com/basemaps/

---

## Fahrradinfrastruktur

### 11. Waymarked Trails – Cycling
- **Name:** Waymarked Trails Cycling
- **Kategorie:** Fahrradinfrastruktur (Overlay)
- **Beschreibung:** Zeigt markierte Radrouten (EuroVelo, D-Netz, regionale/lokale Radwege) aus OSM-Routenrelationen als halbtransparentes Overlay.
- **Tile-URL:** `https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png` (Singular-`tile`-Host, verifiziert 2026-08) — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** CC-BY-SA; Attribution OSM + Waymarked Trails. Kostenlos.
- **Abdeckung:** Weltweit (Routen dort, wo in OSM gemappt)
- **Geeignet als:** Overlay
- **Quelle:** https://cycling.waymarkedtrails.org/ · https://github.com/waymarkedtrails/waymarkedtrails-website

### 12. Waymarked Trails – MTB
- **Name:** Waymarked Trails MTB
- **Kategorie:** Fahrradinfrastruktur (Overlay)
- **Beschreibung:** Variante für Mountainbike-Routen (Singletrails, MTB-Skalen).
- **Tile-URL:** `https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png` (Singular-`tile`-Host, verifiziert) — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** CC-BY-SA; Attribution.
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay
- **Quelle:** https://mtb.waymarkedtrails.org/

### 13. CycleStreets (UK Fahrradkarte)
- **Name:** CycleStreets
- **Kategorie:** Fahrradinfrastruktur / Basemap
- **Beschreibung:** Britische Fahrradkarte (OpenCycleMap-Rendering + eigene CycleStreets-Karte) mit starker Radweg-Detaillierung; in D vor allem als Stil-Referenz nützlich.
- **Tile-URL:** `https://tile.cyclestreets.net/opencyclemap/{z}/{x}/{y}.png` ⚠️ (eigener Stil: `…/cyclestreets/{z}/{x}/{y}.png`) — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** ODbL (OSM-Daten); freie Nutzung mit Attribution, UK-Fokus.
- **Abdeckung:** Großbritannien (global eingeschränkt)
- **Geeignet als:** Overlay/Basemap (UK)
- **Quelle:** https://www.cyclestreets.net/about/

### 14. Radnetz Deutschland / D-Netz (Daten)
- **Name:** Radnetz Deutschland / D-Netz
- **Kategorie:** Fahrradinfrastruktur
- **Beschreibung:** Offizielles D-Routen-Netz als GPX/GeoJSON-Download — als GeoJSON-Overlay in MapLibre einbindbar (kein Tile-Service).
- **Tile-URL:** — (Download-Quelle: https://www.radnetz-deutschland.de/EN/Service/Downloads/downloads_node.html)
- **Lizenz/Nutzung:** Kostenlos (Behörden-Daten), Nutzungsbedingungen beachten.
- **Abdeckung:** Deutschland
- **Geeignet als:** Overlay (GeoJSON, selbst geladen)
- **Quelle:** https://pro.eurovelo.com/news/2022-08-30_german-national-cycling-network-s-gpx-tracks-are-now-available

### 15. EuroVelo (Daten)
- **Name:** EuroVelo
- **Kategorie:** Fahrradinfrastruktur
- **Beschreibung:** 17 europäische Fernradrouten als GPX/GeoJSON — als Overlay einbindbar.
- **Tile-URL:** — (Download-Quelle: https://en.eurovelo.com/ , Downloads pro Route)
- **Lizenz/Nutzung:** Kostenlos für nicht-kommerzielle Nutzung (EuroVelo-Regeln prüfen).
- **Abdeckung:** Europa
- **Geeignet als:** Overlay (GeoJSON)
- **Quelle:** https://en.eurovelo.com/

### 16. Fahrrad-Overlays via Vektor (custom)
- **Name:** Custom Fahrrad-Overlay (Vektor)
- **Kategorie:** Fahrradinfrastruktur (custom)
- **Beschreibung:** Fahrradstraßen, Radverkehrsanlagen, Surface lassen sich am präzisesten aus Vektor-Kacheln (OpenFreeMap/OpenMapTiles) als eigenes Overlay rendern — Layer `transportation`/`road`/`surface`.
- **Tile-URL:** — (Vektor-Style auf Basis OpenFreeMap/OpenMapTiles)
- **Lizenz/Nutzung:** ODbL (Daten).
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay (Vektor-Style)
- **Quelle:** https://openmaptiles.org/schema/

---

## Höhen & Steigung

### 17. AWS Open Data Terrain Tiles – Terrarium
- **Name:** AWS Terrain Tiles (Terrarium)
- **Kategorie:** Höhen & Steigung
- **Beschreibung:** Weltweite Höhendaten (Mapzen/Terrarium-Encoding), als DEM-Quelle für MapLibre `hillshade`/3D-Terrain.
- **Tile-URL:** `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** Offene Daten (Zusammenstellung offener Quellen); kostenlos, kein Key.
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay/DEM (Raster-DEM für Terrain & Hillshade)
- **Quelle:** https://geodataviewer.com/datasets/dem/aws-elevation-tiles/

### 18. AWS Open Data Terrain Tiles – Terrain RGB
- **Name:** AWS Terrain Tiles (Terrarium / Terrain RGB)
- **Kategorie:** Höhen & Steigung
- **Beschreibung:** MapLibre-natives Terrain-RGB-Format (Mapbox-Encoding) für 3D-Gelände.
- **Tile-URL:** ⚠️ **Korrektur (verifiziert 2026-08):** Im freien Bucket `elevation-tiles-prod` existiert NUR `terrarium/{z}/{x}/{y}.png` (Terrarium-Encoding) und `normal/` (Graustufen-Hillshade) — der `terrainrgb/`-Prefix liefert 404. Mapbox-Terrain-RGB ist ein separater, tokenpflichtiger Dienst. Für 3D-Gelände daher: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` mit Encoding `terrarium` — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** Offene Daten; kostenlos.
- **Abdeckung:** Weltweit
- **Geeignet als:** DEM-Quelle (MapLibre `terrain`-Source)
- **Quelle:** https://github.com/jo-chemla/terrain-viewer

### 19. Esri World Hillshade
- **Name:** Esri World Hillshade
- **Kategorie:** Höhen & Steigung (Hillshade)
- **Beschreibung:** Globale Schummerung/Hillshade als Overlay — zeigt Relief/Steigung, ideal über Basemap gelegt.
- **Tile-URL:** `https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}` — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** Esri-Nutzungsbedingungen (kostenlos mit Attribution, kein Key); keine Weiterverteilung der Rohdaten.
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay (Hillshade)
- **Quelle:** https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer

### 20. Esri World Hillshade Dark
- **Name:** Esri World Hillshade Dark
- **Kategorie:** Höhen & Steigung (Hillshade)
- **Beschreibung:** Wie oben, dunkle Variante für hellere Basemaps.
- **Tile-URL:** `https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}` — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** Esri-Nutzungsbedingungen.
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay (Hillshade)
- **Quelle:** https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade_Dark/MapServer

### 21. Sonny's LiDAR DTM („Sonny4")
- **Name:** Sonny's LiDAR DTM (Sonny4)
- **Kategorie:** Höhen & Steigung
- **Beschreibung:** Hochauflösende digitale Geländemodelle (LiDAR) für Europa — exzellent für präzise Steigungs-/Höhenprofile.
- **Tile-URL:** — (Download-Quelle: https://sonny.4lima.de/ , Cloud-Optimized GeoTIFF/COG)
- **Lizenz/Nutzung:** CC BY 4.0; frei, Namensnennung.
- **Abdeckung:** Europa (viele Länder, 1 m–30 m)
- **Geeignet als:** Datenquelle — selbst als PMTiles/Terrain-RGB konvertieren, dann DEM-Overlay
- **Quelle:** https://sonny.4lima.de/

### 22. Copernicus DEM (GLO-30) / EU-DEM
- **Name:** Copernicus DEM (GLO-30) / EU-DEM
- **Kategorie:** Höhen & Steigung
- **Beschreibung:** 30-m-DEM Europas (Copernicus) — Grundlage für eigene Terrain-/Hillshade-Kacheln.
- **Tile-URL:** — (Download-Quelle: https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model , Registrierung)
- **Lizenz/Nutzung:** Kostenlos (Copernicus-Lizenz); keine Tiles — Download.
- **Abdeckung:** Europa (weltweit via GLO-30)
- **Geeignet als:** Datenquelle → selbst hosten
- **Quelle:** https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model

### 23. MapTiler Terrain RGB
- **Name:** MapTiler Terrain RGB
- **Kategorie:** Höhen & Steigung
- **Beschreibung:** Fertige Terrain-RGB-Kacheln (global) für MapLibre-3D-Terrain.
- **Tile-URL:** `https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.png?key=DEIN_KEY` ⚠️ — **✓ sofort einbindbar** (mit API-Key)
- **Lizenz/Nutzung:** Kostenlose Stufe mit API-Key (MapTiler-Konto), Attribution.
- **Abdeckung:** Weltweit
- **Geeignet als:** DEM-Quelle
- **Quelle:** https://www.maptiler.com/maps/#elevation

### 24. OpenTopoMap (Hillshade/Höhenlinien, eingebacken)
- **Name:** OpenTopoMap (Relief)
- **Kategorie:** Höhen & Steigung
- **Beschreibung:** Relief (Hillshade + Höhenlinien) ist Teil der OpenTopoMap-Basemap; als „Steigungs-Anzeige" nutzbar, aber nicht separat kachelbar.
- **Tile-URL:** — (siehe Basemap #3)
- **Lizenz/Nutzung:** CC-BY-SA.
- **Abdeckung:** Weltweit
- **Geeignet als:** via Basemap #3
- **Quelle:** https://opentopomap.org/

---

## Oberfläche/Belag (Surface / Smoothness)

### 25. CyclOSM (Surface/Belag)
- **Name:** CyclOSM (Surface/Belag)
- **Kategorie:** Oberfläche/Belag
- **Beschreibung:** Rendert Wegoberfläche (asphaltiert, Pflaster, Schotter, unbefestigt) und Wegeklassen farblich — wichtigste freie Belag-Darstellung.
- **Tile-URL:** siehe Basemap #4 — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** CC-BY-SA 4.0.
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap/Overlay
- **Quelle:** https://www.cyclosm.org/

### 26. OpenCycleMap (Surface/Belag)
- **Name:** OpenCycleMap (Surface/Belag)
- **Kategorie:** Oberfläche/Belag
- **Beschreibung:** Zeigt ebenfalls Belag/Surface farblich plus Höhenlinien.
- **Tile-URL:** siehe Basemap #5 — **✓ sofort einbindbar** (mit API-Key)
- **Lizenz/Nutzung:** Thunderforest (kostenlos mit Key).
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap
- **Quelle:** https://www.thunderforest.com/maps/opencyclemap/

### 27. Custom Surface-Overlay (Vektor)
- **Name:** Custom Surface-Overlay (Vektor)
- **Kategorie:** Oberfläche/Belag
- **Beschreibung:** Eigener Belag/Smoothness-Layer aus OpenMapTiles/OpenFreeMap-Vektor-Kacheln (Felder `surface`, `smoothness` in `transportation`/`road`) — exakt steuerbar.
- **Tile-URL:** — (Vektor-Style auf Basis OpenFreeMap/OpenMapTiles)
- **Lizenz/Nutzung:** ODbL (Daten).
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay (custom Vektor-Style)
- **Quelle:** https://openmaptiles.org/schema/

---

## Verkehr

### 28. OpenTraffic (nicht mehr aktiv)
- **Name:** OpenTraffic
- **Kategorie:** Verkehr
- **Beschreibung:** Ehemalige offene Echtzeit-Verkehrsdaten-Plattform (2016–~2020). **Eingestellt** — hier nur als Hinweis, nicht mehr nutzbar.
- **Tile-URL:** — (eingestellt)
- **Lizenz/Nutzung:** — (nicht mehr verfügbar)
- **Abdeckung:** —
- **Geeignet als:** —
- **Quelle:** https://opentraffic.io/

### 29. OSM-Verkehrsklassen (in Basemaps)
- **Name:** OSM-Verkehrsklassen
- **Kategorie:** Verkehr
- **Beschreibung:** Straßenklassen/`highway=*` (u. a. zur Vermeidung stark befahrener Straßen) liefern die OSM-Basemaps (Carto, CyclOSM) bereits; kein separater freier globaler „Verkehrsdichte"-Tile existiert.
- **Tile-URL:** — (via Basemap)
- **Lizenz/Nutzung:** ODbL.
- **Abdeckung:** Weltweit
- **Geeignet als:** via Basemap
- **Quelle:** https://wiki.openstreetmap.org/wiki/Key:highway

### 30. Kommerzielle Verkehrs-Tiles (Hinweis)
- **Name:** Kommerzielle Verkehrs-Tiles (TomTom/Here/Mapbox Traffic)
- **Kategorie:** Verkehr
- **Beschreibung:** Echtzeit-Verkehrsdichte (Stau) gibt es nur kostenpflichtig. Für Radplanung meist nicht nötig; ggf. OSM-`maxspeed`-Layer aus Vektor-Kacheln.
- **Tile-URL:** — (kostenpflichtig)
- **Lizenz/Nutzung:** Kommerziell (API-Key, Kosten).
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay (nur kostenpflichtig)
- **Quelle:** —

---

## POI/ÖPNV

### 31. OpenRailwayMap
- **Name:** OpenRailwayMap
- **Kategorie:** POI/ÖPNV (Overlay)
- **Beschreibung:** Detaillierte Bahninfrastruktur (Strecken, Bahnhöfe, Signal/`maxspeed`-Layer) — für Bike+Ride/Bahnanbindung.
- **Tile-URL:** `https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png` (s = a/b/c; Varianten `maxspeed`, `signals`) — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** CC-BY-SA; Attribution OSM + OpenRailwayMap. Kostenlos.
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay
- **Quelle:** https://www.openrailwaymap.org/ · https://stackoverflow.com/questions/79379395/how-to-use-leaflet-js-with-openrailwaymap/79390379

### 32. ÖPNVKarte
- **Name:** ÖPNVKarte
- **Kategorie:** POI/ÖPNV (Overlay)
- **Beschreibung:** ÖPNV-Netz (Bus/Bahn/Stationen) als Overlay — für Bike+Ride-Verbindungen.
- **Tile-URL:** `https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png` ⚠️ — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** ODbL; Attribution OSM + memomaps. Kostenlos, geringe Last.
- **Abdeckung:** Weltweit (ÖPNV)
- **Geeignet als:** Overlay
- **Quelle:** https://www.öpnvkarte.de/

### 33. OpenSeaMap
- **Name:** OpenSeaMap
- **Kategorie:** POI/Natur (Overlay)
- **Beschreibung:** Gewässer/Seekarte (Seamarks, Fähren, Häfen) — nützlich für Touren an Küsten/Flüssen und Fährverbindungen.
- **Tile-URL:** `https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png` — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** CC-BY-SA; Attribution OSM + OpenSeaMap.
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay
- **Quelle:** http://openseamap.org/

### 34. OpenPOIMap / POI-Overlays (Vektor)
- **Name:** OpenPOIMap / POI-Overlays (Vektor)
- **Kategorie:** POI
- **Beschreibung:** POIs (Fahrradläden, Werkstätten, Luftpumpen, Trinkwasser, Ladestationen, Camping) kommen aus OSM — am flexibelsten als eigener POI-Layer aus OpenMapTiles/OpenFreeMap-Vektor-Kacheln oder per Overpass-Abfrage.
- **Tile-URL:** — (Vektor-Style bzw. Overpass-Abfrage)
- **Lizenz/Nutzung:** ODbL (Daten).
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay (custom)
- **Quelle:** https://openmaptiles.org/ · https://wiki.openstreetmap.org/wiki/Overpass_API

### 35. OpenChargeMap (Ladestationen, API)
- **Name:** OpenChargeMap
- **Kategorie:** POI
- **Beschreibung:** Ladestationen-Datenbank (inkl. `amenity=charging_station`) mit kostenloser API → als GeoJSON-Punkte rendern.
- **Tile-URL:** — (API: https://openchargemap.org/site/develop/api , GeoJSON)
- **Lizenz/Nutzung:** Kostenlos mit API-Key (CC-BY-SA Datenanteile).
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay (GeoJSON)
- **Quelle:** https://openchargemap.org/

### 36. Overpass Turbo / Overpass API
- **Name:** Overpass API / Overpass Turbo
- **Kategorie:** POI
- **Beschreibung:** Gezielte OSM-Abfragen für beliebige POIs (Trinkwasser `amenity=drinking_water`, Schutzhütten, Bett+Bike `tourism=*`) — als GeoJSON-Layer.
- **Tile-URL:** — (API-Abfrage, GeoJSON)
- **Lizenz/Nutzung:** ODbL.
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay (GeoJSON, backend-seitig abfragen)
- **Quelle:** https://overpass-turbo.eu/

---

## Natur/Landschaft

### 37. Esri 2020 Global Land Cover
- **Name:** Esri Land Cover (Sentinel-2 10 m)
- **Kategorie:** Natur/Landschaft (Landcover)
- **Beschreibung:** 10-m-Landnutzung/-bedeckung (Wald, Wasser, urban, Acker …) — für Landschafts-/Naturdarstellung.
- **Tile-URL:** ⚠️ **Korrektur (verifiziert 2026-08):** Der alte Tile-Service ist abgeschaltet; aktuell läuft der dynamische ImageServer „Sentinel-2 10m Land Use/Land Cover Time Series" (Impact Observatory/Microsoft/Esri) ohne Kachel-Cache. Einbindung per exportImage: `https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png&f=image` — **✓ sofort einbindbar** (≈ Zoom 15)
- **Lizenz/Nutzung:** CC BY 4.0 (Daten); kostenlos.
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay
- **Quelle:** https://livingatlas.arcgis.com/landcover/

### 38. Corine Land Cover (CLC)
- **Name:** Corine Land Cover (CLC)
- **Kategorie:** Natur/Landschaft (Landcover)
- **Beschreibung:** Europäische Landbedeckung (Wälder, Gewässer, Siedlung, Schutzgebiete) — für Landschaftskontext.
- **Tile-URL:** — (Download: https://land.copernicus.eu/en/products/corine-land-cover )
- **Lizenz/Nutzung:** Kostenlos (Copernicus), keine Tiles — Download.
- **Abdeckung:** Europa
- **Geeignet als:** Datenquelle → Overlay
- **Quelle:** https://land.copernicus.eu/en/products/corine-land-cover

### 39. Stadia Maps – Global Landcover Tileset
- **Name:** Stadia Maps Global Landcover
- **Kategorie:** Natur/Landschaft (Landcover)
- **Beschreibung:** Fertige Landcover-Vektor-Kacheln (global) als Overlay — einfach in MapLibre einzubinden.
- **Tile-URL:** Stadia-`data/landcover`-Tileset (API-Key) ⚠️ — **✓ sofort einbindbar** (mit API-Key)
- **Lizenz/Nutzung:** Kostenlose Stufe mit Key.
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay
- **Quelle:** https://docs.stadiamaps.com/tutorials/incorporating-global-landcover-tiles-maplibre/

### 40. OpenSnowMap (Pistes)
- **Name:** OpenSnowMap (Pistes)
- **Kategorie:** Natur/Sonstiges (Overlay)
- **Beschreibung:** Winter-/Pistenkarte (auch für Winter-Radtouren/Skitouren-Kontext) mit Pisten, Loipen, Liften.
- **Tile-URL:** `https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png` — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** CC-BY-SA; Attribution OSM + OpenSnowMap.
- **Abdeckung:** Weltweit (Wintergebiete)
- **Geeignet als:** Overlay
- **Quelle:** https://www.opensnowmap.org/

---

## Satellit/Luftbild

### 41. Esri World Imagery
- **Name:** Esri World Imagery
- **Kategorie:** Satellit/Luftbild
- **Beschreibung:** Globales Satelliten-/Luftbild-Mosaik — als Luftbild-Basemap.
- **Tile-URL:** `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** Esri-Nutzungsbedingungen (kostenlos mit Attribution, kein Key); keine Weiterverteilung der Kacheln.
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap (Satellit)
- **Quelle:** https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9

### 42. EOX Sentinel-2 Cloudless
- **Name:** EOX Sentinel-2 Cloudless
- **Kategorie:** Satellit/Luftbild
- **Beschreibung:** Wolkenfreies Sentinel-2-Mosaik (10 m) — sehr gute frei nutzbare Satellitenkarte.
- **Tile-URL:** WMS `https://tiles.maps.eox.at/wms?service=wms&request=getmap&layers=s2cloudless_3857&…` bzw. WMTS (2023-Update, s2maps-tiles.eu) ⚠️ — **✓ sofort einbindbar** (als WMS/WMTS-Source)
- **Lizenz/Nutzung:** CC BY 4.0 (Sentinel-2-Daten); Attribution EOX/ESA.
- **Abdeckung:** Weltweit
- **Geeignet als:** Basemap (Satellit)
- **Quelle:** https://s2maps.eu/ · https://josm.openstreetmap.de/ticket/23895

### 43. OpenAerialMap (OAM)
- **Name:** OpenAerialMap (OAM)
- **Kategorie:** Satellit/Luftbild
- **Beschreibung:** Offene Luftbilder (Drohnen, Community, HOT) — sehr hohe Auflösung, aber lückenhaft.
- **Tile-URL:** `https://tiles.openaerialmap.org/4.1/{z}/{x}/{y}.png` ⚠️ (besser über OAM-API/Katalog je Bild) — **✓ sofort einbindbar** (punktuell)
- **Lizenz/Nutzung:** CC BY 4.0 (je Bild); kostenlos.
- **Abdeckung:** Weltweit, unregelmäßig
- **Geeignet als:** Overlay (punktuell)
- **Quelle:** https://openaerialmap.org/about/ · http://openaerialmap.org/legal/

### 44. DOP / Digitale Orthophotos (Landesämter)
- **Name:** DOP (Digitale Orthophotos)
- **Kategorie:** Satellit/Luftbild
- **Beschreibung:** Amtliche Luftbilder der Bundesländer (z. B. NRW, Bayern) als WMS — sehr hochauflösend, aber lokal und je Bundesland.
- **Tile-URL:** — (WMS, z. B. https://www.wms.nrw.de/geobasis/wms_nw_dop , https://geoportal.bayern.de/ )
- **Lizenz/Nutzung:** Kostenlos (Datenlizenz Deutschland, je Land), meist WMS.
- **Abdeckung:** Deutschland (je Bundesland)
- **Geeignet als:** Overlay/Basemap (via WMS)
- **Quelle:** https://www.wms.nrw.de/ · https://geoportal.bayern.de/

---

## Wetter

### 45. OpenWeatherMap Weather Tiles
- **Name:** OpenWeatherMap Weather Tiles
- **Kategorie:** Wetter
- **Beschreibung:** Wetter-Layer (Niederschlag `precipitation_new`, Wolken `clouds_new`, Temperatur `temp_new`, Wind `wind_new`) als Overlay.
- **Tile-URL:** `https://tile.openweathermap.org/map/{layer}/{z}/{x}/{y}.png?appid=DEIN_KEY` — **✓ sofort einbindbar** (mit API-Key)
- **Lizenz/Nutzung:** Kostenlos mit API-Key (Free-Tier-Limits); Attribution OpenWeather.
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay
- **Quelle:** https://openweathermap.org/api/weathermaps

### 46. RainViewer
- **Name:** RainViewer
- **Kategorie:** Wetter
- **Beschreibung:** Echtzeit-Regenradar (animierte Frames) — frei und ohne teuren Key, gut für Tourenplanung.
- **Tile-URL:** `https://tilecache.rainviewer.com/v2/radar/{timestamp}/256/{z}/{x}/{y}/2/1_1.png` ⚠️ (Frames via API `https://api.rainviewer.com/public/weather-maps.json`) — **✓ sofort einbindbar**
- **Lizenz/Nutzung:** Kostenlos (Free-Tier), Attribution erwünscht.
- **Abdeckung:** Weltweit
- **Geeignet als:** Overlay
- **Quelle:** https://www.rainviewer.com/api/weather-maps-api.html

### 47. Windy (nicht frei als Tiles)
- **Name:** Windy
- **Kategorie:** Wetter
- **Beschreibung:** Wind-/Wetterdarstellung; Tiles nur über bezahlte Lizenz — **nicht frei einbindbar**. (Hinweis, kein Layer.)
- **Tile-URL:** — (kostenpflichtig)
- **Lizenz/Nutzung:** Kommerziell.
- **Abdeckung:** Weltweit
- **Geeignet als:** —
- **Quelle:** https://www.windy.com/

---

## Sonstiges

### 48. OpenAndroMaps / Elevate / Elevate4MTB
- **Name:** OpenAndroMaps (Elevate / Elevate4MTB)
- **Kategorie:** Sonstiges (Referenz)
- **Beschreibung:** Fahrrad-/MTB-Wanderkarten mit Höhenlinien & Wegen (mapsforge) — primär offline/Android, aber als Vorlage für eigene Kartenstile relevant; nicht direkt als Web-Tiles.
- **Tile-URL:** — (Download: https://www.openandromaps.org/ )
- **Lizenz/Nutzung:** CC-BY-SA (Karten), frei.
- **Abdeckung:** Weltweit (Schwerpunkt Europa)
- **Geeignet als:** Referenz/Offline
- **Quelle:** https://www.openandromaps.org/ · https://gitlab.com/winni/elevate

### 49. OpenFietsMap
- **Name:** OpenFietsMap
- **Kategorie:** Sonstiges
- **Beschreibung:** Fahrradoptimierte Garmin-Karten (offline) — Alternative/Referenz für Routing-Karten, keine Web-Tiles.
- **Tile-URL:** — (Download: https://www.openfietsmap.nl/ )
- **Lizenz/Nutzung:** CC-BY-SA (OSM-Daten).
- **Abdeckung:** Europa (Schwerpunkt Benelux/D)
- **Geeignet als:** Referenz/Offline
- **Quelle:** https://www.openfietsmap.nl/

### 50. BBBike
- **Name:** BBBike
- **Kategorie:** Sonstiges (Werkzeug/Daten)
- **Beschreibung:** OSM-Ausschnitt-Service (download.bbbike.org) + Karten-Vergleich (mc.bbbike.org) vieler Stile — gut zum Vergleichen/Auswählen von Fahrrad-Basemaps und für Regions-Extrakte (z. B. für Valhalla-Graphen).
- **Tile-URL:** — (Werkzeug/Datenquelle)
- **Lizenz/Nutzung:** ODbL (OSM-Daten).
- **Abdeckung:** Weltweit (Extrakte)
- **Geeignet als:** Werkzeug/Datenquelle
- **Quelle:** https://www.bbbike.org/ · https://download.bbbike.org/osm/

### 51. Geofabrik / OSM-Daten (Selbsthosting-Basis)
- **Name:** Geofabrik OSM-Extrakte
- **Kategorie:** Sonstiges (Daten)
- **Beschreibung:** Regionale OSM-Extrakte zum Selbst-Erzeugen beliebiger Layer (PMTiles/Terrain) — entspricht der CyclePlanner-Offline-Architektur.
- **Tile-URL:** — (Download: https://download.geofabrik.de/ )
- **Lizenz/Nutzung:** ODbL.
- **Abdeckung:** Weltweit (regionale Extrakte)
- **Geeignet als:** Datenquelle → Selbsthosting
- **Quelle:** https://download.geofabrik.de/

---

## Kurzübersicht: Top 5 Empfehlungen für CyclePlanner

| Priorität | Layer | Warum |
|---|---|---|
| 1 | **CyclOSM** (#4) | Beste freie Fahrrad-Basemap (Surface, Radwege, Steigung) |
| 2 | **OpenTopoMap** (#3) | Relief/Topo für Tourenplanung |
| 3 | **Waymarked Trails Cycling** (#11) | Radrouten (D-Netz/EuroVelo/regional) als Overlay |
| 4 | **AWS Terrain RGB + Esri Hillshade** (#18/#19) | 3D-Terrain & Steigungs-Anzeige |
| 5 | **OpenFreeMap/Protomaps** (#7/#8) | Vektor-Selbsthosting, offline-fähig (passt zur Architektur) |

---

## In CyclePlanner integriert (Stand: nach User-Auswahl)

Die Karte wurde auf **MapLibre GL** migriert; alle Ebenen sind datengetrieben in
`apps/web/src/layers/` definiert (`registry.ts` für Overlays, `basemaps.ts` für Basiskarten).
Das Ebenen-Panel ist thematisch gruppiert (Fahrradinfrastruktur, Höhen & Steigung,
Oberfläche & Belag, POI & ÖPNV, Natur & Landschaft, Wetter, Sonstiges) — ähnliche Karten
verschiedener Anbieter stehen direkt nebeneinander.

**Basiskarten (umschaltbar, Ebenen-Panel):** OSM Standard (Default), CyclOSM, OSM DE,
OpenTopoMap, CARTO Positron, Esri World Imagery (Satellit — bewusst das einzige
Satelliten-Modul, um das Bundle schlank zu halten; Sentinel-2/DOP-WMS sind dokumentiert,
aber nicht aktiv).

**Overlays:** Relief (OpenTopoMap), Radroutennetz (WaymarkedTrails), MTB-Routen
(WaymarkedTrails), D-Netz + EuroVelo (gebündelte GeoJSON in `apps/web/public/data/`),
Hillshade + Hillshade dunkel (Esri), 3D-Gelände (AWS Terrain RGB, echtes 3D-Relief),
Belag & Radwege (CyclOSM-Overlay), Bahn (OpenRailwayMap), ÖPNV-Netz (ÖPNVKarte), Seekarte
(OpenSeaMap), Landnutzung (Esri Land Cover), Winterkarte (OpenSnowMap), Regenradar
(RainViewer), GPX Tracks.

**POIs (im Ebenen-Panel zuschaltbar):** Supermärkte 🛒 und Badeseen 🏊 (größere Seen aus
OSM, mit Google-Places-Anreicherung inkl. Fotos über einen Backend-Photo-Proxy).

**Fahrprofil & Wetter:** Ø-Geschwindigkeit und optionale Startzeit; beim Setzen einer
Startzeit wird das Regenradar automatisch eingeblendet und zeigt den zur Startzeit
nächstgelegenen Radar-Frame (Vergangenheit + Nowcast-Prognose). Ohne Startzeit gilt
die aktuelle Zeit.

**Nicht frei umsetzbar / bewusst weggelassen:** Strava Heatmap (Lizenz), OpenTraffic
(eingestellt), Windy-Tiles (kostenpflichtig), Thunderforest/Stadia/MapTiler/OpenWeatherMap
(API-Key nötig — auf Wunsch später über Backend-Proxies nachrüstbar), Corine/Copernicus/
Sonny LiDAR (Download-Daten, Selbsthosting-Schritt noch offen).

### Verifizierte Luftbild-DOP-Dienste (aktuell bewusst inaktiv)

Wegen der „ein Satelliten-Modul"-Entscheidung sind die amtlichen Luftbilder nicht aktiv —
sie sind aber live verifiziert und können jederzeit als WMS-Overlay in `layers/registry.ts`
eingehängt werden (ein Eintrag mit `raster: { kind: 'wms', url: … }` genügt):

- **Sachsen (GeoSN, DOP20 RGB):**
  `https://geodienste.sachsen.de/wms_geosn_dop-rgb/guest?FORMAT=image/jpeg&VERSION=1.3.0&SERVICE=WMS&REQUEST=GetMap&LAYERS=sn_dop_020&STYLES=&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`
  (maxZoom ≈ 19, © GeoSN)
- **Sachsen-Anhalt (LVermGeo, DOP20):**
  `https://www.geodatenportal.sachsen-anhalt.de/wss/service/ST_LVermGeo_DOP_WMS_OpenData/guest?FORMAT=image/png&TRANSPARENT=TRUE&VERSION=1.3.0&SERVICE=WMS&REQUEST=GetMap&LAYERS=lsa_lvermgeo_dop20_2&STYLES=&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`
  (maxZoom ≈ 19, © GeoBasis-DE/LVermGeo LSA)
- **NRW (Geobasis NRW):**
  `https://www.wms.nrw.de/geobasis/wms_nw_dop?service=WMS&request=GetMap&version=1.3.0&layers=nw_dop_rgb&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=false`


