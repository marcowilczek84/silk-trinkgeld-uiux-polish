# SILK Trinkgeld V1.2 — Professional Workspace

Stand: 15.10.2026. Branch `tips-v12-professional-workspace-20261015`, Basis `62d3a48d2840f0fbc2113a183322c5d8f95ca73f`. Eigenständige Designphase, ausdrücklich vom Nutzer vor Abschluss des separaten Cloud-Rollouts beauftragt. Keine Production-Freigabe.

## Gesicherte Übernahme

GitHub fetch, vorhandene Branches und die Vercel-Deployments wurden neu geprüft. V1.1 ist der neueste gesicherte Trinkgeld-Stand. Production bleibt `16fab0e23fa58a0fb59d4c8b4c7aa66dbbb79440` / `dpl_AckEsRbZoAmihU4wmn7qEtbRrvMj`. Die V1.1-Preview `dpl_AARav7ujxeDYUqAyP86dXmPUZKfj` ist READY. `main` wurde nicht als Entwicklungsbasis verwendet.

Die Architektur bleibt Vanilla JS / esbuild mit lokalen Repositories, stabilen IDs und gemeinsamem Supabase-JSON-State. RLS für `tip_workspace_state` und `tip_workspace_members` wurde lesend bestätigt. Der vorbereitete `private.tip_integrity_write_guard()` ist weiterhin **nicht installiert**. Keine Supabase-Schreibaktionen, Migrationen, Richtlinienänderungen oder neuen Cloud-Testkonten in V1.2.

## UX/UI-Audit und Umsetzung

| Befund V1.1 | Umsetzung V1.2 |
| --- | --- |
| Mitarbeiter, Dienste und gespeicherte Abrechnungen nur hinter dem Menü erreichbar | Fünf direkte Bereiche: Erfassung, Abrechnung, Mitarbeiter, Dienste, Historie. Horizontal auf iPad/Desktop, beschriftete untere Navigation auf iPhone. |
| Schmale Verwaltungsleiste erschwert die Bearbeitung mehrerer Einträge | Bis 960 px breiter Dialog, klar getrennte Felder und dauerhaft erreichbare Aktionen. Mobile Einspaltigkeit. |
| Kleine Beschriftungen und konkurrierende Dienstfarben | Funktionale Sans, 16-px-Eingaben, kontrastreiche Feldrahmen, neutrale Dienstwahl. Ausgewählter Dienst bleibt als Text sichtbar. Farbwerte in Datensätzen bleiben unverändert. |
| Ergebnis zeigt gerundete Einzelwerte ohne klare Tabellenhierarchie | Separate Darstellung aus vorhandenen Rechenergebnissen: Gesamt, Service, Küche, Housekeeping sowie Anteil/Auszahlung je Mitarbeiter. Schweizer CHF-Format mit zwei Dezimalstellen; Auszahlung weiterhin unverändert auf ganze Franken gerundet. |
| Kein schneller Überblick über aktuellen Arbeitsstand | Echter Zeitraum, Summe der aktuell sichtbaren Eingaben und bestehende Entwurf-/Cloud-Statusmeldungen. Keine neuen Geschäftskennzahlen. |
| Verwaltung ohne Suchmöglichkeit | Lokale Suche blendet nur DOM-Zeilen aus. Beim Speichern werden weiterhin alle Zeilen durch V1.1 gelesen; kein Filtern des Datenbestands. |
| Uneinheitliche Dialoge und unklarer Fokus | Gemeinsame Rahmen, Typografie und Abstände; Escape-/Fokusbehandlung für Verwaltung und Import. Die bestehende Speichern/Verwerfen/Zurück-Entscheidung bleibt erhalten. |

Die neue Abrechnung ist eine schreibfreie Projektion. `#result` bleibt unverändert und wird weiterhin durch die bestehenden Funktionen erzeugt, archiviert und gedruckt. Historische HTML-Archive werden nicht umgeschrieben. Die neue Tabelle summiert ausschliesslich bereits berechnete Werte zur Anzeige; sie verteilt keine Beträge neu.

