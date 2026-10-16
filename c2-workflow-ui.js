/* Existing settlement/receipt flow. No payment execution or cash-management module. */
(function(g){
 'use strict';
 const repo=g.SilkLocalRepository;
 const money=cents=>g.chf(cents/100);
 const node=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;parent?.append(n);return n;};
 const button=(parent,text,fn)=>{const b=node('button',text,parent);b.type='button';b.onclick=fn;return b;};
 function field(parent,label,options={}){const wrap=node('label',label,parent),input=node('input',undefined,wrap);Object.assign(input,{type:'text',required:true,...options});return input;}
 function acknowledgement(parent,text){const label=node('label',undefined,parent);label.className='c2-ack';const input=node('input',undefined,label);input.type='checkbox';input.required=true;label.append(document.createTextNode(text));return input;}
 function roundingText(cents){return cents>0?'Aufrundung: '+money(cents)+' zusätzlich bereitstellen.':cents<0?'Abrundung: '+money(-cents)+' bleiben übrig.':'Keine Rundungsdifferenz.';}
 function recipient(id,receipt){return id==='kitchen'?'Küche':id==='housekeeping'?'Housekeeping':receipt.inputSnapshot?.staffLabels?.[id.slice(6)]||id.slice(6);}
 function period(receipt){return receipt.periodStart+' – '+receipt.periodEnd;}
 function message(parent,text){const p=node('p',text,parent);p.setAttribute('role','status');return p;}
 function testNotice(parent){if(g.SilkC2.testMode())node('p','Testumgebung · nur synthetische Daten, keine echte Zahlung.',parent);}
 function pending(){return g.SilkSyncService.pendingC2();}
 function errorText(error){return g.SilkC2.errorMessage(error);}
 function mutationForm(parent,label,onSubmit,allowed){
  const form=node('form',undefined,parent);form.className='c2-confirmation';const fields=node('fieldset',undefined,form);
  const status=message(form,''),actions=node('div',undefined,form);actions.className='dialog-actions';
  const submit=node('button',label,actions);submit.type='submit';submit.disabled=!allowed||!!pending();
  let busy=false;
  form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity())return;busy=true;fields.disabled=true;submit.disabled=true;status.textContent='Serverbestätigung wird geprüft …';
   try{await onSubmit(status);form.dataset.saved='true';}
   catch(e){status.textContent=(form.dataset.saved==='true'?'Nachweis gespeichert. Aktuelle Anzeige bitte neu laden. ':'')+errorText(e);if(form.dataset.saved!=='true')fields.disabled=false;}
   finally{busy=false;submit.disabled=form.dataset.saved==='true'||!allowed||!!pending();renderRecovery();}
  };
  if(!allowed)node('p','Bestätigung gesperrt: Freigabe oder Berechtigung fehlt.',form);
  return {form,fields,actions,status,submit};
 }
 async function openFinalization(){
  document.getElementById('c2CloseDialog')?.remove();const dialog=node('dialog',undefined,document.body);dialog.id='c2CloseDialog';dialog.className='release-dialog c2-dialog';dialog.setAttribute('aria-labelledby','c2CloseTitle');node('h2','Abrechnung abschliessen',dialog).id='c2CloseTitle';
  testNotice(dialog);const loading=message(dialog,'Berechnung wird mit dem Server abgeglichen …');button(dialog,'Zurück',()=>dialog.close());dialog.showModal();
  try{
   const checked=await g.SilkC2.preview(),c=checked.candidate,delta=checked.cashReconciliationDueCents;
   loading.textContent=checked.input.periodStart+' – '+checked.input.periodEnd;
   node('p','Erfasst: '+money(c.inputCents)+' · Berechnete Auszahlung: '+money(c.payoutCents),dialog);
   node('p',roundingText(c.roundingAdjustmentCents)+' Die Berechnung bestätigt weder Kassenausgleich noch Auszahlung.',dialog);
   if(checked.netCorrection)node('p','Nur Nachzahlung: '+money(checked.netCorrection.additionalDueCents)+' · Überzahlung separat: '+money(checked.netCorrection.overpaidCents)+'. Keine erneute Gesamtauszahlung.',dialog);
   let reference,ack;
   const ui=mutationForm(dialog,'Abrechnung verbindlich abschliessen',async status=>{
    if(!ack.checked)throw Error('Bitte den tatsächlichen Stand ausdrücklich bestätigen.');
    const evidence=delta?{adjustmentCents:delta,kind:delta>0?'funding':'remainder',reference:reference.value.trim()}:null;
    if(evidence&&evidence.reference.length<5)throw Error('Bitte eine nachvollziehbare Belegreferenz eintragen.');
    const receipt=await g.SilkC2.finalizeSynthetic(checked,evidence);
    status.textContent='Abschluss gespeichert. Auszahlung noch nicht bestätigt. Beleg '+receipt.id;
    button(ui.actions,'Beleg öffnen',()=>{dialog.close();g.restoreSavedCalculation(receipt.id);});
   },g.SilkC2.permitted(checked.permissions,'canFinalize'));
   if(delta){
    if(checked.netCorrection)node('p','Seit dem letzten bestätigten Abschluss: '+roundingText(delta),ui.fields);
    reference=field(ui.fields,delta>0?'Beleg / Herkunft des zusätzlichen Betrags':'Beleg / Verbleib des Restbetrags',{minLength:5,maxLength:200,autocomplete:'off'});
    ack=acknowledgement(ui.fields,delta>0?money(delta)+' wurden für diese Abrechnung tatsächlich zusätzlich bereitgestellt.':money(-delta)+' wurden tatsächlich separat zurückbehalten und ihr Verbleib ist dokumentiert.');
   }else ack=acknowledgement(ui.fields,'Ich habe Zeitraum und berechnete Verteilung geprüft. Der Abschluss bestätigt noch keine Auszahlung.');
  }catch(e){loading.textContent=errorText(e);}
  return dialog;
 }
 function paymentForm(parent,ledger,receipt,lines,kind,onSaved){
  parent.querySelector('.c2-confirmation')?.remove();
  const refund=kind==='refund',baseline=kind==='baseline',inputs=[];
  const ui=mutationForm(parent,refund?'Eingegangene Rückzahlung bestätigen':'Tatsächliche Auszahlung bestätigen',async status=>{
   const amounts=inputs.map(({id,input})=>{const raw=input.value;if(!/^\d+$/.test(raw))throw Error('Bitte ganze Franken eingeben.');const cents=Number(raw)*100;if(!Number.isSafeInteger(cents)||cents>7320000000)throw Error('Betrag ist zu gross.');return {id,amountCents:refund?-cents:cents};}).filter(x=>baseline||x.amountCents!==0);
   if(!ack.checked||reference.value.trim().length<5||!amounts.length)throw Error('Tatsächliche Beträge und Beleg bitte ausdrücklich bestätigen.');
   await g.SilkC2.confirmCash({p_root_id:ledger.rootFinalId,p_chain_revision:ledger.chainRevision,p_receipt_id:ledger.latestReceiptId,p_kind:kind,p_lines:amounts,p_evidence_ref:reference.value.trim()},ledger.revision);
   ui.form.dataset.saved='true';status.textContent='Nachweis gespeichert. Keine weitere Zahlung auslösen.';await onSaved();
  },g.SilkC2.permitted(ledger.permissions,'canConfirmCash'));
  node('h4',refund?'Rückzahlung nach Eingang':'Tatsächlich ausgezahlte Beträge',ui.fields);
  node('p',period(receipt)+' · Beleg '+receipt.id,ui.fields);
  node('p',refund?'Nur bereits eingegangene Rückzahlungen eintragen. Keine automatische Verrechnung.':'Die vorgeschlagenen Beträge sind berechnet. Nur bereits ausgezahlte Beträge bestätigen; Abweichungen hier berichtigen.',ui.fields);
  for(const line of lines){const amount=baseline?line.desiredCents:refund?line.overpaidCents:line.additionalDueCents;
   const input=field(ui.fields,recipient(line.id,receipt)+' · CHF',{type:'number',inputMode:'numeric',min:'0',step:'1',max:String(baseline?73200000:amount/100),value:String(refund?0:amount/100)});inputs.push({id:line.id,input});
  }
  const reference=field(ui.fields,'Auszahlungsbeleg / Referenz',{minLength:5,maxLength:200,autocomplete:'off'});
  const ack=acknowledgement(ui.fields,refund?'Die eingetragenen Beträge sind tatsächlich zurückgezahlt worden.':'Die eingetragenen Beträge wurden tatsächlich an die genannten Empfänger ausgezahlt.');
  button(ui.actions,'Zurück',()=>ui.form.remove());ui.form.scrollIntoView({block:'nearest'});
  return ui;
 }
 async function renderLedger(dialog,item){
  const ledger=await g.SilkC2.ledger(item.correctionOf||item.id),receipt=repo.getSettlements().find(x=>x.id===ledger.latestReceiptId);
  if(!receipt)throw Error('Der aktuelle Beleg fehlt. Bitte synchronisieren und erneut öffnen.');
  dialog.querySelector('.c2-ledger')?.remove();const section=node('section',undefined,dialog);section.className='c2-ledger';
  node('h3','Auszahlung & Nachweise',section);testNotice(section);
  node('p','Aktueller Zahlungsstand · '+period(receipt)+' · Stand '+ledger.chainRevision,section);
  if(receipt.id!==item.id)node('p','Dieser Stand gehört zum neuesten Korrekturbeleg '+receipt.id+'. Der geöffnete Originalbeleg bleibt unverändert.',section);
  node('p',ledger.baselineConfirmed?'Ausgangsauszahlung ausdrücklich bestätigt.':'Ausgangsauszahlung noch nicht bestätigt. Eine Nettokorrektur bleibt bis zur Bestätigung gesperrt.',section);
  const paid=new Map();for(const m of ledger.movements)paid.set(m.recipientId,(paid.get(m.recipientId)||0)+m.amountCents);
  const target=new Map(receipt.resultData.lines.map(x=>[x.id,x.payoutCents]));
  const lines=[...new Set([...target.keys(),...paid.keys()])].map(id=>{const desired=target.get(id)||0,confirmed=paid.get(id)||0;return {id,desiredCents:desired,paidCents:confirmed,additionalDueCents:Math.max(0,desired-confirmed),overpaidCents:Math.max(0,confirmed-desired)};});
  const table=node('table',undefined,section);table.className='workspace-table';node('caption','Berechnung und bestätigte Zahlungen',table);
  const header=node('tr',undefined,node('thead',undefined,table));for(const title of ['Empfänger','Berechnet','Bestätigt','Noch offen','Überzahlung'])node('th',title,header).scope='col';
  const body=node('tbody',undefined,table);for(const l of lines){const row=node('tr',undefined,body);node('th',recipient(l.id,receipt),row).scope='row';for(const [label,value] of [['Berechnet',l.desiredCents],['Bestätigt',l.paidCents],['Noch offen',l.additionalDueCents],['Überzahlung',l.overpaidCents]]){const c=node('td',!ledger.baselineConfirmed&&label!=='Berechnet'?'Nicht bestätigt':money(value),row);c.className='numeric';c.dataset.label=label;}}
  const refresh=()=>renderLedger(dialog,item),actions=node('div',undefined,section);actions.className='dialog-actions';
  if(!ledger.baselineConfirmed)button(actions,'Auszahlung bestätigen',()=>paymentForm(section,ledger,receipt,lines,'baseline',refresh));
  else{
   const due=lines.filter(x=>x.additionalDueCents>0),overpaid=lines.filter(x=>x.overpaidCents>0);
   if(due.length)button(actions,'Nachzahlung bestätigen',()=>paymentForm(section,ledger,receipt,due,'payout',refresh));
   if(overpaid.length){node('p','Überzahlungen separat klären. Kein automatischer Einbehalt und keine Verrechnung mit anderen Empfängern.',section);button(actions,'Rückzahlung bestätigen',()=>paymentForm(section,ledger,receipt,overpaid,'refund',refresh));}
   if(!due.length&&!overpaid.length)node('p','Berechnete Auszahlung vollständig bestätigt.',section);
  }
  button(actions,'Stand neu laden',async()=>{try{await refresh();}catch(e){message(section,errorText(e));}});
  if(ledger.movements.length){const details=node('details',undefined,section);node('summary','Bestätigte Nachweise anzeigen',details);for(const m of ledger.movements)node('p',recipient(m.recipientId,receipt)+' · '+money(m.amountCents)+' · '+({baseline:'Ausgangsauszahlung',payout:'Nachzahlung',refund:'Rückzahlung'})[m.kind]+' · '+m.evidenceRef+' · '+m.confirmedAt+' · Person '+m.confirmedBy,details);}
  renderRecovery();return ledger;
 }
 function renderRecovery(){
  let host=document.getElementById('c2PendingNotice');const p=pending();
  if(!p){host?.remove();return;}if(host)return;
  host=node('section');host.id='c2PendingNotice';host.className='c2-pending';document.getElementById('app').prepend(host);
  node('strong','Bestätigung ungeklärt',host);const status=message(host,'Die letzte Serverantwort fehlt. Nicht erneut auszahlen. Zuerst den vorhandenen Auftrag prüfen.');
  node('p','Anfrage '+p.id,host);
  const retry=button(host,'Bestätigung erneut prüfen',async()=>{retry.disabled=true;try{const result=await g.SilkSyncService.resumeC2();host.remove();document.getElementById('c2CloseDialog')?.close();document.getElementById('archiveDialog')?.close();if(result){const id=result.id||p.request.args.p_receipt_id;g.restoreSavedCalculation(id);}}catch(e){status.textContent=errorText(e);}finally{retry.disabled=false;if(!pending())host.remove();}});
 }
 for(const event of ['silk:sync-complete','silk:c2-pending','silk:writer-ready'])g.addEventListener(event,()=>{if(g.SilkC2.enabled())renderRecovery();});
 g.addEventListener('beforeunload',event=>{if(document.querySelector('.c2-confirmation[data-dirty="true"]:not([data-saved="true"])')){event.preventDefault();event.returnValue='';}});
 document.addEventListener('input',event=>{const form=event.target.closest('.c2-confirmation');if(form)form.dataset.dirty='true';});
 g.SilkC2UI={openFinalization,renderLedger,roundingText};
})(window);
