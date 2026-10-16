# C2 – vorbereitete Veröffentlichung, keine Aktivierung

Aktueller App-Kandidat: `d22900d696bc40afb3978aaff635d142615c8e14`. Die drei beauftragten Bedienkorrekturen wurden nach Übergabestand `06e139b8` ergänzt; C2, Finanz-/Serverlogik, SQL und Release-Nachweise bleiben unverändert. Details und gezielte Nachweise: `docs/C2_UI_REVIEW_20261017.md`. Release-Dateien liegen im bestehenden Branch `tips-v14-c-whole-chf-complete-period-20261016`.

## Zielabgleich vom 17.10.2026, Schweizer Zeit

- Vercel: Projekt `prj_dKUCwFBKHfZVC0hmxhvdKpzrJQYO`, Team `team_38D8NmJHWLJIxN1R5XHD63yJ`.
- Production: `dpl_AckEsRbZoAmihU4wmn7qEtbRrvMj`, Commit `16fab0e23fa58a0fb59d4c8b4c7aa66dbbb79440`, Branch `tips-quiet-launch-20261013`. Nicht verändert.
- Vorherige geprüfte Candidate-Preview (historischer Ausgangspunkt): `dpl_Dzm9VF52VbRY3pSVzek8tFS7rc7f`, Commit `901b92a4`, READY; Supabase-URL und Schlüssel leer, `localOnly=true`, `c2AppApproved=false`.
- Tatsächliche Production-Konfiguration verweist auf Supabase `xgbbwnmqgpwxxftnjrkc`, Name „Ambassador Breakfast“, PostgreSQL 17.6. Gemeinsames Projekt: ausschliesslich Trinkgeld-Objekte lesend untersucht; keine Tests in diesem Projekt.
- Workspace `edb875da-fea6-49a0-8e50-e314254752a6` / Restaurant Silk. Format 2, Revision 31, MD5 des JSON-Payloads `3832a0ec13892927c3b62fe2cb4d17d1` beim Abgleich. Dient der Driftprüfung, nicht als Ersatz für SHA256 der Sicherung.
- Der Server enthält einen `draft-v2`-Entwurf, keine finalisierten Abrechnungen in den untersuchten Abrechnungstabellen. Das belegt nicht das Fehlen von Browser-lokalen Archiven auf anderen Geräten.
- Vorhanden sind die ursprünglichen sechs `tip_*`-Funktionen und die Shared-State-Migration. V1.4-Ereignistabelle, C2-Tabellen/Funktionen, Gate und Operatoren sind noch nicht vorhanden.
- RLS ist für alle vorhandenen Trinkgeld-Tabellen aktiv. `tip_workspace_state` erlaubt Mitgliedern SELECT und gezielte Spaltenschreibrechte; Mitgliedschaft wird serverseitig anhand `auth.uid()` und `active=true` geprüft. Realtime-Publikation enthält den Workspace-State.
- Sieben aktive gekoppelte anonyme Auth-Gerätezugänge, alle Rolle `member`, darunter alte Testgeräte, `MacIntel` und `iPhone`. Kein benannter Abschlussverantwortlicher und keine automatische Übernahme als C2-Operator. Identität des tatsächlich gewählten Arbeitsgeräts vor Aktivierung prüfen, keine pauschalen Rechte an alle sieben.

Aktuelle cloudfreie Preview: https://silk-trinkgeld-uiux-polish-ikmzgt8m3-restaurant-silk.vercel.app/ (`dpl_3d4KpjeD2TbdpxCKRZDuyfWuan57`, READY, App `d22900d6`). URL/Schlüssel leer, `localOnly=true`, `c2AppApproved=false`. Production am 17.10.2026 erneut lesend identisch bestätigt.

## Exakter SQL-Umfang

`release/sql-manifest.json` bindet die drei bestehenden SQL-Dateien bytegenau an den geprüften Kandidaten:

1. `docs/production/v14-integrity-PREPARED-NOT-APPLIED.sql`: Ereignisprotokoll, Versions-RPC und Archiv-/Altclientschutz.
2. `v14-prototypes/variant-c-postgres-PREPARED-NOT-APPLIED.sql`: unveränderte C2-Berechnung.
3. `docs/production/c2-server-PREPARED-NOT-APPLIED.sql`: fünf private C2-Tabellen, unveränderliche Belege/Ereignisse, Abschluss-/Zahlungs-/Lese-RPCs, standardmässig geschlossenes Gate.

`release/INSTALL-PREPARED-NOT-APPLIED.sql` führt diese Bausteine in einer einzigen Transaktion aus. SHA256: `cb5a28d4fe759904e4096a9dbf9b6ccc90b3f06e794bb3459657827ae560bd33`.

