# SILK C2 – Ausführungsstand 17.10.2026

**Status: veröffentlicht und aktiviert.** Aktivierung am **17.10.2026 um 11:50:52 Europe/Zurich**; unabhängige Datenbankkontrolle um 11:51:01, anschliessender Vergleich aller 14 Tabellen ebenfalls unverändert.

## Veröffentlichungsnachweis

- App unverändert `a5df93a425360a0a35056890bee03432b29fffa8`, Production-Deployment `dpl_9Ak8WF2SUchk3L3ynYYT9xzEdPXY`, Status **READY**. Bestehende Adresse: https://silk-trinkgeld-uiux-polish.vercel.app/.
- GitHub-Arbeitsbranch: `tips-v14-c-whole-chf-complete-period-20261016`. Übernommen aus `a6167a6fc8720767f61b6f21ac348edcf4bf9cd3`; Freigabepaket `f41770fc44394f2d8f77c5ead441fe5e05a12d17` und MCV2-023/024/025. Dieser Nachweis ändert keine App-Funktionen.
- SQL über das ausdrücklich genehmigte Supabase-Webdashboard atomar installiert. Alle 617 Zeilen / 54’384 UTF-8-Bytes wurden vor Ausführung gegen das freigegebene Paket geprüft; SHA256 unverändert `cb5a28d4fe759904e4096a9dbf9b6ccc90b3f06e794bb3459657827ae560bd33`. Dashboard meldete Erfolg; unabhängiger Connector-Lesezugriff bestätigt Installation. Kein CLI-Migrationshistorieneintrag behauptet; das Dateisuffix `PREPARED-NOT-APPLIED` bleibt zur Wahrung des geprüften Pakets unverändert, der tatsächliche Ausführungsstatus steht hier.
- Ziel weiterhin `xgbbwnmqgpwxxftnjrkc` / Ambassador Breakfast, PostgreSQL **17.6**. Nur der freigegebene Trinkgeld-Workspace wurde aktiviert; keine Änderungen an Frühstücks-Anwendungsdaten oder historischen Trinkgeldabrechnungen.
- Sechs private Tabellen mit RLS und ohne direkten anon-/authenticated-Lesezugriff bestätigt. Sechs öffentliche RPCs: authenticated-Ausführung erlaubt, anon-Ausführung entzogen, Eigentümer postgres. Gate und Operatoren nach Installation zunächst leer.
- Frischer Production-Build aus exakt a5df93a4: HTTP 200 für die veröffentlichte Konfiguration, korrektes Supabase-Ziel, vorhandener Publishable Key, `localOnly=false`, `c2LocalTest=false`, `c2AppApproved=true`. Keine Test-Preview befördert und keine Schlüssel veröffentlicht.
- Danach genau **ein eindeutig bestätigter bestehender Safari-Zugang** freigeschaltet: Abschluss-/Zahlungsbestätigungsrechte aktiv, Gate `synthetic_only=false`, Freigabevermerk und Serverzeit vorhanden. Mitgliedschaft und Installationskennung vor Aktivierung nochmals geprüft. Keine pauschalen Rechte für die übrigen sechs Zugänge.
- **14 Tabellen / 153 Datensätze vollständig unverändert**, vor Installation sowie nach Installation und nach Aktivierung per zeileninhaltlichem Hash verglichen. Workspace weiterhin Revision **31**, Payload-MD5 `3832a0ec13892927c3b62fe2cb4d17d1`. Keine Finanz-Testbuchung: C2-Operationen, Zahlungsbewegungen und Änderungsereignisse jeweils **0**.

### Nachweise und Grenzen

Maschinenlesbar: [c2-release-execution-20261017.json](evidence/c2-release-execution-20261017.json). Dashboard-Nachweis: [SQL-Installation](evidence/c2-sql-install-success-20261017.jpg).

