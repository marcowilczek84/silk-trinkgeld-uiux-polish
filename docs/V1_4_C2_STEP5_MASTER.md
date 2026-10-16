# SILK Trinkgeld V1.4 C2 – Schritt 5 / MASTER-Übergabe

Ambassador Digital – Simply Smarter. · 16.10.2026

**Status: lokal integrierter und geprüfter Kandidat. Keine vollständige Server-/Production-Abnahme. Echte Finalisierung bleibt gesperrt.**

## Übernommener Stand

Repository: `marcowilczek84/silk-trinkgeld-uiux-polish`  
Branch: `tips-v14-c-whole-chf-complete-period-20261016`  
MASTER-Ausgangspunkt: `f5f652668de139934655043cad26a71762aaa3a9`. Der Remote-Branch stand beim Abgleich und vor der Sicherung unverändert auf diesem Commit; keine fremden Arbeiten wurden ersetzt. Der ältere lokale V1.4-Branch blieb erhalten. Der Commit dieses Berichts bezeichnet den neuen Kandidaten; die ausgelieferte Übergabe nennt seine vollständige SHA.

Die vorhandenen C2-JavaScript-Module, fachlichen Regeln und vorbereiteten SQL-Funktionen wurden übernommen. Kein neues Gesamtaudit und keine neue Variantenentscheidung.

## Implementiert

- Die gebaute App zeigt C2: Periodengesamtsumme einmal kaufmännisch auf ganze CHF; anschliessend grösste **exakte** Reste auf Bereiche und Mitarbeitende. Bestehende Prozentsätze und Emily-/Dienstlogik bleiben erhalten. Keine persönlichen Restkonten oder Periodenüberträge.
- Serverprüfung des aktuellen, revisionsgesicherten Entwurfs; die App vergleicht Beträge, exakte Ansprüche und Bereichsverteilung mit JavaScript. Bei Abweichung kein Abschluss.
- Neue RPCs `tip_c2_preview`, `tip_c2_finalize`, `tip_c2_confirm_cash`, `tip_c2_ledger`. Speicherung nutzt weiterhin `tip_write_workspace_v14`; C2 ersetzt den alten Finalisierungsweg durch eine Sperre.
- Testfinalisierung: Workspace-Zeilensperre, erwartete Revision, serverseitige Eingabeprüfung und Berechnung, eindeutige Anfrage-ID, wiederholbare Antwort, Überschneidungsschutz, unveränderliche `final-v4-c2`-Belege. Ein bestätigter Abschluss ist **keine bestätigte Auszahlung**.
- Netto-Korrektur: Original-ID, Grund, vorheriger Korrekturbeleg und Zahlungsstand-Revision. Nur ausdrücklich bestätigte Ausgangsauszahlungen und nachfolgende Auszahlungen/Rückzahlungen bilden die Basis. Pro Empfänger werden Nachzahlung und Überzahlung separat ausgewiesen. Keine automatische Auszahlung oder Verrechnung zwischen Personen.
- Auszahlungsnachweise: vollständige Anfangsbestätigung erforderlich; eindeutige Ereignis- und Belegreferenzen, Betrag, Person, Zeitpunkt, Art. Nachträgliche Änderung/Löschung der Ereignisse ist gesperrt. Wiederholte Bestätigung derselben Anfrage erzeugt keinen zweiten Eintrag. Weitere Auszahlungen/Rückzahlungen dürfen den jeweiligen offenen Betrag nicht überschreiten. `tip_c2_ledger` macht die Nachweise nach Neuladen erneut abrufbar.
- Kassenrundung: Berechnung allein bestätigt nichts. Beim Testabschluss verlangt eine Differenz einen passenden expliziten Nachweis. Bei Korrekturen zählt die **Änderung gegenüber dem vorherigen Kassenrundungsnachweis**, nicht nochmals die gesamte Differenz des korrigierten Ziels.
- Verlorene Antworten: persistierte Anfrage-ID, Wiederaufnahme nach Neuladen mit unverändertem Auftrag. Ungeklärte Anfragen blockieren einen anderen Auftrag. Versionskonflikte und fehlende Rechte werden zurückgewiesen.
- Zwei nachgewiesene Integrationsfehler korrigiert: JSONB-Schlüsselreihenfolge löste unnötiges Zurücksetzen der Ergebnisanzeige aus; Unicode-IDs mit gleichen Resten konnten in JS und SQL unterschiedlich sortieren. SQL bildet jetzt die vorhandene JavaScript-UTF-16-Reihenfolge unabhängig von der Datenbank-Collation ab.
- Korrekturbelege zeigen auf schmalen Bildschirmen die bestehenden responsiven Tabellenkarten mit bestätigtem Betrag, Ziel, Nachzahlung und Überzahlung. Keine umfassende Neugestaltung.

