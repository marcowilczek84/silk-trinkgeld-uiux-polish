# SILK Trinkgeld - Final Cloud QA & Production Readiness V1.1

Stand: 15.10.2026. Gemeinsamer Abschluss der beiden konsolidierten QA-Aufträge. Basis: `7d544fe38a412e6090880e3635972c844ac9867b`. Ein Entwicklungsbranch: `tips-data-integrity-final-qa-20261015`. Keine Neuentwicklung von `main`.

## Freigabeempfehlung

**Kein ungeschütztes Production-Deployment.** Die ID-Korrekturen sind für neue Clients abgesichert. Ein sicherer Versionswechsel benötigt zusätzlich die ausdrücklich freizugebende serverseitige Versionssperre. Eine Client-Aktualisierung allein kann bereits geöffnete alte Browser nicht zuverlässig am Schreiben hindern.

Die SQL-Vorbereitung liegt unter `docs/production/integrity-guard-PREPARED-NOT-APPLIED.sql`. Sie wurde ausschliesslich in einer lokalen PostgreSQL-Testinstanz (PGlite) ausgeführt. In Supabase wurde keine Migration, Funktion, Richtlinie oder produktive Abrechnung verändert. Vor späterer Aktivierung muss die identische SQL-Fassung in einem getrennten Supabase-Projekt bzw. einer Datenbankbranch mit REST-Anbindung abgenommen werden. Ein lokaler SQL-Test ersetzt diesen Integrationsschritt nicht.

## Verifizierter Bestand

- GitHub: Fix V1 ist weiterhin der neueste bestehende Entwicklungsstand. Kein offener Pull Request festgestellt. `main` ist älter und wurde nicht als Basis verwendet.
- Production: `16fab0e23fa58a0fb59d4c8b4c7aa66dbbb79440`, Deployment `dpl_AckEsRbZoAmihU4wmn7qEtbRrvMj`.
- Bisherige Preview: `7d544fe3`, Deployment `dpl_T46JZYwLg4QWufALXgyQnAptMbFK`.
- Supabase: Projekt `xgbbwnmqgpwxxftnjrkc` (angezeigter Name „Ambassador Breakfast“) wird gemeinsam genutzt. Trinkgeld verwendet die `tip_*`-Tabellen. Die gemeinsame JSON-Synchronisierung ist seit der Migration `20261004110848 / silk_shared_work_state` vorhanden.
- Produktiver Trinkgeld-Workspace: `edb875da-fea6-49a0-8e50-e314254752a6`.
- Neuer QA-Workspace: `aec9330b-678a-40f8-b2c3-c75523490115`, ausschliesslich synthetische Daten und eigene anonyme Auth-Sitzungen. Trennung durch Workspace-ID und RLS, **kein physisch separates Supabase-Projekt**. Die Testclients haben keine produktive Mitgliedschaft.

## Korrekturen dieser Phase

1. Wiederholte Finalisierung derselben unveränderten Eingaben war nicht idempotent: Ein erneuter Funktionsaufruf erzeugte eine zweite Archiv-ID. Auf V1 reproduziert; jetzt bleibt das erste Ergebnis samt gespeicherten Bytes erhalten. Explizites Speichern eines neuen Entwurfs bleibt möglich.
2. Historische und abgeschlossene Abrechnungen haben im neuen Client keine Löschaktion mehr. Auch beide direkten Lösch-Einstiegspunkte weisen Archivlöschungen zurück. Entwürfe können weiterhin bewusst gelöscht werden. Kein vorhandenes Archiv wird umgeschrieben.
3. Der gebündelte Supabase-Client kennzeichnet seine REST-Anfragen mit `x-silk-client-protocol: 3`. Der vorbereitete Server-Guard kann damit bekannte inkompatible Schreibclients sperren. Dieser Header ist ein Kompatibilitätsmerkmal, kein Ersatz für Authentifizierung oder RLS.
4. Explizite Server-Sperren (Versionswechsel, veralteter Client, Archivschutz, ungültiges Dokument) halten Synchronisierung an, zeigen einen verständlichen Hinweis und erhalten lokale Daten. Keine Endlosschleife mit erneuten Schreibversuchen; Fortsetzung nach Prüfung und Neuladen.
5. Vercel liefert `Cache-Control: no-cache, must-revalidate`. Reload prüft damit den aktuellen Stand. Bereits offene Tabs werden dadurch nicht rückwirkend aktualisiert. Kein Service Worker nachgewiesen.

Die stabilen Legacy-Schlüssel, UUIDs für neue Einträge, Anzeigenamen und der Entwurfsschutz aus V1 bleiben erhalten. Keine Änderung an Prozentverteilung, Housekeeping, Gewichtung, Periodenberechnung, Emily-Pauschale oder Rundung. MIA bleibt im gelesenen Code wie F1 gewichtet; FF2/OFS erhalten keine neue Sonderregel. Fachliche Klärung bleibt separat.

