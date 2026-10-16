'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../financial-core.js');require('./variant-c-allocation.js');require('./variant-c-calculation-adapter.js');
const exact=globalThis.SilkFinance.calculate,preview=globalThis.SilkVariantCPreview.preview,allocate=globalThis.SilkVariantC.allocate;
const input=(cents,staff=['A'])=>({staff,shifts:[{name:'F1',f:1,s:0}],byDate:{'2035-01-01':{f:Math.floor(cents/100)+'.'+String(cents%100).padStart(2,'0'),s:'0',assignments:staff.map(name=>({name,shift:'F1'}))}}});
for(const [cents,payout,delta]of [
 [0,0,0],[1,0,-1],[10,0,-10],[49,0,-49],[50,100,50],[51,100,49],[99,100,1],
 [100,100,0],[101,100,-1],[149,100,-49],[150,200,50],[199,200,1],
 [180110,180100,-10],[180149,180100,-49],[180150,180200,50],[180190,180200,10],
 [100010,100000,-10],[100050,100100,50],[100090,100100,10]
]){
 test('gross '+cents+' cents -> whole-CHF payout '+payout,()=>{
  const x=preview(input(cents));
  assert.equal(x.inputCents,cents);assert.equal(x.payoutCents,payout);
  assert.equal(x.roundedPayoutTargetCents,payout);assert.equal(x.roundingAdjustmentCents,delta);
  assert.equal(x.cashDifferenceCents,delta===0?0:-delta);assert.equal(x.cashReconciliationRequired,delta!==0);
  assert.equal(x.cashReconciliationStatus,delta===0?'not-required':'pending');
  assert.equal(x.canFinalize,false);assert.equal(x.previewOnly,true);assert.equal(x.allocationReady,true);
  assert.equal(x.lines.reduce((s,e)=>s+e.payoutCents,0),payout);
  assert.equal(x.categories.reduce((s,e)=>s+e.payoutCents,0),payout);
  assert.equal(cents+delta,payout);
 });
}
test('one rounding for entire period rather than one rounding per day',()=>{
 const i=input(49);i.byDate['2035-01-02']={f:'0.49',s:'0',assignments:[{name:'A',shift:'F1'}]};
 const x=preview(i);assert.equal(x.inputCents,98);assert.equal(x.payoutCents,100);
 assert.equal(x.roundingAdjustmentCents,2);
});
test('30 employees retain exact claims, whole-CHF payout and no carryover',()=>{
 const staff=Array.from({length:30},(_,n)=>'P_'+n),i=input(180190,staff);
 const x=preview(i);
 assert.equal(x.lines.length,32);assert.equal(x.payoutCents,180200);
 assert.ok(x.lines.every(e=>e.payoutCents%100===0));
 assert.deepEqual(x.lines.map(e=>e.claim),exact(i).lines.map(e=>e.claim));
 assert.equal(x.roundingAdjustmentCents,10);assert.equal(x.cashReconciliationStatus,'pending');
 assert.ok(!Object.keys(x).some(k=>/carryover|personalResidualAccount/i.test(k)));
});
test('recipient display order does not change payout allocation',()=>{
 const a=input(250,['Z','A']),b=input(250,['A','Z']);
 const x=preview(a),y=preview(b);
 assert.deepEqual(Object.fromEntries(x.lines.map(z=>[z.id,z.payoutCents])),Object.fromEntries(y.lines.map(z=>[z.id,z.payoutCents])));
});
test('allocation never marks a final payout',()=>{
 const x=allocate(exact(input(100000)));
 assert.equal(x.canFinalize,false);assert.equal(x.previewOnly,true);
});
test('invalid claim and duplicate recipients fail closed',()=>{
 assert.throws(()=>allocate({inputCents:100,lines:[{id:'staff:A',claim:{numerator:'100',denominator:'1'}},{id:'staff:A',claim:{numerator:'0',denominator:'1'}}]}),/DUPLICATE_RECIPIENT/);
 assert.throws(()=>allocate({inputCents:100,lines:[{id:'staff:A',claim:{numerator:'101',denominator:'1'}}]}),/CLAIMS_NOT_BALANCED/);
});
test('5,000 seeded inputs including cents conserve money and record rounding gap',()=>{
 let seed=24681357;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(let n=0;n<5000;n++){
  const total=n%7===0?0:next()%1000000,staff=Array.from({length:1+next()%30},(_,k)=>'P_'+k);
  const x=preview(input(total,staff));
  assert.equal(x.payoutCents,Math.floor((total+50)/100)*100);
  assert.equal(x.payoutCents,x.lines.reduce((s,l)=>s+l.payoutCents,0));
  assert.equal(x.payoutCents,total+x.roundingAdjustmentCents);
  assert.equal(x.cashDifferenceCents,x.roundingAdjustmentCents===0?0:-x.roundingAdjustmentCents);
  assert.ok(Math.abs(x.roundingAdjustmentCents)<=50);
  assert.ok(x.lines.every(l=>l.payoutCents>=0&&l.payoutCents%100===0));
  assert.equal(x.canFinalize,false);
 }
});