## Sperren und Datenbankumfang

Neue private Tabellen: `tip_c2_gate`, `tip_c2_operators`, `tip_c2_chains`, `tip_c2_cash`, `tip_c2_operations`. RLS ist aktiviert; öffentliche/Client-Tabellenrechte sind entzogen. RPCs prüfen Mitgliedschaft und für Schreibaktionen zusätzlich die getrennten Abschluss-/Kassenrechte. Private Helfer sind nicht öffentlich ausführbar; SECURITY-DEFINER-RPCs verwenden einen leeren Suchpfad.

Die SQL-Vorlage legt **keine** Freischaltungs- oder Berechtigungszeilen an. Testbuchungen verlangen zusätzlich eine markierte synthetische Umgebung: lokale PostgreSQL-Datenbank `silk_c2_test_*` oder PGlite sowie ausdrücklich angelegte Testberechtigungen. Belege sind als synthetisch gekennzeichnet. Diese Sperre ist kein fertiger Production-Freigabemechanismus.

Dateien, nur für isolierte Tests und in dieser Reihenfolge:

1. `docs/production/v14-integrity-PREPARED-NOT-APPLIED.sql`
2. `v14-prototypes/variant-c-postgres-PREPARED-NOT-APPLIED.sql`
3. `docs/production/c2-server-PREPARED-NOT-APPLIED.sql`

**Nicht als Produktionsmigration ausführen.** Die Dateien enthalten eigene Transaktionen; ein späterer Release braucht einen gesondert geprüften atomaren Migrations-/Versionswechsel. Keine historischen Belege werden automatisch übernommen, neu berechnet oder mit Auszahlung bestätigt. Ein vorhandener V1.3/V1.4-Beleg ohne belastbare Zahlungs-/Kassenbasis benötigt gesonderte Prüfung.

Vercel-Previews bleiben ohne Supabase-Verbindung. Die lokale Testverbindung ist nur mit einer Loopback-URL und ohne Vercel-Umgebung zulässig. Die echte Abschlussfunktion bleibt im C2-Client gesperrt. Ein zusätzlicher Simulationsbutton existiert nur in der lokalen Testkonfiguration. Zahlungsbestätigungen werden für die Abnahme über die Test-API erfasst; eine produktive Bedienoberfläche ist nicht freigegeben.

## Tatsächlich ausgeführte Prüfungen

| Ebene | Ergebnis / Umfang | Grenze |
|---|---|---|
| Lokale Regression | `npm test`: **92 bestanden, 0 fehlgeschlagen, 0 übersprungen**; einschliesslich der übernommenen 84 V1.4-Tests | Keine Cloud-Abnahme |
| C2-Referenztests | **47 bestanden**; u. a. 4.000 Verteilungs-, 5.000 Rappen- und 2.000 gewichtete Finanzfälle | Szenarien innerhalb der Tests, nicht zusätzlich 11.000 einzelne Testfälle gezählt |
| PostgreSQL-SQL | Vorbereitete synthetische SQL-Abnahme ausgeführt; **2.028 JS/SQL-Perioden identisch**, zusätzlich Unicode-Gleichstand | PostgreSQL 18.6 in PGlite 0.5.10/WebAssembly, kein nativer PostgreSQL-17-Server |
| Rechte und HTTP | Synthetisch signierte JWTs, ungültige/abgelaufene Token, Nichtmitglied, inaktive Mitgliedschaft, Bearbeitungsmitglied ohne Abschluss-/Kassenrecht, Direktzugriff, parallele HTTP-Anfragen, Revisionen und Wiederholung geprüft | Test-HTTP-Adapter mit serieller SQL-Warteschlange; kein Supabase Auth oder produktiver PostgREST |
| Integrierte Browser | Chromium und WebKit; jeweils 393×852, 1024×768, 1440×900; zwei getrennte angemeldete Browserkontexte; Serververgleich, UI-Testabschluss, verlorene Antwort, Neuladen, Nettokorrektur, Archivschutz, Nachweisabruf, Offline-Konflikt | Browseremulation, keine physischen Geräte; erwartete Browser-Netzwerkfehler während absichtlich unterbrochener Verbindung separat erfasst |
| Build / statische Prüfung | Build, ESLint und vorhandener begrenzter TypeScript-Check bestanden | TypeScript umfasst weiterhin nur den vorhandenen Projektumfang |
| Native-/PostgREST-Versuch | Nativer PostgreSQL-Start nicht möglich; PostgREST 16.4 konnte einen C2-Preview erfolgreich lesen, die vollständige Fehlerfall-Abnahme am PGlite-Socket schlug fehl | **Nicht bestanden / technisch blockiert**, keine Erfolgsbehauptung für PostgREST |
| Cloud | GitHub-Branch und Vercel-Zuordnung geprüft; Supabase-Projekte, Tabellenstruktur, Mitgliedschaftsfunktion und RLS-Prädikat nur gelesen | Keine C2-Cloud-Integration, keine Migration oder Testbuchung in Cloud-Datenbanken |
| Physische Geräte | **Nicht ausgeführt** | Echte iPhone-/iPad-/Desktop-Abnahme offen |