Zusätzlicher Abgleich der Zielrechte: Die Zielumgebung vergibt für neue öffentliche Funktionen standardmässig explizites EXECUTE an `anon`. Das Installationspaket entzieht dieses Recht gezielt bei den sechs neuen RPCs. Die vier C2-RPCs hatten den Entzug schon im Quellskript, die beiden V1.4-RPCs benötigen den ergänzenden Entzug. Keine Änderung globaler Default-Privileges, bestehender Mitgliedschaften oder anderer Anwendungen.

Es werden insgesamt sechs neue private Tabellen angelegt (ein Ereignisprotokoll und fünf C2-Tabellen). Kein Daten-UPDATE, kein Backfill, keine historische Neuberechnung. Keine Gate-/Operatorzeilen werden angelegt. Die alte Protocol-3-Integritätsdatei und die bereits installierte Shared-State-Migration dürfen nicht zusätzlich eingespielt werden.

Das Paket verweigert eine Teil-/Wiederholungsinstallation. Vor dem späteren Start: Schema erneut mit dem gesicherten Abgleich vergleichen, aktuelle Sicherung nachziehen und nachweislich einen zum neuen Backup passenden Stand festhalten. Ein geänderter Zielstand verlangt einen gezielten Abgleich, kein blindes Wiederholen.

## Sicherung und Wiederherstellung

Private, konsistente Ein-Statement-Sicherung am 16.10.2026 um 22:25:38 UTC / 17.10.2026 um 00:25:38 Zürich: 14 Workspace-Tabellen, 153 Datensätze, einschliesslich Arbeitsstand, Stammdaten, Dienste, Zuordnungen, Geräte und Mitgliedschaften. SHA256 der gespeicherten JSON-Datei: `cce0152c726f93b2b50b2813f6844440580c379576c602469b09375bb88a1e0a`.

Reale Daten bleiben in der privaten Sicherungsdatei. GitHub, CI und Vercel erhalten weder diese Daten noch Auth-Sessions, Passwörter oder Verbindungscodes. Schema-Metadaten im Repository enthalten keine Personendatensätze.

Lokal wurde der Snapshot in eine frische PGlite-Datenbank eingelesen und jede Tabellenzeile in beide Richtungen feldweise verglichen. Zeitstempel werden typgerecht verglichen, JSONB-Finanz-/Arbeitsdaten exakt. Ursprüngliche Revisionen und historische Inhalte bleiben gleich. Installation/Rollback der DDL sowie leere Gates/Operatoren geprüft. PGlite 0.5.10 enthält PostgreSQL 18.6; dies ist ausdrücklich kein nativer PG17- oder Cloud-Restore.

Ein zusätzlicher isolierter Standard-GitHub-Runner prüft ausschliesslich die Release-Lücke: echtes PostgreSQL 17, targetgetreue Schema-/Rechte-Metadaten mit synthetischen Daten, `pg_dump`/`pg_restore` in eine zweite leere Datenbank, Originaleigentümer/-rechte, unveränderte Belege, Wiederholungsanfragen und sicheren Rückfall. Vorhandene Finanz-/Browser-Suites werden dafür nicht erneut ausgeführt.

Der native Dump umfasst App-Schemas. Auth-Identitäten und Clusterrollen sind Wiederherstellungsvoraussetzungen; Auth-Sessions, Schlüssel, Storage und andere Supabase-Dienste sind damit nicht als vollständiges Disaster-Recovery gesichert. Zur Wiederherstellung Supabase-eigener Default-ACLs wurde ausschliesslich der isolierte Clusteradministrator verwendet. App-/API-Rollen erhalten keine zusätzlichen Rechte.

Die private Sicherung ist ein Trinkgeld-Wiederherstellungsnachweis, kein vollständiger Backup-/Restore-Nachweis der gemeinsam genutzten Cloud. Nicht synchronisierte Browserdaten bleiben gesondert zu sichern. Vor dem echten Wechsel den Snapshot aktualisieren; nie ein älteres Backup über neuere Buchungen spielen.

## Kontrollierte Reihenfolge nach ausdrücklicher Freigabe

