'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../financial-core.js');require('./variant-c-allocation.js');require('./net-correction-reference.js');require('./variant-c-calculation-adapter.js');
const finance=globalThis.SilkFinance,c=globalThis.SilkVariantC,preview=globalThis.SilkVariantCPreview.preview,correction=globalThis.SilkNetCorrection;
const shifts=[{name:'F1',f:1,s:0},{name:'SP1',f:0,s:1},{name:'MD',f:.35,s:.65},{name:'TINY',f:.00000001,s:.99999999},{name:'LARGE',f:.99999999,s:.00000001}];
const money=x=>Math.floor(x/100)+'.'+String(x%100).padStart(2,'0');
const sample=(f,s,people,assignments)=>({shifts,staff:people,byDate:{'2035-01-01':{f:money(f),s:money(s),assignments}}});
function check(i){
 const raw=finance.calculate(i),out=c.allocate(raw),safe=preview(i);
 assert.equal(out.payoutCents,Math.floor((raw.inputCents+50)/100)*100);
 assert.equal(out.lines.reduce((sum,l)=>sum+l.payoutCents,0),out.payoutCents);
 assert.equal(out.roundingAdjustmentCents,out.payoutCents-raw.inputCents);
 assert.ok(out.lines.every(l=>l.payoutCents%100===0));
 assert.deepEqual(out.lines.map(l=>l.claim),raw.lines.map(l=>l.claim));
 assert.equal(safe.canFinalize,false);assert.equal(safe.previewOnly,true);
 assert.equal(safe.candidatePayoutCents,out.payoutCents);assert.equal(safe.serverFinalizationRequired,true);
 assert.equal(safe.exactCalculationVersion,'silk-exact-1');
 const fractions={service:[273n,400n],kitchen:[117n,400n],housekeeping:[1n,40n]};
 for(const [group,[p,q]] of Object.entries(fractions)){
   const ls=raw.lines.filter(l=>group==='service'?l.id.startsWith('staff:'):l.id===group);
   let n=0n,d=1n;
   for(const l of ls){const x=BigInt(l.claim.numerator),y=BigInt(l.claim.denominator);n=n*y+x*d;d*=y;}
   assert.equal(n*q,BigInt(raw.inputCents)*p*d);
   assert.equal(out.categories.find(x=>x.id===group).payoutCents,out.lines.filter(x=>x.category===group).reduce((sum,x)=>sum+x.payoutCents,0));
 }
 return out;
}
test('CHF 1000: exact source claims and whole-franc category distribution',()=>{
 const r=check(sample(100000,0,['A'],[{name:'A',shift:'F1'}]));
 assert.deepEqual(r.categories.map(x=>x.payoutCents),[68300,29200,2500]);
});
test('Emily cap and subfranc historical case preserved',()=>{
 const i=sample(10450,4100,['Emily','A','B'],[{name:'Emily',shift:'MD'},{name:'A',shift:'F1'},{name:'B',shift:'SP1'}]);
 assert.equal(finance.calculate(i).lines.find(x=>x.name==='Emily').amount,10);
 const cents=preview(i);assert.equal(cents.payoutCents,14600);assert.equal(cents.roundingAdjustmentCents,50);assert.equal(cents.cashReconciliationStatus,'pending');
 i.byDate['2035-01-02']={f:'14.50',s:'0.00',assignments:i.byDate['2035-01-01'].assignments};
 const r=check(i);assert.equal(r.lines.find(x=>x.name==='Emily').payoutCents,2000);
});
test('30 workers with extreme shift splits preserve claim fractions',()=>{
 for(const shift of ['MD','TINY','LARGE']){
  const people=Array.from({length:30},(_,k)=>'P'+k);
  check(sample(99999,100001,people,people.map((name,k)=>({name,shift:k===0?'F1':k===1?'SP1':shift}))));
 }
});
test('multi-day CHF 341 under previous rounding block can now be shown safely',()=>{
 const i=sample(10000,4000,['A','B'],[{name:'A',shift:'F1'},{name:'B',shift:'SP1'}]);
 i.byDate['2035-01-02']={f:'80.25',s:'120.75',assignments:[{name:'A',shift:'MD'},{name:'B',shift:'MD'}]};
 assert.equal(finance.calculate(i).canFinalize,false);assert.equal(check(i).payoutCents,34100);
});
test('correction from confirmed original never creates automatic full payout',()=>{
 const original=check(sample(60000,40000,['A','B'],[{name:'A',shift:'F1'},{name:'B',shift:'SP1'}]));
 const corrected=check(sample(60000,40000,['A','B'],[{name:'A',shift:'MD'},{name:'B',shift:'MD'}]));
 const movements=original.lines.map((x,j)=>({id:'m'+j,rootFinalId:'original',recipientId:x.id,amountCents:x.payoutCents,type:'payout',confirmed:true}));
 const p=correction.preview({rootFinalId:'original',confirmedBaseline:true,expectedRevision:3,currentRevision:3,targetLines:corrected.lines,confirmedCashMovements:movements});
 assert.equal(p.netDeltaCents,0);assert.equal(p.overpaidCents,p.additionalDueCents);
 assert.equal(p.automaticPayoutAllowed,false);assert.ok(p.additionalDueCents>0);
});
test('2,000 weighted periods: exact claims, full CHF, server gate closed',()=>{
 let seed=123456;const next=()=>((seed=seed*1664525+1013904223>>>0)>>>0);
 for(let j=0;j<2000;j++){
  const total=(next()%4000+1)*100,f=next()%(total+1),n=2+next()%29,emily=next()%5===0;
  const staff=Array.from({length:n},(_,k)=>'P'+k);if(emily)staff.push('Emily');
  const assignments=staff.map((name,k)=>({name,shift:name==='Emily'?'MD':k===0?'F1':k===1?'SP1':shifts[next()%shifts.length].name}));
  check(sample(f,total-f,staff,assignments));
 }
});

test('linked correction with changed cents posts ONLY the net whole-CHF delta',()=>{
 const orig=check(sample(180110,0,['A'],[{name:'A',shift:'F1'}]));
 const revised=check(sample(180190,0,['A'],[{name:'A',shift:'F1'}]));
 assert.equal(orig.roundingAdjustmentCents,-10);assert.equal(revised.roundingAdjustmentCents,10);
 const actual=orig.lines.map((x,j)=>({id:'paid'+j,rootFinalId:'root',recipientId:x.id,amountCents:x.payoutCents,type:'payout',confirmed:true}));
 const p=correction.preview({rootFinalId:'root',confirmedBaseline:true,expectedRevision:5,currentRevision:5,targetLines:revised.lines,confirmedCashMovements:actual});
 assert.equal(p.netDeltaCents,100);assert.equal(p.automaticPayoutAllowed,false);
 assert.equal(revised.payoutCents-orig.payoutCents,100);
 assert.equal((180190-180110)+(revised.roundingAdjustmentCents-orig.roundingAdjustmentCents),100);
});
