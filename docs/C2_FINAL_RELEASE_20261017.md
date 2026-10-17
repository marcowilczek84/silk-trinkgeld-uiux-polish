# C2 – letzte Bedienabnahme und getrennte Release-Freigaben

Stand: 17.10.2026, nach 02:35 Uhr Zürich. **Keine Production-Änderung ausgeführt.**

## Übernommener Stand

- App bleibt **`a5df93a425360a0a35056890bee03432b29fffa8`**, übernommene Übergabe `6124e2d985b088b0c47938ed98747a5235147211`.
- Branch: `tips-v14-c-whole-chf-complete-period-20261016`.
- Zusätzliche, ausschliesslich synthetische Prüfumgebung: **`db5d61c2da06094077a418f331616dd7eaa11c76`**. Keine Änderung an App-, Finanz- oder SQL-Quellcode. Die bestehende Production-Buildanweisung bleibt unverändert.
- Vorhandenes Komplettpaket, isolierte vollständige Supabase-Abnahme, Release-Recovery und Marcos drei bestandene iPhone-Prüfpunkte werden übernommen. Kein erneuter Gesamtaudit.

## Nur noch dieser Bedienablauf für Marco

**[Bediencheck öffnen](https://silk-trinkgeld-uiux-polish-lmyqg5ga6-restaurant-silk.vercel.app/)**. Die Testabrechnung öffnet sich automatisch. Ggf. Marcos vorhandene Vercel-Anmeldung verwenden; Schutz bleibt unverändert.

Abschluss mit `TEST-KASSE` und dem Häkchen bestätigen → **Beleg öffnen → Auszahlungsnachweise laden → Auszahlung bestätigen**, Referenz `TEST-ZAHLUNG` und Häkchen setzen → **Tatsächliche Auszahlung bestätigen** → neu laden und die Auszahlungsnachweise nochmals öffnen. Erwartet: derselbe Beleg, CHF 1’801 berechnet und einmal bestätigt; CHF 0.10 separat als Restbetrag.

Bitte nur zurückmelden, ob dieser Ablauf verständlich und bedienbar ist. Keine echten Beträge oder Zahlungen eingeben. Der Link funktioniert auf iPhone, iPad und Computer; es genügt zunächst Marcos kurzer Check auf seinem verfügbaren Gerät. Das ist noch keine behauptete physische Abnahme aller Gerätetypen.

## Einordnung der Prüfumgebung

Deployment `dpl_FYfUfJaBumpS3w2aRJaHsDiQZsVm`, READY, Preview-Ziel im bestehenden Vercel-Projekt. Eigener Root `operator-check`, separate synthetische IndexedDB pro Browser und Origin. Kein zusätzlicher Dienst und kein kostenpflichtiger Runner.

PGlite 0.5.10 führt die vorhandenen SQL-Funktionen im Browser aus. Der Testadapter ersetzt ausschliesslich den Transport; die App-Formulare und C2-Schutzlogik bleiben gleich. Der freigegebene App-/SQL-Zustand wird nur innerhalb dieser synthetischen Datenbank simuliert. Testdaten und Hinweise sind sichtbar gekennzeichnet. Keine Supabase-URL, kein Schlüssel, kein Cloud-Auth oder Realtime und keine Verbindung zur gemeinsamen Frühstücksdatenbank. Eine Testsitzung wird nicht zwischen Geräten synchronisiert. Ein zweiter Tab derselben Testsitzung wird durch eine Browsersperre zurückgehalten.

Der Production-Build enthält diesen Adapter nicht. Die Bedienpreview niemals nach Production übernehmen oder als App-Kandidat promoten. Für Production weiterhin exakt App `a5df93a4` mit der separat freigegebenen Zielkonfiguration verwenden.

## Tatsächlich ausgeführte neue Nachweise

- **Isolierter Standard-GitHub-Runner ubuntu-24.04:** [Run 38986858879](https://github.com/marcowilczek84/silk-trinkgeld-uiux-polish/actions/runs/38986858879), Job `117260228014`, erfolgreich auf `db5d61c2`. Node 22.18.0. Sechs kurze Bedienabläufe: Chromium 151.0.7922.34 und WebKit 26.5, jeweils 393×852, 1024×768 und 1440×900. Getrennte leere Bestätigungen, echter Formularabschluss, Auszahlungsformular, gleicher Originalbeleg und genau ein Zahlungsnachweis nach Neuladen. Keine Seitenfehler und keine externen Anfragen. Bereinigte Ergebnisse: `docs/evidence/c2-accessible-operator-check-20261017.json`.
- **Bereitgestellte Preview im Cloud-Chrome:** derselbe vollständige Formularablauf sichtbar durchlaufen; nach Neuladen derselbe Beleg und Zahlungsstand 1. Dies ist kein physischer iPhone-/iPad-Test und keine Supabase-Cloud-Abnahme.
- **Lokal:** neue private Sicherung in leerem PGlite wiederhergestellt; jede Zeile feldweise verglichen, vorbereitete Installation und Transaktions-Rollback geprüft. Syntax der neuen Testdateien geprüft. Keine neue native lokale PG17-Prüfung behauptet.
- **Vorhandene Nachweise weiter gültig:** vollständige isolierte Supabase-Suite auf `901b92a4`, native PG17.11-Release-Recovery auf `81c49832`, gezielte UI-/Leereingabeprüfungen auf `d22900d6` / `a5df93a4`. Keine pauschale Wiederholung.

Zwei frühere Versuche der neuen Testbereitstellung waren nicht erfolgreich: `4949111a` (Run 38986456363: Browser-Assetbasis) und `9476eb31` (Run 38986603890: vorhandene Testdatenbank beim Neuladen erneut importiert). Ausschliesslich der Testlader wurde korrigiert; der erfolgreiche Nachweis ist der oben genannte Run auf `db5d61c2`.

## Aktuelle Zielprüfung und Sicherung

Production weiterhin `dpl_AckEsRbZoAmihU4wmn7qEtbRrvMj`, App `16fab0e23fa58a0fb59d4c8b4c7aa66dbbb79440`. Vercel-Projekt `prj_dKUCwFBKHfZVC0hmxhvdKpzrJQYO`, Team `team_38D8NmJHWLJIxN1R5XHD63yJ`.

Supabase `xgbbwnmqgpwxxftnjrkc`, PostgreSQL 17.6, Workspace `edb875da-fea6-49a0-8e50-e314254752a6`: Revision 31, Format 2, Payload-MD5 `3832a0ec13892927c3b62fe2cb4d17d1`. 15 Tabellen, sechs öffentliche/private Funktionen, RLS/ACLs, Policies, Trigger und Constraints identisch zum bisherigen Zielabgleich. Spaltenrechte und Realtime-Mitgliedschaft ebenfalls bestätigt. C2-Gate und Operatorentabelle noch nicht vorhanden. Neue RPCs benötigen weiterhin den bereits im Installationspaket enthaltenen expliziten Entzug von `anon`-EXECUTE. Keine Zielrechte verändert.

Neue private Sicherung: **17.10.2026 02:28:34 Zürich**, 14 Tabellen/153 Datensätze, sämtliche Datensätze identisch zur bisherigen Sicherung. SHA256 `7d7679655e925bd2bbfdd433a16d4fda6b4a28683bdf0e742b2507ca30e014b2`. Privat dauerhaft gesichert; vorheriger Snapshot zusätzlich erhalten. Keine realen Finanz-/Personendatensätze im Repository, Runner oder Bediencheck. Wiederherstellung lokal mit PGlite 0.5.10 / PostgreSQL 18.6 WASM bestanden. Der native PG17-Nachweis bleibt getrennt übernommen.

Dies ist eine Trinkgeld-Workspace-Sicherung, kein vollständiges Supabase/Auth-Disaster-Recovery. Vor der späteren tatsächlichen Ausführung erneut Drift prüfen; bei Änderungen frischen Snapshot erstellen. Reine Browserdaten und alte lokale Archive auf allen verwendeten Geräten müssen zuvor gesichert/synchronisiert sein.

## Drei getrennte Entscheidungen

1. **App:** Production-Veröffentlichung von `a5df93a425360a0a35056890bee03432b29fffa8` mit bestehendem Supabase-Ziel und `SILK_C2_APP_APPROVAL=approved-c2`. Nicht die synthetische Bedienpreview veröffentlichen.
2. **SQL:** `release/INSTALL-PREPARED-NOT-APPLIED.sql`, SHA256 **`cb5a28d4fe759904e4096a9dbf9b6ccc90b3f06e794bb3459657827ae560bd33`**. Atomare Installation, gezielte Rechte und danach dokumentierte Gate-/Operator-Konfiguration für die ausdrücklich bestätigten aktiven Gerätezugänge. Kein Backfill, keine historische Neuberechnung. Zugriff auf iPhone, iPad und Computer möglich; keine Bindung an ein einzelnes iPad. Die sieben alten Mitgliedschaften enthalten Testgeräte und sind keine pauschale Freigabeliste. Vor Aktivierung müssen die tatsächlichen Zugänge eindeutig zugeordnet sein; neue Geräte werden über die bestehende Kopplung verbunden, nicht über ein neues Benutzerverwaltungssystem.
3. **Rundungsausgleich:** Aufrundungsfehlbeträge aus der vorhandenen Betriebskasse ergänzen, Abrundungsreste dort belassen. Je Abrechnungsperiode Beleg/Verbleib und ausdrückliche Bestätigung; tatsächliche Auszahlung anschliessend separat bestätigen. Bei CHF 0.00 ist kein Kassenausgleich erforderlich. Keine persönlichen Überträge und keine neue Kassenverwaltung.

## Ausführung nach Freigabe und sicherer Rückfall

Bedienabnahme + drei Freigaben + konkret bestätigte Gerätezugänge festhalten → offene lokale Eingaben sichern, alte Tabs schliessen → aktuelle Drift-/Sicherungsprüfung → SQL atomar installieren, Gate zunächst geschlossen → exakt freigegebenen App-Build bereitstellen → Rechte und Sperre prüfen → bestätigte Zugänge einzeln als Operatoren und Gate mit Freigabereferenz/-zeit aktivieren → echten Arbeitsstand lesend prüfen, erste reale Abrechnung begleitet durchführen. Keine synthetischen Zahlungen in Production erzeugen.

Vor Aktivierung ist Transaktions-Rollback möglich. Danach bei Problemen vorbereitete Pause `release/PAUSE-PREPARED-NOT-APPLIED.sql` (SHA256 `49e72f435bedac6e6cab7e5067f865ecf27037dc3042e36712c092d40e9d2fc4`) und App-Gate schliessen; kompatiblen Client und alle Belege erhalten. Keine alte Sicherung über neue Zahlungen, kein Rücksprung auf den unsicheren Altclient, kein Löschen historischer Daten.

**Offen:** Marcos kurzer vollständiger Bediencheck, die drei ausdrücklichen Entscheidungen und die eindeutige Zuordnung der tatsächlich verwendeten Gerätezugänge. Keine weitere Funktionsentwicklung vorgesehen. Die technische Vorbereitung ist abgeschlossen; eine unbedingte Production-Ausführung ist damit noch nicht autorisiert.
