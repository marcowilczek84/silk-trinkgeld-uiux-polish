// Shared UI acceptance: all finalization and payment mutations go through visible forms.
import assert from 'node:assert/strict';
export async function waitSync(page){await page.waitForFunction(()=>SilkLocalRepository.getSyncMeta().revision>0);for(let n=0;n<30;n++){if(await page.evaluate(()=>SilkSyncService.syncNow()))return;await page.waitForTimeout(100);}throw Error('Server synchronization not confirmed');}
export async function operatorFlow({a,b,row,setCashPermission,screenshot=async()=>{}}){
 const page=a.page,close=page.locator('#c2CloseDialog'),archive=page.locator('#archiveDialog');
 const ledger=page.locator('.c2-ledger');
 async function openClose(ref){await page.evaluate(()=>{saveCurrentDraft();calculate();});await waitSync(page);await page.locator('#saveCalculationButton').click();await close.locator('form').waitFor();assert.equal(await close.getByRole('checkbox').isChecked(),false);await close.locator('input[type=text]').fill(ref);await close.getByRole('checkbox').check();}
 async function showLedger(p=page){await p.getByRole('button',{name:'Auszahlungsnachweise laden'}).click();await p.locator('.c2-ledger table').waitFor();}
 async function recover(revoked=false){const p=await page.evaluate(()=>SilkSyncService.pendingC2());assert.ok(p.id);await page.reload();await waitSync(page);await page.getByRole('button',{name:'Bestätigung erneut prüfen'}).click();if(revoked){await page.locator('#c2PendingNotice').getByText('Keine Berechtigung',{exact:false}).waitFor();assert.equal((await page.evaluate(()=>SilkSyncService.pendingC2())).id,p.id);await setCashPermission(true);await page.getByRole('button',{name:'Bestätigung erneut prüfen'}).click();}await page.locator('#archiveDialog[open]').waitFor();await page.waitForFunction(()=>!SilkSyncService.pendingC2());return p;}
 async function openReceipt(){await close.getByRole('button',{name:'Beleg öffnen'}).click();await archive.waitFor();await showLedger();}
 async function preparePayment(p,label,reference){await p.locator('.c2-ledger').getByRole('button',{name:label,exact:true}).click();const f=p.locator('.c2-ledger form');assert.equal(await f.getByRole('checkbox').isChecked(),false);await f.getByLabel('Auszahlungsbeleg / Referenz').fill(reference);await f.getByRole('checkbox').check();return f;}
 async function correction(amount,reference){await archive.getByRole('button',{name:'Korrekturentwurf vorbereiten'}).click();await page.evaluate(value=>{document.getElementById('f_2035-01-01').value=value;changeDay('2035-01-01');},amount);await openClose(reference);}
 await page.evaluate(()=>{saveCurrentDraft();calculate();});await waitSync(page);
 assert.equal((await page.evaluate(()=>SilkC2.preview())).candidate.payoutCents,180100);
 await page.locator('[data-workspace=settlement]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.locator('#saveCalculationButton').click();await close.locator('form').waitFor();assert.match(await close.textContent(),/Abrundung:.*0[.,]10/);assert.equal(await close.locator('form').evaluate(f=>f.checkValidity()),false);assert.equal(Object.values((await row()).payload.settlements).filter(x=>x.dataFormat==='final-v4-c2').length,0);
 await screenshot(page,'rounding');await close.getByLabel('Beleg / Verbleib des Restbetrags').fill('SYNTHETIC-UI-REMAINDER');await close.getByRole('checkbox').check();
 let dropped=false;await a.context.route('**/rest/v1/rpc/tip_c2_finalize',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
 await close.getByRole('button',{name:'Abrechnung verbindlich abschliessen'}).click();await page.locator('#c2PendingNotice').waitFor();
 const pending=await recover(),original=(await row()).payload.settlements[pending.id],originalBytes=JSON.stringify(original);assert.equal(original.syntheticOnly,true);
 await showLedger();const baseline=await preparePayment(page,'Auszahlung bestätigen','SYNTHETIC-UI-PAID');await screenshot(page,'payment');
 let cashDropped=false;await a.context.route('**/rest/v1/rpc/tip_c2_confirm_cash',async route=>{if(!cashDropped){cashDropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
 await baseline.getByRole('button',{name:'Tatsächliche Auszahlung bestätigen',exact:true}).click();await page.locator('#c2PendingNotice').waitFor();
 await setCashPermission(false);const cashPending=await recover(true);assert.equal(cashPending.request.name,'tip_c2_confirm_cash');await showLedger();await ledger.getByText('Berechnete Auszahlung vollständig bestätigt.').waitFor();
 let proof=await page.evaluate(id=>SilkC2.ledger(id),original.id);assert.equal(proof.confirmations.length,1);assert.equal(proof.chainRevision,1);
 await correction('1801.90','SYNTHETIC-UI-FUNDING');assert.match(await close.textContent(),/Nur Nachzahlung:.*1[.,]00/);assert.match(await close.textContent(),/Seit dem letzten.*0[.,]20/);
 await close.getByRole('button',{name:'Abrechnung verbindlich abschliessen'}).click();await openReceipt();const updated=(await row()).payload.work.activeId;
 assert.equal((await row()).payload.settlements[updated].netCorrection.additionalDueCents,100);
 await waitSync(b.page);await b.page.evaluate(id=>restoreSavedCalculation(id),updated);await showLedger(b.page);
 const other=await preparePayment(b.page,'Nachzahlung bestätigen','SYNTHETIC-UI-OTHER-DEVICE');
 const payment=await preparePayment(page,'Nachzahlung bestätigen','SYNTHETIC-UI-NET');
 // An open form never retains authority after an operator's server permission is revoked.
 await setCashPermission(false);await payment.getByRole('button',{name:'Tatsächliche Auszahlung bestätigen',exact:true}).click();await payment.getByRole('status').getByText('Keine Berechtigung',{exact:false}).waitFor();
 proof=await page.evaluate(id=>SilkC2.ledger(id),original.id);assert.equal(proof.confirmations.length,1);await setCashPermission(true);
 await payment.getByRole('button',{name:'Tatsächliche Auszahlung bestätigen',exact:true}).click();await ledger.getByText('Berechnete Auszahlung vollständig bestätigt.').waitFor();
 await other.getByRole('button',{name:'Tatsächliche Auszahlung bestätigen',exact:true}).click();await other.getByRole('status').getByText('Zahlungsstand inzwischen geändert',{exact:false}).waitFor();
 proof=await page.evaluate(id=>SilkC2.ledger(id),original.id);assert.equal(proof.confirmations.length,2);assert.equal(proof.movements.filter(x=>x.kind==='payout').reduce((n,x)=>n+x.amountCents,0),100);
 // Correct a correction: keep the original root, refund only after explicit receipt.
 await correction('1801.10','SYNTHETIC-UI-CORRECTION-REMAINDER');await close.getByRole('button',{name:'Abrechnung verbindlich abschliessen'}).click();await openReceipt();
 const last=(await row()).payload.settlements[(await row()).payload.work.activeId];assert.equal(last.correctionOf,original.id);assert.equal(last.netCorrection.overpaidCents,100);
 const refund=await preparePayment(page,'Rückzahlung bestätigen','SYNTHETIC-UI-REFUND');assert.equal(await refund.locator('input[type=number]').inputValue(),'0');await refund.locator('input[type=number]').fill('1');await refund.getByRole('button',{name:'Eingegangene Rückzahlung bestätigen'}).click();await ledger.getByText('Berechnete Auszahlung vollständig bestätigt.').waitFor();
 proof=await page.evaluate(id=>SilkC2.ledger(id),original.id);assert.equal(proof.confirmations.length,3);assert.equal(proof.movements.filter(x=>x.kind==='refund').reduce((n,x)=>n+x.amountCents,0),-100);
 assert.equal(JSON.stringify((await row()).payload.settlements[original.id]),originalBytes);assert.equal(await archive.evaluate(n=>n.scrollWidth>n.clientWidth+1),false);
 await archive.getByRole('button',{name:'Schließen',exact:true}).click();await b.page.locator('#archiveDialog').getByRole('button',{name:'Schließen',exact:true}).click();await waitSync(b.page);
 await a.context.setOffline(true);await page.evaluate(()=>{document.getElementById('f_2035-01-01').value='777';changeDay('2035-01-01');});
 await b.page.evaluate(()=>{document.getElementById('f_2035-01-01').value='888';changeDay('2035-01-01');});await waitSync(b.page);
 await a.context.setOffline(false);await page.evaluate(()=>SilkSyncService.syncNow());await page.waitForFunction(()=>SilkLocalRepository.getConflicts().length>0);
 await page.reload();await page.waitForFunction(()=>SilkLocalRepository.getConflicts().length>0);assert.equal(await page.evaluate(()=>SilkLocalRepository.getState().byDate['2035-01-01'].f),'777');
 return {operatorUI:true,roundingBothSigns:true,explicitPayoutAndRefund:true,finalizationAndPaymentResponseLossReload:true,staleSecondDevice:true,revokedOperatorBlocked:true,correctionOfCorrection:true,originalUnchanged:true,offlineConflictReload:true,realFinalizationLocked:true,physicalDevices:false};
}