Nur die notwendigen Release-Kontrollen ausgeführt. Bereits akzeptierte isolierte Supabase-, PostgreSQL-17-, Wiederherstellungs-, Konflikt-, Finanz- und Bediennachweise weiterverwendet: Runs `38969768198`, `38976560027`, `38979358392`, `38981810075`, `38986858879`. Die bestehende lokale Wiederherstellung war PGlite 0.5.10 / PostgreSQL 18.6 WASM; sie wird nicht als native PG17-Prüfung ausgegeben. Marcos bisherige iPhone-Abnahme bleibt übernommen; keine neuen physischen iPad-/Computer-Tests behauptet.

Der ursprüngliche Supabase-Connector-Blocker ist durch die genehmigte Dashboard-Ausführung erledigt. Ein zunächst falsch übertragener Vercel-Teambezeichner wurde mit 403 abgewiesen; die automatische Prüfung sperrte den unbestätigten Wiederholungsversuch. Ein lesender Projektabgleich bestätigte danach die tatsächliche Account-ID; erst dann wurden das Production-Flag und Deployment erfolgreich im richtigen Projekt erstellt. Keine Änderung am falschen Ziel.

### Betrieb und Kosten

Kein Tarifwechsel, kein kostenpflichtiger Runner und kein Zusatzdienst. Die Organisation bleibt **Free**, liegt aber über dem aktuellen Kontingent: 20,869 / 5 GB Egress und 534’054 / 500’000 Edge-Aufrufe; der im Dashboard angezeigte Zeitraum endet am **19.10.2026**. Supabase kann Anfragen einschränken. Während dieses Releases waren SQL, Leseprüfungen und App-Konfiguration erfolgreich erreichbar; daraus folgt keine Garantie dauerhaft kostenloser oder unterbrechungsfreier Nutzung. Dies betrifft die gemeinsame Organisation, nicht allein den Trinkgeldverkehr.

**Bedienung:** Marco lädt die bestehende Safari-Seite neu. iPhone, iPad und Computer bleiben grundsätzlich nutzbar; weitere Browser verwenden die vorhandene Kopplung. Nicht verifizierte Browserkennungen erhalten keine automatischen Finanzrechte. Der ChatGPT-In-App-Browser wurde nicht gekoppelt.

**Rundung:** C2 unverändert. Einmalige kaufmännische Rundung der Periode auf ganze CHF, anschliessend grösste exakte Reste; kein persönlicher Übertrag. Der genehmigte Ausgleich erfolgt über die bestehende Betriebskasse mit explizitem Beleg. Berechnete Differenz, bestätigter Kassenausgleich und tatsächliche Auszahlung bleiben getrennt.

**Verbleibend:** kein technischer Release-Blocker. Das Gratis-Kontingent bleibt ein konkretes Verfügbarkeitsrisiko. Sicheren Rückfall nur vorwärts über das vorhandene PAUSE-Paket ausführen; keine alte App und keinen alten Snapshot über neue Belege zurückspielen. Keine weitere App-/SQL-/Rundungsfreigabe für diesen bereits genehmigten Release erforderlich.

## Vorheriger Zwischenstand 10:48:35 (historischer Verlauf)

Die folgenden Abschnitte dokumentieren den inzwischen behobenen Blocker und die übernommenen Vorbereitungen.

## Freigaben und Zugang

Marcos Freigaben MCV2-023/024/025 und Ausführungsauftrag gelten. Übergabe `f41770fc44394f2d8f77c5ead441fe5e05a12d17`, unveränderter App-Kandidat `a5df93a425360a0a35056890bee03432b29fffa8`.