## Designsystem-Transfer

Verbindliche Quelle: **Ambassador Digital – Design System Master V1**, 14.10.2026, PDF und JSON-Verträge aus dem Dokumentationspaket. Das aktuelle Library-Dokument wurde verifiziert. Es handelt sich um dokumentierte Normen, nicht um neu erfundene Master-Tokens.

- Weiss `#FFFFFF`, Petrol `#1C777B`, Hover `#155F63`, Auswahl `#EDF6F6`, Surface `#F5F7F7`, Anthrazit `#202326`, Muted `#62686B`, Trennlinie `#E2E6E8`, Feldrahmen `#7E898F`, Fehler `#A33E3A`.
- Vorhandene lokale Noto Sans 400/600 für Funktionen. Echte Noto Serif Display Condensed Light Italic 300 ausschliesslich für den App-Titel, ohne synthetische Stauchung/Fettung. Original-SILK-Marke bleibt.
- Spacing-Skala 4/8/12/16/24/32; flache Arbeitsflächen; 4-px-Bedienelemente, 8-px-Dialoge. Outline-Icons 20 px / 1,75 px.
- Mindest-Touchflächen 44 px, sichtbarer Fokus, native Selects, reduzierte Bewegung. Telefon-Navigationslabels bewusst kompakt mit 13 px; „Team“ ist die kurze sichtbare Bezeichnung für „Mitarbeiter“, der zugängliche Name bleibt vollständig.
- Zahlentabellen auf iPad/Desktop; beschriftete Datenblöcke auf Telefon. Keine ausgeblendeten Beträge und kein globales Abschneiden horizontaler Überstände.

### Aktuell verifizierte Referenzen

| Quelle | Geprüfter Stand / übernommenes Prinzip |
| --- | --- |
| Ambassador Hub | Production `f2fb67cab6e46681f61a7d14be46a44f351a95c9`, READY. Editorial-Schrift, Originalmarke, ruhige Outline-Navigation; keine Foto-/Kacheldekoration im Finanzbereich. |
| SILK Inside | Preview `3df4685035f7d541feb967513581b2e1ae6cfbc3`, READY. Direkte Bereiche, klarer aktiver Zustand und erreichbare Verwaltung. |
| Ambassador Frühstück | Preview `64dd77912c2be0de66e3acb786b176e96bf687e9`, READY. Sachliche Tabellen, Formulare und textlich erkennbare Zustände. Die geschützte Zimmerkarten-Geometrie wurde nicht übertragen. |
| Display Management V1.2 | Preview `edde7efb6712a1f8697da3394f1d5672faf5d029`, READY. Breite Verwaltungsfläche, Tabellenhierarchie, mobile Datenblöcke. Keine Editor-/Motion-Engine in Trinkgeld integriert. |

Der Cross-App-Vergleich beruht auf gelesenen Originaldateien an diesen SHAs, Master-Normen und bestehenden QA-Nachweisen. Die anderen Apps wurden nicht neu vollständig getestet oder verändert. Keine gemeinsame Komponentenbibliothek erstellt.

Fontquelle: Display V1.2 `public/assets/serif-300.woff`, unveränderter Git-Blob `bd730230c30b0b3951efc0620a8ed55ca4d7e0f4`. Metadaten lokal geprüft: Gewicht 300, Breitenklasse 3, Italic -12°. Lizenzbeilage `OFL-NotoSerifDisplay.txt`. Bestehender Sans-Teilfont und Systemfallback bleiben erhalten; keine neue DE/EN/VI-Gesamtabnahme behauptet.

## Änderungsgrenzen

Produktive Darstellung: `professional-workspace.js`, `professional-workspace.css`, lokaler Editorial-Font und Lizenz; in `index.html` nur zwei zusätzliche Asset-Einbindungen. Tests, Lint-Aufruf und dieser Bericht ergänzen die QA. Bestehende Inline-Skripte und 18 geschützte Laufzeit-/Builddateien wurden bytegleich zur Basis nachgewiesen.

