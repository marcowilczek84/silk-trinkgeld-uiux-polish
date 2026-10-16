# C2 Schritt 5b – isolierte native Supabase-Abnahme

Nur der vorhandene C2-Branch und ein öffentliches Repository dürfen den Workflow starten. Standard-Runner `ubuntu-24.04`, maximal 30 Minuten, keine Repository-Secrets, kein Cache, kein kostenpflichtiger Runner oder Dienst. Bereinigte Ergebnisse erscheinen im Run-Log und benötigen keinen Actions-Artefaktspeicher. Quellcode des Supabase-Docker-Stacks und Actions sind auf Commit-SHAs festgelegt. Images sind versioniert; der Lauf zeichnet zusätzlich ihre Digests auf.

Der komplette selbst gehostete Stack läuft im **internen Docker-Netz** des kurzlebigen Runners: PostgreSQL 17, PostgREST, Auth, Realtime, Storage, API-Gateway, Studio, Meta, Functions, Pooler und lokaler Mailfänger. Gateway und Datenbank sind ausschliesslich über einen Runner-lokalen TCP-Forwarder auf Loopback erreichbar. Die Container veröffentlichen keine Host-Ports und besitzen keinen Internetzugang. Synthetische Schlüssel werden pro Lauf erzeugt und maskiert. Es gibt keine Supabase-Anmeldung, Verknüpfung mit Cloud-Projekten oder Deployment-Schritte. Die synthetische Functions-Antwort enthält keine externen Imports. Kassen-/Zahlungsereignisse lösen keine Zahlungen aus.

Die Datenbank heisst `silk_c2_test_ci`. Die vorbereiteten V1.4/C2-SQL-Dateien des geprüften Commits werden nur dort nach einer synthetischen Grundstruktur installiert. `auth.uid()`, echte Benutzer, Sitzungen und Token kommen vom laufenden Supabase Auth. Der Installationsbenutzer erhält nur in dieser kurzlebigen Datenbank Schema-/Referenzrechte und das Eigentum an der Realtime-Publikation. API-Rollen erhalten keine zusätzlichen Administratorrechte. Die bestehende Umgebungssperre wird weder ersetzt noch umgangen. Das Testfixture aktiviert ausdrücklich nur synthetische Operationen. Historische Daten sind nicht vorhanden.

## Prüfungen

- Bestehende 92 Regressionstests und 47 C2-Referenztests bleiben erhalten.
- 2’028 Finanzperioden plus Unicode-Gleichstand auf nativem PostgreSQL 17.
- Echte parallel wartende PostgREST-Transaktionen, durch unterschiedliche PostgreSQL-Backend-IDs unter einer gehaltenen Zeilensperre nachgewiesen; Konflikt, identische und konkurrierende Wiederholungen.
- Auth-Login/Refresh, ungültiges Token, RLS, getrennte Rechte und Rechteentzug mit noch gültigem Token.
- Rechteentzug während einer gehaltenen Zeilensperre: Speichern, Finalisieren und Zahlungsbestätigung müssen nach dem Warten erneut autorisieren.
- Realtime-Ereignisse nach Commit; kein späteres Ereignis an Nichtmitglieder/entzogene Mitglieder.
- Netto-Korrektur, getrennte Überzahlung/Rückzahlung, unveränderliche Belege, Schutz gegen alte Protokolle und direkte Schreibzugriffe.
- Gebaute App mit echter lokaler API, zwei Auth-Sitzungen, verlorener Abschlussantwort, Neuladen, Offline-Konflikt und drei Viewportgrössen in Chromium.

## Nachgewiesene Korrektur

Der native Test hat belegt, dass bereits wartende Schreib-, Finalisierungs- und Zahlungsbestätigungsanfragen nach einem Rechteentzug trotzdem ausgeführt wurden. Die drei vorbereiteten RPCs prüfen deshalb ihre Rechte erneut nach Erhalt der Zeilensperre, bevor sie eine Änderung oder Wiederholungsantwort zulassen. Die SQL-Dateien bleiben ausschliesslich vorbereitete Kandidaten; keine produktive Migration.

PostgREST bildet den bestehenden SQL-Konfliktcode `40001` auf HTTP 500 ab. Die Tests prüfen diesen Code, den fachlichen Konflikt und den erhaltenen Datenstand. Die bestehende App verarbeitet `40001` bereits als Versionskonflikt; die native API wird nicht auf die künstliche HTTP-409-Antwort des früheren Testadapters umgeschrieben.

## Abnahmegrenzen und Bedienablauf

Ein erfolgreicher CI-Lauf ist **Runner-lokale native Integration**, keine gehostete Cloud- oder physische Geräteabnahme. Die echte Finalisierung bleibt gesperrt. Kassenregel und die Benutzeroberfläche für Bestätigungen sind weiterhin offen.

Für die spätere Bedienoberfläche ist folgende Reihenfolge vorzusehen, noch nicht freigegeben:

1. Aktuelle Periode/Revision und offenen Kassenbetrag anzeigen; Berechnung und tatsächlichen Nachweis klar unterscheiden.
2. Berechtigte Person erfasst tatsächliche Quelle bzw. Empfänger/Konto, signierten Betrag und eindeutige Belegreferenz. Ein Dialog muss vor Bestätigung Zeitraum und Betrag zusammen zeigen. Keine Vorbelegung als bereits ausgeglichen.
3. Abschlussbeleg und tatsächliche Auszahlung bleiben getrennt. Zahlungen pro Empfänger ausdrücklich bestätigen; fehlende Ausgangsbestätigung sperrt Netto-Korrektur.
4. Verbindungsverlust zeigt „Bestätigung ungeklärt“. Derselbe Auftrag erhält dieselbe Anfrage-ID, auch nach Neuladen. Keine neue Zahlung aus einer Wiederholung ableiten.
5. Neuere Revision/entzogene Berechtigung verlangt erneutes Laden bzw. beendet den Vorgang. Belegreferenz-Duplikate führen zum vorhandenen Nachweis, nicht zu einer zweiten Buchung.
6. Überzahlungen separat anzeigen. Rückzahlung erst nach Eingang bestätigen, keine automatische Verrechnung.

Diese Schritte werden derzeit nur über die Test-API und vorhandene Beleganzeige geprüft. Ein endgültiger Bedienablauf benötigt die fachliche Entscheidung zum Kassenverfahren und anschliessend eigene Touch-/Geräteabnahme.

Backup, Wiederherstellung, produktiver Rollback und getrennte App-/SQL-Freigaben gehören weiterhin zur späteren Releaseprüfung. Der Runner entfernt ausschliesslich seinen eigenen synthetischen Stack.