## Prüfansatz und Nachweise

Die ausführlichen maschinenlesbaren Ergebnisse stehen im Abschlusspaket. Bestehende 33 Tests wurden übernommen. Insgesamt 54 automatisierte Tests prüfen zusätzlich Doppelfinalisierung, Archivschutz, Sperrzustände sowie 15 SQL-Schutzfälle. TypeScript prüft weiterhin gezielt das Identitätsmodul und dessen Vertrag; die Gesamtanwendung bleibt JavaScript.

Cloud-Szenarien mit echten Supabase-Sitzungen: gleicher Ausgangsstand in A/B, gleichzeitige Mitarbeiter-/Dienstumbenennung, exakte Beträge, vollständiger Neustart, alter Entwurf, unabhängige Änderungen, widersprüchlicher gleicher Betrag, Konflikterhalt nach Reload, explizite Auflösung, Offline/Wiederverbindung, wiederholtes Speichern und Finalisieren, veralteter Editor, Berechtigungen. Die Szenarien nutzen echte REST-Aufrufe und die Anwendungssynchronisierung mit explizitem Abgleich; die Realtime-Zustellung allein ist damit nicht separat garantiert.

Archive werden kanonisch nach Schlüsseln sortiert und mit SHA-256 verglichen. Das vermeidet falsche Unterschiede durch PostgreSQL-JSON-Schlüsselreihenfolge; alle Inhalte einschliesslich HTML, Ergebniszahlen und Eingabesnapshots bleiben im Vergleich enthalten. Ein Archiv, ein alter Entwurf und ein Legacy-HTML-Archiv dienen als Kontrollobjekte.

Der ältere Tabellen-Schreibpfad wurde zweimal über REST versucht und lief in einen Transport-Timeout. Daraus wird kein bestandener HTTP-Abnahmetest abgeleitet. Der identische isolierte Schreibversuch unter der tatsächlichen `authenticated`-Rolle und der QA-Identität wurde direkt durch PostgreSQL mit `40001 / SILK_UPDATE_REQUIRED` abgewiesen. Anschliessend lagen null Legacy-Testzeilen vor. Kein weiterer gleichartiger REST-Retry durchgeführt.

Zusätzlicher echter Browser-Cloud-Test: zwei unabhängige Chromium-Kontexte in 393 × 852 und 1194 × 834. Neu angelegte Mitarbeiter- und Dienst-UUIDs, Zuordnung, Umbenennung und Browser-Reload mit Wiederverbindung bestanden. Alle beobachteten REST-Anfragen des tatsächlichen Bundles trugen Protokoll 3; Archiv-Prüfsumme unverändert. Kein fremder Netzwerk- oder Workspace-Zugriff im Test.

## Sicherheitsanalyse

`tip_workspace_state` hat RLS aktiviert. Die Rolle `anon` besitzt kein SELECT-Recht. Angemeldete anonyme Supabase-Sitzungen erhalten die Rolle `authenticated`; Zugriff erfordert zusätzlich eine aktive Workspace-Mitgliedschaft. Ein angemeldeter, nicht verbundener Testclient konnte weder lesen noch aktualisieren. Getrennte Rollen für Abrechnung, Verwaltung und Nur-Lesen existieren im betrachteten Schreibpfad nicht.

Mitglieder können derzeit das gesamte `payload` aktualisieren. Direkte Zeilenlöschung ist nicht gewährt; das verhindert aber nicht das Entfernen eines Archivs innerhalb des JSON-Dokuments. Bestehende Datenbankvalidierung prüft im Wesentlichen `format = 2`. Alte JSON-Clients werden nicht durch den bisherigen Legacy-Tabellen-Guard erfasst. Diese Risiken begründen den vorbereiteten zusätzlichen Guard.

Die Paarungsfunktion ist `SECURITY DEFINER`, prüft `auth.uid()`, einen gehashten aktiven Code, Ablauf und Nutzungslimit. Der Supabase-Advisor weist entsprechend auf ihre privilegierte Ausführung sowie auf Policies für anonyme Auth-Sitzungen hin. Das ist nicht gleichbedeutend mit frei lesbaren Trinkgelddaten. Mitgliedschaft bleibt die wirksame Zugriffsschranke. Der Gerätewert `revoked_at` ist nicht Teil dieses Mitgliedschaftsprädikats; ein späterer Geräteentzug muss die Mitgliedschaft berücksichtigen.

Vorbereiteter Guard: nur verifizierter Restaurant-Silk-Workspace, kein anderer Workspace; Protokoll 3 erforderlich; Wartungspause möglich; bereits gespeicherte Nicht-Entwurfsarchive unveränderlich; Mindeststruktur und IDs geprüft; neue ungültige Zuordnungen abgewiesen; ungelöste alte Referenzen unverändert lesbar. Es handelt sich nicht um eine vollständige serverseitige Nachberechnung der Fachlogik oder ein neues Rollenmodell.