Die bisher offene Zuordnung ist erledigt: Marco öffnete am 17.10.2026 seinen bestehenden Safari-Zugang und zeigte „Synchronisiert“. Genau die bereits gespeicherte Safari-Sitzung erneuerte sich um 10:15:28 Zürich; die übrigen sechs gekoppelten Sitzungen blieben unverändert. Gespeicherte Installationskennung, aktives Workspace-Mitglied und Auth-Kennung passen zusammen. Die exakten Kennungen liegen ausschliesslich im privaten Sicherungsnachweis. Keine manuelle Geräteliste, keine neue Gerätebindung. Der separate ChatGPT-Browser ist ungekoppelt und wurde nicht berechtigt. iPad und Computer bleiben über die vorhandene Kopplung nutzbar; noch nicht bestätigte Browser erhalten keine automatischen Abschluss-/Zahlungsrechte.

## Fertige Ausführungsvorbereitung

Aktuelle Sicherung vom **17.10.2026 10:18:27 Zürich**, 14 Tabellen / 153 Datensätze, sämtlich identisch zur bisherigen Sicherung. SHA256 `72688fb1c6ecf5e9c73fa3a4a8782c011e43d40f0ca9741788f779fc5aefffcb`. Privat dauerhaft gespeichert; beide vorherigen Snapshots erhalten. Lokale Wiederherstellung in leerem PGlite 0.5.10 / PostgreSQL 18.6 WASM bestanden: feldgleiche Daten, Installation/Transaktions-Rollback, leere Gates/Operatoren und anon-RPC-Entzug. Kein neuer nativer lokaler PG17-Nachweis behauptet. Vorhandene native isolierte PG17- und Browsernachweise aus f41770fc weiterverwendet.

Zielschema einschliesslich Eigentümern, Rechten, Policies, Triggern, Funktionen und Constraints unverändert. Exaktes genehmigtes Installationspaket SHA256 `cb5a28d4fe759904e4096a9dbf9b6ccc90b3f06e794bb3459657827ae560bd33` überprüft.

## Konkreter technischer Blocker

Zwei SQL-Ausführungsaufrufe und anschliessend der reguläre Migrationsaufruf mit exakt demselben Paket lieferten jeweils **“McpServerError: Invalid or expired requestState”**. Das ist ein Fehler der Supabase-Verbindung; seine Ursache ist nicht nachgewiesen. Lesender Zugriff funktioniert. Keine SQL-Fehlermeldung, keine erneute fachliche Freigabeanforderung und keine belegte automatische Sicherheitsablehnung.

Nach jedem fehlgeschlagenen Weg den tatsächlichen Zustand kontrolliert: C2-Gate, Ereignistabelle und neuer Schreib-RPC fehlen weiterhin. Workspace Revision 31 / Payload-MD5 `3832a0ec13892927c3b62fe2cb4d17d1`. Keine Teilinstallation nachgewiesen. Keine Operatoren aktiviert; keine historischen Daten verändert. Das App-Freigabeflag wurde noch nicht gesetzt und kein Production-Deployment angelegt.

Production bleibt `16fab0e23fa58a0fb59d4c8b4c7aa66dbbb79440`, Deployment `dpl_AckEsRbZoAmihU4wmn7qEtbRrvMj`.

## Fortsetzung

Die Browser-Zugriffsregel verlangt vor dem Wechsel vom wiederholt fehlgeschlagenen Connector zum Supabase-Webdashboard eine ausdrückliche Zustimmung. Danach nur den bereits genehmigten Release ausführen: aktuellen Drift prüfen → identisches SQL atomar installieren, Gate geschlossen → App a5df93a4 mit bestehender Production-Konfiguration bereitstellen → zugeordneten Zugang und Gate aktivieren → tatsächlichen Stand lesend prüfen und Veröffentlichungsnachweis ergänzen. Keine neuen Funktionen oder pauschalen Tests. Fachliche App-/SQL-/Rundungsfreigaben bleiben gültig.

Sicherer Rückfall unverändert: `release/PAUSE-PREPARED-NOT-APPLIED.sql`, SHA256 `49e72f435bedac6e6cab7e5067f865ecf27037dc3042e36712c092d40e9d2fc4`. Kompatible App und sämtliche Belege erhalten; keine alte Sicherung über neue Zahlungen.