1. Marcos getrennte App-/SQL-Freigaben und Entscheidung zum Rundungsausgleich dokumentieren. Den echten Bediencheck und das konkrete Abschlussgerät bestätigen. Alle bestehenden lokalen Eingaben auf den eingesetzten Geräten sichern/synchronisieren, ältere Tabs schliessen.
2. Zielmetadaten/Revision erneut lesen, aktuellen privaten Snapshot sichern und prüfen. Keine historischen Daten umschreiben. Bei Drift anhalten und gezielt abgleichen.
3. Geprüftes Installationspaket atomar einspielen. Bei Fehler erfolgt vollständiger Transaktions-Rollback. Gate/Operatoren bleiben leer. Nur Trinkgeld-Clients sind von der Protocol-4-Umstellung betroffen; die gemeinsame Frühstücksdatenbank bleibt als Gesamtprojekt unverändert nutzbar.
4. Genau den App-Kandidaten als Production-Build bereitstellen; `SILK_C2_APP_APPROVAL=approved-c2` nur nach App-Freigabe setzen. Die isolierte Preview darf nicht einfach als produktive Konfiguration übernommen werden. Bestehende Supabase-Zielkonfiguration beibehalten; keine Service-Schlüssel im Client.
5. Schema, Eigentümer, RPC-Rechte und die erwartete Sperre zunächst lesen/prüfen. Nur den eindeutig bestätigten aktiven Workspace-Zugang in `private.tip_c2_operators` für `can_finalize`/`can_confirm_cash` freigeben. `private.tip_c2_gate` erst mit `synthetic_only=false`, dokumentierter `sql_approval_ref` und `approved_at` setzen. Diese Konfiguration ist Teil der getrennten SQL-Freigabe; nicht vorab ausführen.
6. Echten Arbeitsstand lesen und Anzeige prüfen, keine Testabrechnung in Production erzeugen. Erste tatsächliche Abrechnung fachlich begleiten. Belege und Zahlungen bleiben getrennt.

## Sicherer Rückfall

Vor/innerhalb der Installation: Transaktion zurückrollen, keine Teilinstallation. Vor Gate-Aktivierung entstehen keine echten C2-Abschlüsse.

Nach Aktivierung: `release/PAUSE-PREPARED-NOT-APPLIED.sql` sperrt neue Workspace-Schreibvorgänge über einen zielgebundenen Trigger, entfernt nur das Gate und deaktiviert Operatorrechte. Lesezugriff bleibt erhalten. Belege, Zahlungsereignisse und Versionen werden weder gelöscht noch rückgesetzt. Das App-Freigabeflag anschliessend zurücknehmen; den kompatiblen Client beibehalten. Ein Rücksprung auf den alten Production-Client würde sonst den Daten-/Archivschutz umgehen oder nicht mehr schreiben können und ist kein sicherer Rollback.

Kein DROP von C2-Daten, keine Entfernung des Versionsschutzes, keine Rücksicherung eines alten Snapshots über neue Zahlungen. Eine Wiederaufnahme nach einem Problem benötigt einen geprüften Vorwärts-Fix und eine eigene dokumentierte Entscheidung; nicht automatisch das Gate wieder öffnen.

## Freigabeantrag

- **App separat:** Veröffentlichung des korrigierten App-Kandidaten `d22900d696bc40afb3978aaff635d142615c8e14` mit der vorgesehenen Production-Konfiguration und dem App-Freigabeflag.
- **SQL separat:** Das oben benannte atomare Installationspaket inklusive gezielter RPC-Rechte, anschliessender Gate-/Operator-Konfiguration nur für das eindeutig bestätigte Gerät und dem vorbereiteten sicheren Pausenverfahren.
- **Betriebliches Verfahren:** Fehlbeträge aus Aufrundungen aus der bestehenden Betriebskasse ergänzen; Abrundungsreste dort belassen. Je Periode Herkunft/Verbleib belegen und ausdrücklich bestätigen. Tatsächliche Auszahlung anschliessend gesondert bestätigen. Keine neue Kassenverwaltung oder persönlichen Überträge.

Offen vor Aktivierung: echter Bediencheck und eindeutig bestätigtes Arbeitsgerät, aktuelle Sicherung/Driftkontrolle unmittelbar zum Wechsel sowie Marcos drei Entscheidungen. Keine pauschale weitere Funktionsentwicklung.

Bediencheck: `docs/C2_RELEASE_BEDIENCHECK.md`. Release-Nachweis auf Commit `81c4983249d81fd3583d7ab32addc121b872061b`: https://github.com/marcowilczek84/silk-trinkgeld-uiux-polish/actions/runs/38976560027 – sechs zusätzliche Release-Prüfgruppen bestanden. PostgreSQL 17.11 auf Standard-Runner ubuntu-24.04. Die Ziel-Cloud verwendet PostgreSQL 17.6.

Erster Versuch https://github.com/marcowilczek84/silk-trinkgeld-uiux-polish/actions/runs/38976258027: Installation und Datenvergleich bestanden; Restore scheiterte an Supabase-eigenen Default-ACLs. Danach isolierten Admin für Restore verwendet und Originaleigentümer sowie RPC-Rechte geprüft. Kein Produktfehler und keine Änderung der bestehenden App.

Lokaler Bediencheck-Starter: HTTP 200, synthetisches Fixture und ausschliessliche Loopback-Konfiguration bestätigt. Noch kein physischer Benutzer-/Gerätetest. Der native lokale PostgreSQL-Start war durch Host-Rechte blockiert; er wird nicht als bestanden ausgewiesen. Daher nativer Wiederherstellungsnachweis ausschliesslich auf dem isolierten Actions-Runner.

Bereinigte Protokolle und Versionsdigests liegen im Abschlussnachweis. CI-Erfolg ist keine physische Geräte- oder vollständige Cloud-Abnahme.