Keine Änderungen an Berechnung, Prozenten, Emily-Pauschale, Housekeeping, Rundung, Schichtgewichtung, Zeiträumen, IDs, Entwurfsschutz, Datenmodell, Synchronisierung, RLS oder Archiven. MIA, FF2 und OFS bleiben unverändert; fachliche Klärung weiterhin separat.

## Qualitätssicherung

- 54 bestehende Regressionstests übernommen; fünf gezielte Workspace-Tests ergänzt: identische Tages-/Zeitraumergebnisse und Archiv-HTML, filterfeste IDs, unveränderte finale Archive, Konfliktschutz bei gefiltertem Editor und sichere Darstellung beim Schliessen eines Dokuments.
- Build, ESLint, gezielte TypeScript-checkJs-Prüfung des Identitätsvertrags und `git diff --check`. Keine vollständige TypeScript-Konvertierung der Anwendung.
- Chromium und WebKit: 393×852, 375×812, 1024×768, 1194×834, 1440×900. Echte Browserbilder mit synthetischen Daten; keine KI-Mockups.
- Bedienung: direkte Navigation, Eingabe, Mitarbeiter-/Dienstumbenennung, unveränderte Beträge und IDs, Finalisierung, Archivöffnung, Reload, Suche, Escape/Zurück, Fokus-Rückgabe, Mindestgrösse der Navigation, keine Seitenüberstände, Zeitraumrechnung.
- Bestehender Browser-Integritätstest prüft zusätzlich Altentwurf, geänderte Gewichtung und Textimport. Separater Workspace-Test prüft den Importdialog in Chromium. WebKit-Kamera/QR bleibt wegen der bereits dokumentierten V1.1-Laufzeitgrenze offen.
- Cloud-Testnachweise aus V1.1 werden übernommen. Synchronisierungscode ist bytegleich; Konflikt-/Merge- und Sperrzustandstests laufen erneut. Keine neue Live-Supabase-Mehrgeräteabnahme als Bestandteil des Designs behauptet.

Reproduzierbar: `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test:browser`, `npm run test:workspace`. Browserabhängigkeiten müssen lokal installiert sein. `BASE_URL`, `QA_OUTPUT`, `QA_BROWSER=webkit` und bei Bedarf ein Browserpfad steuern die isolierte Browser-QA. Der Runner verweigert den bekannten Production-Host und prüft die leere Supabase-Preview-Konfiguration vor jedem Fixture.

## Preview, Grenzen und Rückfall

Die V1.2-Preview wird aus dem gesicherten Branch gebaut. Der bestehende Build erzwingt `localOnly:true` und leere Supabase-Zugangskonfiguration für Vercel-Previews. Kein Test schreibt produktive Daten. Die genaue Commit-/Deployment-Zuordnung und finalen Preview-Ergebnisse stehen im Release-Manifest des Abschlusspakets.

Physische iPhones/iPads, iOS/iPadOS Safari und echtes Windows wurden nicht getestet. Viewport-/Touch-Emulation und Linux-WebKit sind getrennt ausgewiesen. Kameraberechtigung wird im Test verweigert simuliert; echtes QR-Scanning bleibt offen. Browser- und Fokusprüfungen sind keine vollständige WCAG-Zertifizierung.

Die V1.1-Blocker bleiben: inkompatible Altclients, noch nicht integriert abgenommener/aktivierter Server-Guard, eingeschränkter Legacy-REST-Nachweis und keine gesonderte Realtime-only-Abnahme. Diese Designphase beseitigt oder ersetzt sie nicht.

Rückfall der Darstellung: auf V1.1 `62d3a48d` zurückwechseln; lokale Eingaben, Identitäten und Archive bleiben im kompatiblen Format. Kein Rückfall auf den alten Production-Client, keine Datenbankwiederherstellung über neuere Abrechnungen. Kein Production-Deployment ohne separate technische Abnahme und ausdrückliche Freigabe.
