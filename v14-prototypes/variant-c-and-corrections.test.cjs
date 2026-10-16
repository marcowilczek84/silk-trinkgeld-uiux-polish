const test=require('node:test'), assert=require('node:assert/strict');
require('./variant-c-allocation.js');
require('./net-correction-reference.js');
const allocate=globalThis.SilkVariantC.allocate;
const preview=globalThis.SilkNetCorrection.preview;
const line=(id,n,d='1')=>({id,claim:{numerator:String(n),denominator:String(d)}});
const movement=(id,recipientId,amountCents,type='payout')=>({id,rootFinalId:'root',recipientId,amountCents,type,confirmed:true});
test('CHF 1000: service 683, kitchen 292, housekeeping 25',()=>{
 const r=allocate({inputCents:100000,lines:[line('staff:Alice',68250),line('kitchen',29250),line('housekeeping',2500)]});
 assert.deepEqual(r.lines.map(x=>x.payout),[683,292,25]);assert.equal(r.payoutCents,100000);
});
test('changing UI order does not change recipient amounts',()=>{
 const lines=[line('staff:B',5000),line('staff:A',5000),line('kitchen',10000)];
 const f=allocate({inputCents:20000,lines}),r=allocate({inputCents:20000,lines:lines.slice().reverse()});
 assert.deepEqual(Object.fromEntries(f.lines.map(x=>[x.id,x.payout])),Object.fromEntries(r.lines.map(x=>[x.id,x.payout])));
});
test('fractional total remains blocked (no undisclosed cash remainder)',()=>{
 assert.throws(()=>allocate({inputCents:180110,lines:[line('staff:A',180110)]}),/FRACTIONAL_TOTAL_UNRESOLVED/);
});
test('never allocate when claims do not sum to incoming amount',()=>{
 assert.throws(()=>allocate({inputCents:100000,lines:[line('staff:A',100001)]}),/CLAIMS_NOT_BALANCED/);
});
test('zero input pays zero',()=>{
 assert.equal(allocate({inputCents:0,lines:[line('staff:A',0),line('kitchen',0),line('housekeeping',0)]}).payoutCents,0);
});
test('ties between service people sorted by stable recipient ID',()=>{
 const r=allocate({inputCents:200,lines:[line('staff:z',50),line('staff:a',50),line('kitchen',50),line('housekeeping',50)]});
 assert.deepEqual(Object.fromEntries(r.lines.map(x=>[x.id,x.payout])),{'staff:a':1,'staff:z':0,'kitchen':1,'housekeeping':0});
});
test('4,000 varied allocations pay only full francs and preserve the input',()=>{
 let seed=31;const rnd=()=>((seed=seed*1664525+1013904223>>>0)>>>0);
 for(let t=0;t<4000;t++){
  const total=((rnd()%100000)+1)*100,count=(rnd()%30)+1,weights=Array.from({length:count},()=>rnd()%12345+1),sum=weights.reduce((a,b)=>a+b,0);
  let used=0;const people=weights.map((w,i)=>{const v=i===count-1?total-used:Math.floor(total*w/sum);used+=v;return line('staff:'+i,v)});
  const r=allocate({inputCents:total,lines:people});
  assert.equal(r.lines.reduce((s,x)=>s+x.payoutCents,0),total);assert.ok(r.lines.every(x=>x.payoutCents%100===0));
 }
});
const context={rootFinalId:'root',expectedRevision:3,currentRevision:3,confirmedBaseline:true};
test('same confirmed payout needs no correction',()=>{
 const r=preview({...context,targetLines:[{id:'a',payoutCents:5000}],confirmedCashMovements:[movement('m1','a',5000)]});
 assert.equal(r.netDeltaCents,0);assert.equal(r.automaticPayoutAllowed,false);
});
test('reallocation exposes overpayment and missing payment separately',()=>{
 const r=preview({...context,targetLines:[{id:'a',payoutCents:5000},{id:'b',payoutCents:5000}],confirmedCashMovements:[movement('m1','a',6000),movement('m2','b',4000)]});
 assert.equal(r.additionalDueCents,1000);assert.equal(r.overpaidCents,1000);assert.equal(r.automaticPayoutAllowed,false);
});
test('confirmed refund and multiple payments affect paid baseline',()=>{
 const r=preview({...context,targetLines:[{id:'a',payoutCents:7000}],confirmedCashMovements:[movement('m1','a',6000),movement('m2','a',2000),movement('m3','a',-1000,'refund')]});
 assert.equal(r.netDeltaCents,0);
});
test('unverified initial payouts block preview',()=>assert.throws(()=>preview({...context,confirmedBaseline:false,targetLines:[],confirmedCashMovements:[]}),/UNVERIFIED_BASELINE/));
test('stale revision blocks preview',()=>assert.throws(()=>preview({...context,expectedRevision:2,targetLines:[],confirmedCashMovements:[]}),/STALE_REVISION/));
test('duplicate movements are rejected',()=>assert.throws(()=>preview({...context,targetLines:[],confirmedCashMovements:[movement('m1','a',1000),movement('m1','a',1000)]}),/INVALID_MOVEMENT/));
test('unconfirmed cash movement is not silently used',()=>assert.throws(()=>preview({...context,targetLines:[],confirmedCashMovements:[{...movement('m1','a',1000),confirmed:false}]}),/INVALID_MOVEMENT/));
test('sub-franc correction target is rejected',()=>assert.throws(()=>preview({...context,targetLines:[{id:'a',payoutCents:10}],confirmedCashMovements:[]}),/INVALID_TARGET/));