Die lokale Mitgliedschaft verwendet denselben am 16.10.2026 gelesenen Fachtest wie die Cloud: Workspace, `auth.uid()` und `active=true`. Synthetische Mitgliederdaten ersetzen echte Benutzer. Die SQL-Rollensperren sind damit lokal geprüft; dies ersetzt keine Prüfung mit echten Supabase-JWTs und einem nativen Mehrverbindungsserver.

Reproduzierbar: `npm ci`, `npm test`, `npm run test:variant-c`, `npm run lint`, `npm run typecheck`. Für den isolierten Browserkandidaten: Build mit `SILK_C2_LOCAL_API=http://127.0.0.1:55441` und `SILK_SUPABASE_PUBLISHABLE_KEY=synthetic-test-key`; danach `npm run test:browser:c2` mit installierten Playwright-Browsern beziehungsweise `QA_EXECUTABLE`. Der Schlüssel ist ausschliesslich ein Dummy für den lokalen Adapter. Port 55441 wird nur an 127.0.0.1 gebunden. Jede Testdatenbank wird neu aus synthetischen Fixtures aufgebaut.

## Finanzielle Nachweise

| Beispiel | Geprüftes Ergebnis |
|---|---|
| CHF 1’000.00 | Service 683, Küche 292, Housekeeping 25; Summe CHF 1’000, keine CHF 1’001 |
| CHF 1’801.10 | Verteilungsziel CHF 1’801; berechneter Kassenrundungsbetrag −CHF 0.10; nicht automatisch ausgeglichen |
| Korrektur CHF 1’801.10 → CHF 1’801.90, Ausgangszahlung bestätigt | Neues Ziel CHF 1’802, nur CHF 1 zusätzliche Auszahlung fällig. Kassenrundungsnachweis verändert sich von −0.10 auf +0.10: zusätzlicher Nachweis +CHF 0.20. Original unverändert |
| Neue Verteilung bei gleicher Gesamtsumme | Nachzahlung CHF 341 an B und Überzahlung CHF 341 bei A separat; keine automatische Aufrechnung. Bestätigte Teilrückzahlung vermindert nur As Überzahlung |

Für C2 gilt `Eingang + dokumentierter Rundungsbetrag = Verteilungsziel`. Ein positiver Rundungsbetrag darf erst nach tatsächlicher, belegter Finanzierung als gedeckt gelten. Die Software erteilt keine Bank-/Kassenzahlungsanweisung; Testbestätigungen simulieren nur den Nachweis bereits erfolgter Bewegungen.

## Betriebliches Kassenverfahren – zur Entscheidung, noch nicht freigegeben

Vorschlag: ein **periodenbezogener Kassenrundungsbeleg**, ohne persönliche Restkonten und ohne Anrechnung auf eine nächste Trinkgeldperiode.