Advisor-Referenzen: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable und https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins . Hinweise zu anderen Anwendungen wurden nicht verändert.

## Kontrollierter Rollout nach gesonderter Freigabe

1. **Vorbedingungen:** Guard-Fassung in getrenntem Supabase-Projekt/Branch über echte REST-Clients testen; physische Safari-Prüfung auf iPhone und iPad durchführen; konkreten Code-Commit, SQL-Hash und kompatiblen Rückfall-Build freigeben. Keine direkte Freigabe der lokalen Preview-Konfiguration für Production: diese enthält absichtlich keine Supabase-Verbindung.
2. **Bestand sichern:** Wartungsfenster ankündigen, alle bekannten Geräte und offenen Tabs erfassen, Offline-/Konfliktstände lokal exportieren, aktuelle gemeinsame Revision und Datenexport samt Prüfsumme gesichert ablegen. Vorhandene Mitgliedschaften entsprechen nicht zwingend physischen Geräten. Keine Cache-Löschung vor Sicherung.
3. **Schreiben anhalten:** Freigegebenen, workspace-spezifischen Guard zunächst im Modus `paused` aktivieren. Cloud-Schreiben einschliesslich alter JSON-Clients wird gesperrt; lokale Änderungen bleiben erhalten. Danach einen zweiten konsistenten Datenexport erzeugen. Dieser Schritt ist eine produktive DB-Änderung und braucht ausdrückliche Zustimmung.
4. **Kompatiblen Build bereitstellen:** Exakten freigegebenen Commit mit geprüfter Production-Konfiguration zunächst ohne Domainumschaltung bauen. Verifizieren, dass Protokoll 3 enthalten ist und die korrekte Supabase-Umgebung verwendet wird. Tests/Preview sind kein Ersatz für diese Buildprüfung.
5. **Geräte aktualisieren:** Nach Freigabe auf den vorbereiteten Build umschalten. Alle bekannten Geräte und Tabs vollständig neu laden; Version/Protokoll bestätigen, lokale offene Eingaben mit der Cloud vergleichen. Keine lokale Datenbank pauschal löschen. Geräte ohne bestätigten Stand bleiben vom gemeinsamen Schreiben ausgeschlossen.
6. **Kontrolliert öffnen:** Guard auf `active` schalten. Ein Pilotgerät synchronisiert, danach zweites Gerät. IDs, Anzeigenamen, Tageszuordnungen, aktive Entwurfs-ID und Referenz-CHF-Beträge vergleichen. Archive müssen unveränderte Prüfsummen haben; Änderungen aktueller Tagesdaten dürfen Archive nicht neu berechnen.
7. **Beobachten:** Erste echte Abrechnung begleiten; Konflikte, 42501/23514, Timeout-Raten, Client-Protokoll und Revisionsfortschritt kontrollieren. Fehlende Realtime-Ereignisse zusätzlich über manuelles Synchronisieren/Reload erkennen. Erst nach stabiler Abnahme mit der visuellen Modernisierung beginnen.

## Rollback ohne Verlust neuer Abrechnungen

Bei Auffälligkeiten zuerst den Workspace-Schreibpfad pausieren und alle seit Release eingegangenen Revisionen sowie Offline-Eingaben sichern. Den aktuellen gemeinsamen Datenbestand behalten. Auf einen vorher getesteten Build mit demselben Protokoll 3, Label-/UUID-Verständnis und v2-Synchronisierung wechseln; die serverseitige Versionssperre bleibt aktiv. Geräte neu laden und revisionsbezogen abgleichen.

**Nicht** auf `16fab0e2` oder einen Vor-ID-Client zurückrollen, nachdem neue Labels/UUIDs gespeichert wurden. **Nicht** das Backup vor Release über neuere Abrechnungen schreiben. Existiert noch kein unabhängig geprüfter kompatibler Rückfall-Build, bleibt die Schreibpause aktiv, während eine gezielte Vorwärtskorrektur vorbereitet wird. Datenkorrekturen nur einzeln, mit Nachweis und separater Zustimmung.

## Grenzen

Keine physischen Geräte vorhanden. WebKit unter Linux ist keine vollständige Safari-/iOS-Abnahme. Kamerazugriff in WebKit wurde mit verweigerter Berechtigung simuliert; Textimport ist Bestandteil des Bedienablaufs. Beim Aufbau der WebKit-Laufzeit gab es Prozessabbrüche; ein vollständiger Lauf wurde danach erfolgreich abgeschlossen. Reale Kamera-/QR-Erkennung gehört nicht zum Datenintegritätsnachweis.

Der neue Server-Guard ist vorbereitet, jedoch nicht im gemeinsamen Supabase-Projekt aktiviert. Eine Veröffentlichung ohne diesen Übergangsschutz wird nicht empfohlen. Kein neuer produktiver Datenexport mit Personendaten ist Bestandteil dieses öffentlichen Repositorys oder des Abschlusspakets.
