/* Exact claims in CHF cents. No residual-allocation policy is silently introduced. */
(function(global){
  'use strict';
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  const rat=(n,d=1n)=>{if(d<=0n)throw new Error('INVALID_DENOMINATOR');const g=gcd(n<0n?-n:n,d);return [n/g,d/g];};
  const add=(a,b)=>rat(a[0]*b[1]+b[0]*a[1],a[1]*b[1]);
  const neg=a=>[-a[0],a[1]],sub=(a,b)=>add(a,neg(b));
  const mul=(a,b)=>rat(a[0]*b[0],a[1]*b[1]);
  const div=(a,b)=>mul(a,rat(b[1],b[0]));
  const min=(a,b)=>a[0]*b[1]<b[0]*a[1]?a:b;
  const zero=()=>[0n,1n];
  function decimal(v){let s=String(v);const exp=s.match(/^(\d)(?:\.(\d+))?e-(\d+)$/);if(exp)s='0.'+'0'.repeat(Number(exp[3])-1)+exp[1]+(exp[2]||'');if(!/^\d+(\.\d{1,8})?$/.test(s))throw new Error('INVALID_FACTOR');const [a,b='']=s.split('.');return rat(BigInt(a+b),10n**BigInt(b.length));}
  function cents(v){const s=String(v);if(!/^\d+(\.\d{1,2})?$/.test(s))throw new Error('Beträge mit höchstens zwei Nachkommastellen eingeben.');const [a,b='']=s.split('.');const n=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));if(n>10000000n)throw new Error('Pro Dienst sind höchstens CHF 100’000.00 zulässig.');return n;}
  function calculate(input){
    const shifts=Object.fromEntries(input.shifts.map(s=>[s.name,{f:decimal(s.f),s:decimal(s.s)}]));
    for(const q of Object.values(shifts)){if(add(q.f,q.s)[0]!==add(q.f,q.s)[1])throw new Error('Dienstgewichtung muss zusammen 100 % ergeben.');}
    const accounts=new Map();let total=0n;
    const account=(id,name,amount,date,shift)=>{const a=accounts.get(id)||{id,name,claim:zero(),...(date?{days:0,details:[]}: {})};a.claim=add(a.claim,amount);if(date){a.days++;a.details.push(date+' · '+shift);}accounts.set(id,a);};
    for(const [date,day] of Object.entries(input.byDate).sort()){
      const f=cents(day.f),s=cents(day.s);total+=f+s;
      let ef=rat(f*273n,400n),es=rat(s*273n,400n);
      account('kitchen','Küche gesamt',rat((f+s)*117n,400n));account('housekeeping','Housekeeping gesamt',rat(f+s,40n));
      const people=(day.assignments||[]).filter(a=>a.shift);
      if(new Set(people.map(p=>p.name)).size!==people.length)throw new Error('Doppelte Dienstzuordnung.');
      if(people.some(p=>!input.staff.includes(p.name)||!shifts[p.shift]))throw new Error('Dienstzuordnung prüfen.');
      const emily=people.find(p=>p.name==='Emily');
      if(emily){const q=shifts[emily.shift],cap=min(rat(1000n),add(ef,es));let a=min(mul(cap,q.f),ef),b=min(mul(cap,q.s),es),rest=sub(sub(cap,a),b);const extra=min(rest,sub(ef,a));a=add(a,extra);rest=sub(rest,extra);b=add(b,min(rest,sub(es,b)));ef=sub(ef,a);es=sub(es,b);account('staff:Emily','Emily',add(a,b),date,emily.shift);}
      const regular=people.filter(p=>p.name!=='Emily'),wf=regular.reduce((a,p)=>add(a,shifts[p.shift].f),zero()),ws=regular.reduce((a,p)=>add(a,shifts[p.shift].s),zero());
      if((ef[0]>0n&&wf[0]===0n)||(es[0]>0n&&ws[0]===0n))throw new Error('Positiver Serviceanteil ohne Dienstzuordnung.');
      for(const p of regular){const q=shifts[p.shift];account('staff:'+p.name,p.name,add(wf[0]?div(mul(ef,q.f),wf):zero(),ws[0]?div(mul(es,q.s),ws):zero()),date,p.shift);}
    }
    if(total>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Zeitraum zu groß.');
    let candidate=0n;const lines=[...accounts.values()].sort((a,b)=>(a.days===undefined?(a.id==='kitchen'?input.staff.length:input.staff.length+1):input.staff.indexOf(a.name))-(b.days===undefined?(b.id==='kitchen'?input.staff.length:input.staff.length+1):input.staff.indexOf(b.name))).map(a=>{const [n,d]=a.claim,payout=((n+50n*d)/(100n*d))*100n;candidate+=payout;return {...a,claim:{numerator:String(n),denominator:String(d)},amount:Number(n)/Number(d)/100,candidatePayoutCents:Number(payout)};});
    const balanced=candidate===total;
    for(const line of lines){line.payoutCents=balanced?line.candidatePayoutCents:null;line.payout=balanced?line.payoutCents/100:null;}
    return {version:'silk-exact-1',policy:'whole-chf-balanced-only',inputCents:Number(total),total:Number(total)/100,candidatePayoutCents:Number(candidate),payoutCents:balanced?Number(candidate):null,residualCents:Number(total-candidate),canFinalize:balanced,lines};
  }
  global.SilkFinance={cents,calculate};
})(typeof window==='undefined'?globalThis:window);