1. Schichtleitung zählt den tatsächlichen Eingang und prüft das C2-Verteilungsziel. Der angezeigte Rundungsbetrag bleibt zunächst offen.
2. **Positiver Betrag** (z. B. +0.50): genau diesen Betrag aus einer ausdrücklich genehmigten betrieblichen Kassenquelle ergänzen. Quelle, Belegnummer, Betrag, verantwortliche Person und Zeitpunkt dokumentieren.
3. **Negativer Betrag** (z. B. −0.10): verbleibende Münzen getrennt und mit Periodenbezug nachweisen. Vorgeschlagen ist eine betriebliche Kassenrundungsbuchung; deren Empfänger/Konto muss die Projekt-/Betriebsleitung ausdrücklich festlegen. Bis dahin kein Abschluss und keine automatische Vereinnahmung.
4. Erst nach tatsächlichem Vorgang und Nachweis ist der Kassenpunkt bestätigt. Die anschliessende Auszahlung wird **separat**, mit tatsächlich bezahltem Betrag pro Empfänger, bestätigt.
5. Korrektur: neue Ansprüche gegen die bestätigte Zahlungskette rechnen. Kassenrundungsbelege nur um die neue Differenz ergänzen. Überzahlungen als eigenen offenen Vorgang behandeln; Rückzahlungen erst nach tatsächlichem Eingang bestätigen. Kein automatischer Lohn-/Trinkgeldeinbehalt.

**Konkrete Entscheidungen für MASTER/Projektinhaber:**
- Ist die betriebliche Kassenquelle für positive Differenzen genehmigt? Wer darf ergänzen und bestätigen?
- An welches ausdrücklich genehmigte Konto bzw. welchen Empfänger gehen negative Differenzen? Bis zu dieser Entscheidung bleibt der Betrag offen. Keine neue Entscheidung über die bereits festgelegte C2-Verteilungsregel nötig.
- Welche ausschliesslich SILK zugeordnete native PostgreSQL-/Supabase-Testinstanz darf für die vollständige Serverabnahme verwendet werden? Vor Neuanlage sind Organisation und gegebenenfalls Kosten zu bestätigen. Die vorhandenen Frühstücks-/Gastgedächtnis-Projekte werden nicht dafür verändert.

## Verbleibende Blocker und nächste Phase

1. Dedizierte native/Cloud-Testumgebung. Vorhanden sind nur gemeinsam genutzte bzw. fachfremde Supabase-Projekte. In der hiesigen Arbeitsumgebung ist der Wechsel zu einem unprivilegierten PostgreSQL-Prozess nicht möglich (`runuser: cannot set groups`). Der PGlite-Socket bildet native Verbindungspools nicht zuverlässig ab: u. a. HTTP 503 statt normaler SQL-Fehlerantwort; mit Prepared Statements Namenskonflikt. Der funktionierende lokale HTTP-Adapter ist ausdrücklich eine begrenzte Alternative für App-/SQL-Integrationstests.
2. Dort noch prüfen: native Zeilensperren unter echten parallelen Transaktionen, PostgreSQL 17, tatsächliches PostgREST-Fehler-/Antwortformat, Supabase Auth, Mitgliedschaftsentzug, Realtime und Versionswechsel alter Clients. Die Testfreischaltung muss für die konkrete isolierte Instanz gesondert und weiterhin ohne Production-Erlaubnis eingerichtet werden.
3. Betriebliches Kassenverfahren und Berechtigte entscheiden; anschliessend den tatsächlichen Nachweis-/Bestätigungsablauf abnehmen. Aufbewahrung und Freigabe bei Überzahlungen organisatorisch festlegen.
4. Physische Geräteabnahme am integrierten Serverkandidaten. Die sechs Browserläufe ersetzen sie nicht.
5. Danach eigene Releaseprüfung: Backup-, Wiederherstellungs- und Rollback-Nachweise, atomare Migration, Rückwärts-/Versionsverträglichkeit. Diese Nachweise wurden in Schritt 5 **nicht** behauptet oder durch Eingriffe in Production erzeugt.

**Production-Empfehlung: noch nicht freigeben. App und SQL brauchen getrennte ausdrückliche Production-Freigaben.**

## Sicherung / Rückfallstrategie

Der ursprüngliche MASTER-Commit bleibt unverändert in der Git-Historie; Änderungen liegen ausschliesslich auf dem genannten Entwicklungsbranch. Rückfall des Kandidaten durch gezieltes Revert seiner Commits bzw. Auswahl des bisherigen Preview-Deployments. Keine Rücksetzung gemeinsamer Historie und keine Löschung von Produktionsdaten.

Es wurde keine produktive SQL-Migration angewendet. Daher ist jetzt kein Datenbank-Rollback erforderlich. Ein späterer Release darf neue Belege/Ereignisse bei Rücknahme nicht löschen oder auf alte Vollauszahlungslogik zurückschalten. Er muss Schreib-/Abschlussfunktionen sperren und eine separat geprüfte Wiederherstellungsstrategie verwenden.
