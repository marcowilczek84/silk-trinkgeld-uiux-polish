/* SILK Trinkgeld V1.4 — Whole CHF Hamilton allocation.
 * Independent reference implementation. No production wiring.
 * The original rational cents from silk-exact-1 remain the source of truth.
 */
(function(global){
 'use strict';
 const ZERO=[0n,1n];
 const gcd=(a,b)=>b===0n?a:gcd(b,a%b);
 const rat=(n,d=1n)=>{if(d<=0n||n<0n)throw Error('SILK_C_INVALID_CLAIM');let g=gcd(n,d);return [n/g,d/g];};
 const plus=(a,b)=>rat(a[0]*b[1]+b[0]*a[1],a[1]*b[1]);
 const compare=(a,b)=>a[0]*b[1]<b[0]*a[1]?-1:a[0]*b[1]>b[0]*a[1]?1:0;
 const floorFranc=a=>a[0]/(a[1]*100n);
 const fractFranc=a=>rat(a[0]%(a[1]*100n),a[1]*100n);
 function allocateWholeFranc(items,budget,order){
   if(budget<0n)throw Error('SILK_C_INVALID_BUDGET');
   const entries=items.map(e=>({...e,whole:floorFranc(e.claim),frac:fractFranc(e.claim)}));
   let remainder=budget-entries.reduce((sum,e)=>sum+e.whole,0n);
   if(remainder<0n||remainder>BigInt(entries.length))throw Error('SILK_C_POOL_MISMATCH');
   const ranked=entries.slice().sort((a,b)=>compare(b.frac,a.frac)||order(a,b));
   for(const e of ranked){if(remainder===0n)break; if(e.frac[0]===0n)throw Error('SILK_C_UNDISTRIBUTABLE');e.whole++;e.bonus=1n;remainder--;}
   if(remainder!==0n)throw Error('SILK_C_UNDISTRIBUTABLE');
   return entries;
 }
 function allocate({inputCents,lines}){
   if(!Number.isSafeInteger(inputCents))throw Error('SILK_C_INVALID_TOTAL');
   const total=BigInt(inputCents);
   if(total<0n)throw Error('SILK_C_INVALID_TOTAL');
   if(total%100n!==0n)throw Error('SILK_C_FRACTIONAL_TOTAL_UNRESOLVED');
   if(!Array.isArray(lines)||lines.length===0)throw Error('SILK_C_NO_RECIPIENTS');
   const seen=new Set();const items=lines.map(e=>{
     if(!e.id||seen.has(e.id))throw Error('SILK_C_DUPLICATE_RECIPIENT');seen.add(e.id);
     const claim=rat(BigInt(e.claim.numerator),BigInt(e.claim.denominator));
     const category=e.id==='kitchen'?'kitchen':e.id==='housekeeping'?'housekeeping':e.id.startsWith('staff:')?'service':null;
     if(!category)throw Error('SILK_C_INVALID_RECIPIENT');
     return {id:e.id,category,claim,source:e};
   });
   if(compare(items.reduce((s,e)=>plus(s,e.claim),ZERO),rat(total))!==0)throw Error('SILK_C_CLAIMS_NOT_BALANCED');
   const poolNames=['service','kitchen','housekeeping'];
   const pools=poolNames.map((id,i)=>({id,order:i,claim:items.filter(x=>x.category===id).reduce((s,e)=>plus(s,e.claim),ZERO)}));
   const distributedPools=allocateWholeFranc(pools,total/100n,(a,b)=>a.order-b.order);
   const allocated=[];
   for(const pool of distributedPools){
     const recipients=items.filter(x=>x.category===pool.id);
     if(!recipients.length){if(pool.whole!==0n)throw Error('SILK_C_EMPTY_POOL');continue;}
     const assigned=allocateWholeFranc(recipients,pool.whole,(a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
     allocated.push(...assigned.map(e=>({
       ...e.source,category:e.category,basePayoutCents:Number(floorFranc(e.claim)*100n),
       roundingBonusCents:Number((e.bonus||0n)*100n),payoutCents:Number(e.whole*100n),payout:Number(e.whole),
       allocationPolicy:'silk-whole-chf-c-1',tieBreakId:e.id
     })));
   }
   const byId=new Map(allocated.map(x=>[x.id,x]));
   const result=lines.map(x=>byId.get(x.id));
   const payout=result.reduce((s,x)=>s+BigInt(x.payoutCents),0n);
   if(payout!==total)throw Error('SILK_C_PAYOUT_NOT_BALANCED');
   return {version:'silk-whole-chf-c-1',policy:'whole-chf-largest-remainder',inputCents:Number(total),payoutCents:Number(payout),residualCents:0,canFinalize:true,lines:result,
     categories:distributedPools.map(p=>({id:p.id,payoutCents:Number(p.whole*100n),basePayoutCents:Number(floorFranc(p.claim)*100n),roundingBonusCents:Number((p.bonus||0n)*100n)}))};
 }
 global.SilkVariantC={allocate};
})(typeof window==='undefined'?globalThis:window);
