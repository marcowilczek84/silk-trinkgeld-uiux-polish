/* C2: closed by default; explicit app approval never replaces server gates/rights. */
(function(g){
 'use strict';
 const enabled=()=>g.SILK_SUPABASE_CONFIG?.c2Candidate===true;
 const previewOnly=()=>enabled()&&g.SILK_SUPABASE_CONFIG?.localOnly===true;
 const previewNotice='Testversion ohne Cloud-Verbindung: Der endgültige Abschluss ist hier deaktiviert. Berechnen und Entwürfe auf diesem Gerät speichern ist möglich.';
 const testMode=()=>enabled()&&g.SILK_SUPABASE_CONFIG?.c2LocalTest===true&&['localhost','127.0.0.1'].includes(location.hostname);
 const writesEnabled=()=>testMode()||(enabled()&&g.SILK_SUPABASE_CONFIG?.c2AppApproved===true);
 const permitted=(permissions,operation)=>writesEnabled()&&permissions?.enabled===true&&permissions[operation]===true&&(testMode()?permissions.syntheticOnly===true:permissions.syntheticOnly===false);
 const M=g.SilkSyncMerge,repo=g.SilkLocalRepository;
 const messages={SILK_FORBIDDEN:'Kein Zugriff mehr auf diesen Arbeitsbereich. Bestätigung angehalten; bitte Berechtigung klären.',SILK_UPDATE_REQUIRED:'Diese App-Version ist veraltet. Lokale Eingaben sichern und die freigegebene Version neu laden.',SILK_ARCHIVE_COVERAGE_UNKNOWN:'Ein älterer Beleg hat keinen eindeutigen Zeitraum. Bitte vor dem Abschluss prüfen.',SILK_C2_REASON_REQUIRED:'Bitte einen nachvollziehbaren Korrekturgrund mit mindestens fünf Zeichen angeben.',SILK_CASH_BASELINE_UNVERIFIED:'Der Kassennachweis des ursprünglichen Belegs fehlt. Korrektur erst nach Klärung möglich.',SILK_C2_INVALID_CASH:'Bitte tatsächlich gezahlte Beträge in ganzen Franken und eine Belegreferenz eingeben.',SILK_C2_BASELINE_ALREADY_CONFIRMED:'Die Ausgangsauszahlung wurde bereits bestätigt. Bitte die Nachweise neu laden.',SILK_C2_INCOMPLETE_BASELINE:'Bitte alle Empfänger des Ausgangsbelegs prüfen und bestätigen.',tip_c2_rounding_evidence_once:'Diese Kassenbelegreferenz wurde bereits verwendet. Bitte den vorhandenen Nachweis prüfen.',tip_c2_evidence_once:'Diese Auszahlungsbelegreferenz wurde bereits verwendet. Keine erneute Zahlung auslösen.',SILK_C2_ACCEPTANCE_REQUIRED:'Echte Finalisierung gesperrt: fachliche und technische Abnahme fehlen.',SILK_C2_ROLE_REQUIRED:'Keine Berechtigung für diesen Abschluss oder Auszahlungsnachweis.',SILK_CORRECTION_UNVERIFIED_BASELINE:'Die tatsächlich ausgezahlten Beträge sind noch nicht vollständig bestätigt. Korrektur bleibt gesperrt.',SILK_CORRECTION_STALE_REVISION:'Zahlungsstand inzwischen geändert. Bitte erneut prüfen.',SILK_CASH_EVIDENCE_REQUIRED:'Der Kassenrundungsnachweis fehlt oder passt nicht zum berechneten Betrag.',SILK_C2_CASH_EXCEEDS_NET:'Der Betrag überschreitet die offene Nachzahlung oder Rückzahlung.',SILK_REVISION_CONFLICT:'Der gemeinsame Stand wurde geändert. Bitte synchronisieren und neu berechnen.',SILK_STALE_CALCULATION:'Die Eingaben wurden geändert. Bitte neu berechnen.',SILK_IDEMPOTENCY_CONFLICT:'Die Belegnummer gehört zu einer anderen Anfrage. Bitte den bisherigen Beleg prüfen.',SILK_PERIOD_ALREADY_FINALIZED:'Dieser Zeitraum ist bereits abgeschlossen. Bitte eine verknüpfte Korrektur verwenden.'};
 const errorMessage=e=>e.name==='QuotaExceededError'?'Gerätespeicher konnte die Bestätigung nicht sichern. Nicht erneut auszahlen. Speicher freigeben und den vorhandenen Auftrag prüfen.':Object.entries(messages).find(([k])=>e.message?.includes(k))?.[1]||e.message||'Serverprüfung nicht bestätigt.';
 async function preview(){
  if(previewOnly())throw Error(previewNotice);
  const input=g.SilkWorkflow.snapshot(),active=repo.getSettlements().find(x=>x.id===repo.getWork().activeId),rootId=active?.correctionOf||null;
  const response=await g.SilkSyncService.c2Request('tip_c2_preview',{p_input:input,p_root_id:rootId});
  if(!M.equal(input,g.SilkWorkflow.snapshot()))throw Error(messages.SILK_STALE_CALCULATION);
  const local=g.SilkVariantCPreview.preview(input),fields=['version','inputCents','payoutCents','roundingAdjustmentCents','categories'];
  if(fields.some(k=>!M.equal(local[k],response.candidate[k]))||!M.equal(local.lines.map(x=>[x.id,x.payoutCents,x.claim]),response.candidate.lines.map(x=>[x.id,x.payoutCents,x.claim])))throw Error('JavaScript und Serverberechnung weichen ab. Abschluss gesperrt.');
  return {...response,input,rootId,reason:active?.correctionReason||null};
 }
 async function finalize(checked,cashEvidence=null){
  if(!writesEnabled())throw Error(messages.SILK_C2_ACCEPTANCE_REQUIRED);
  if(!permitted(checked.permissions,'canFinalize'))throw Error(messages.SILK_C2_ACCEPTANCE_REQUIRED);
  if(!M.equal(checked.input,g.SilkWorkflow.snapshot()))throw Error(messages.SILK_STALE_CALCULATION);
  const request={p_input:checked.input,p_root_id:checked.rootId,p_reason:checked.reason,p_chain_revision:checked.netCorrection?.chainRevision??null,p_cash_evidence:cashEvidence};
  return g.SilkSyncService.c2Mutation('tip_c2_finalize',request,checked.revision,true);
 }
 async function confirmCash(args,revision){
  if(!writesEnabled())throw Error(messages.SILK_C2_ACCEPTANCE_REQUIRED);
  return g.SilkSyncService.c2Mutation('tip_c2_confirm_cash',args,revision,false);
 }
 g.SilkC2={enabled,previewOnly,previewNotice,testMode,writesEnabled,permitted,preview,finalize,finalizeSynthetic:finalize,confirmCash,errorMessage,ledger:rootId=>g.SilkSyncService.c2Request('tip_c2_ledger',{p_root_id:rootId})};
})(window);
