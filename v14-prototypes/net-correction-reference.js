/* SILK V1.4: calculation-only net correction preview. Not a posting API.
 * Only confirmed original payout/refund events may be used as the paid baseline.
 */
(function(global){
 'use strict';
 const integer=(n)=>Number.isSafeInteger(n);
 function preview({rootFinalId,expectedRevision,currentRevision,targetLines,confirmedCashMovements,confirmedBaseline}){
   if(!rootFinalId||!confirmedBaseline)throw Error('SILK_CORRECTION_UNVERIFIED_BASELINE');
   if(!integer(expectedRevision)||expectedRevision!==currentRevision)throw Error('SILK_CORRECTION_STALE_REVISION');
   if(!Array.isArray(targetLines)||!Array.isArray(confirmedCashMovements))throw Error('SILK_CORRECTION_INVALID_DATA');
   const target=new Map(),paid=new Map(),ids=new Set();
   for(const l of targetLines){if(!l.id||target.has(l.id)||!integer(l.payoutCents)||l.payoutCents<0||l.payoutCents%100!==0)throw Error('SILK_CORRECTION_INVALID_TARGET');target.set(l.id,l.payoutCents);}
   for(const m of confirmedCashMovements){
     if(!m.id||ids.has(m.id)||m.rootFinalId!==rootFinalId||m.confirmed!==true||!m.recipientId||!integer(m.amountCents)||m.amountCents%100!==0|| !['payout','refund'].includes(m.type) || (m.type==='payout'&&m.amountCents<0)||(m.type==='refund'&&m.amountCents>0))throw Error('SILK_CORRECTION_INVALID_MOVEMENT');
     ids.add(m.id);paid.set(m.recipientId,(paid.get(m.recipientId)||0)+m.amountCents);
   }
   const recipients=[...new Set([...target.keys(),...paid.keys()])].sort();
   const lines=recipients.map(id=>{const desired=target.get(id)||0,previouslyPaid=paid.get(id)||0,signedDelta=desired-previouslyPaid;return {id,desiredCents:desired,previouslyPaidCents:previouslyPaid,signedDeltaCents:signedDelta,additionalDueCents:Math.max(0,signedDelta),overpaidCents:Math.max(0,-signedDelta)};});
   return {status:'needs_review',rootFinalId,chainRevision:currentRevision,lines,additionalDueCents:lines.reduce((s,x)=>s+x.additionalDueCents,0),overpaidCents:lines.reduce((s,x)=>s+x.overpaidCents,0),netDeltaCents:lines.reduce((s,x)=>s+x.signedDeltaCents,0),automaticPayoutAllowed:false};
 }
 global.SilkNetCorrection={preview};
})(typeof window==='undefined'?globalThis:window);
