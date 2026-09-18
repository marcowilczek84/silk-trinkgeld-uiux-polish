(function () {
  const $ = (s, root=document) => root.querySelector(s);
  const money = n => new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF'}).format(n);
  let rows = [], stream = null, frame = 0, scanGeneration = 0;
  const dateOK = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s+'T12:00:00').getTime()) && new Date(s+'T12:00:00').toISOString().slice(0,10)===s;
  const amount = n => { const v=Number(n); if(!Number.isFinite(v)||v<0||v>100000)throw Error('Ungültiger Trinkgeldbetrag.');return Math.round(v*100)/100 };
  function validate(input) {
    let raw;
    try{raw=JSON.parse(input.trim().startsWith('SILK1:') ? input.trim().slice(6) : input)}
    catch(e){throw Error('Das ist kein gültiger SILK-Trinkgeld-QR-Code. Bitte den QR-Code mit den Trinkgelddaten wählen.')}
    if(raw.v!==1 || raw.type!=='silk-tip' || !Array.isArray(raw.rows))throw Error('Dieser QR-Code enthält keine SILK-Trinkgelddaten.');
    const list=raw.rows.map(r=>{if(!Array.isArray(r)||r.length<3||!dateOK(r[0]))throw Error('Ungültiges Datum im QR-Code.');return {date:r[0],early:amount(r[1]),late:amount(r[2]),assignments:[]}});
    if(!list.length || list.length>93 || new Set(list.map(r=>r.date)).size!==list.length)throw Error('Der QR-Code enthält keine gültige Tagesliste.');
    // Optional schedule block: [{date:"YYYY-MM-DD",name:"Marco",shift:"FR1"}, ...]
    // Older SILK1 QR codes without schedule remain fully compatible.
    if(raw.schedule!==undefined){
      if(!Array.isArray(raw.schedule))throw Error('Ungültige Mitarbeiterdienste im QR-Code.');
      const byDate=Object.fromEntries(list.map(r=>[r.date,r]));
      const seen=new Set();
      raw.schedule.forEach(a=>{
        if(!a||typeof a!=='object'||!dateOK(a.date)||typeof a.name!=='string'||typeof a.shift!=='string')throw Error('Ungültiger Mitarbeiterdienst im QR-Code.');
        const name=a.name.trim(),shift=a.shift.trim();
        if(!name||!shift||name.length>80||shift.length>30)throw Error('Ungültiger Mitarbeiterdienst im QR-Code.');
        if(!byDate[a.date])return;
        const key=a.date+'\u0000'+name;
        if(seen.has(key))throw Error('Ein Mitarbeiter ist an einem Tag mehrfach im QR-Code eingetragen.');
        seen.add(key);byDate[a.date].assignments.push({name,shift});
      });
    }
    return list.sort((a,b)=>a.date.localeCompare(b.date));
  }
  function csv(input){
    const lines=input.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
    const sep=(lines[0].match(/;/g)||[]).length >= (lines[0].match(/,/g)||[]).length?';':',';
    const split=l=>l.split(sep).map(x=>x.trim().replace(/^"|"$/g,''));
    const norm=s=>s.toLowerCase().replace(/ü/g,'ue').replace(/ä/g,'ae').replace(/[^a-z]/g,'');
    const h=split(lines.shift()).map(norm),di=h.indexOf('datum'),fi=h.findIndex(x=>x.includes('frueh')),si=h.findIndex(x=>x.includes('spaet'));
    if(di<0||fi<0||si<0)throw Error('CSV benötigt Datum, Frühschicht und Spätschicht.');
    return validate(JSON.stringify({v:1,type:'silk-tip',rows:lines.filter(Boolean).map(l=>{const c=split(l),d=c[di].match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);return [d?d[3]+'-'+d[2].padStart(2,'0')+'-'+d[1].padStart(2,'0'):c[di],Number((c[fi]||'0').replace(',','.')),Number((c[si]||'0').replace(',','.'))]})}));
  }
  function stop(){scanGeneration++;if(frame)cancelAnimationFrame(frame);frame=0;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}const video=$('#silk-qr-video');if(video)video.srcObject=null}
  function close(){stop();$('#silk-import-modal')?.remove()}
  function error(e){$('#silk-import-error').textContent=e.message||String(e)}
  function preview(list){
    stop();rows=list;
    $('#silk-import-input').classList.add('hidden');$('#silk-import-preview').classList.remove('hidden');
    $('#silk-import-from').value=list[0].date;$('#silk-import-to').value=list.at(-1).date;
    refresh();
  }
  function refresh(){
    const from=$('#silk-import-from').value,to=$('#silk-import-to').value,subset=rows.filter(r=>r.date>=from&&r.date<=to);
    const summary=$('#silk-import-summary'),button=$('#silk-import-apply');
    const table=$('#silk-import-table');
    if(!dateOK(from)||!dateOK(to)||from>to||!subset.length){summary.textContent='Bitte einen Zeitraum mit vorhandenen Einträgen wählen.';table.innerHTML='';button.disabled=true;return}
    button.disabled=false;
    const total=Math.round(subset.reduce((a,r)=>a+Math.round(r.early*100)+Math.round(r.late*100),0))/100;
    const dutyCount=subset.reduce((n,r)=>n+(r.assignments?.length||0),0);
    summary.textContent=subset.length+' Tage mit Einträgen'+(dutyCount?' · '+dutyCount+' Mitarbeiterdienste':'');
    table.innerHTML='<table><thead><tr><th>Datum</th><th>Früh</th><th>Spät</th><th>Tag</th></tr></thead><tbody>'+subset.map(r=>'<tr><th scope="row">'+r.date.slice(8)+'.'+r.date.slice(5,7)+'.'+r.date.slice(0,4)+'</th><td>'+money(r.early)+'</td><td>'+money(r.late)+'</td><td>'+money(r.early+r.late)+'</td></tr>').join('')+'</tbody><tfoot><tr><th colspan="3">Gesamtsumme zum Abgleichen</th><td>'+money(total)+'</td></tr></tfoot></table>';
  }
  function apply(){
    const from=$('#silk-import-from').value,to=$('#silk-import-to').value,subset=rows.filter(r=>r.date>=from&&r.date<=to);
    if(!subset.length)return;
    saveState();
    const state=getState(),byDate={...(state.byDate||{})};
    const conflicts=subset.filter(r=>+byDate[r.date]?.f||+byDate[r.date]?.s);
    const hasSchedule=subset.some(r=>r.assignments?.length);
    if(conflicts.length&&!confirm(conflicts.length+' vorhandene Tagesbeträge ersetzen?'+(hasSchedule?' Enthaltene Mitarbeiterdienste aus dem QR-Code werden ebenfalls übernommen.':' Die Mitarbeiterdienste bleiben erhalten.')))return;
    subset.forEach(r=>{
      const current=byDate[r.date]||{};
      let assignments=current.assignments||[];
      if(r.assignments?.length){
        const knownNames=new Set(typeof STAFF!=='undefined'?STAFF:[]),knownShifts=new Set(typeof SHIFTS!=='undefined'?SHIFTS.map(s=>s.name):[]);
        assignments=r.assignments.filter(a=>knownNames.has(a.name)&&knownShifts.has(a.shift)).map(a=>({name:a.name,shift:a.shift}));
      }
      byDate[r.date]={...current,f:String(r.early),s:String(r.late),assignments};
    });
    localStorage.setItem(STORE,JSON.stringify({...state,byDate,periodStart:from,periodEnd:to,mode:'period'}));
    setPeriodRange(from,to);setMode('period');
    close();
    $('#days')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function readImage(file){
    if(!file)return;
    stop();$('#silk-qr-video').classList.add('hidden');$('#silk-qr-camera').classList.remove('hidden');$('#silk-import-error').textContent='';
    const image=new Image(),url=URL.createObjectURL(file);
    image.onload=()=>{URL.revokeObjectURL(url);if(!$('#silk-import-modal'))return;try{
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      const qr=jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
      if(!qr)throw Error('Kein lesbarer QR-Code im Foto gefunden.');
      preview(validate(qr.data));
    }catch(e){error(e)}};
    image.onerror=()=>{URL.revokeObjectURL(url);error(Error('Foto konnte nicht geöffnet werden.'))};
    image.src=url;
  }
  async function scan(){
    let generation;
    try{
      stop();$('#silk-import-error').textContent='';$('#silk-qr-camera').classList.add('hidden');
      generation=scanGeneration;
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      if(generation!==scanGeneration||!$('#silk-import-modal')){media.getTracks().forEach(t=>t.stop());return}
      stream=media;
      const video=$('#silk-qr-video');video.srcObject=stream;video.classList.remove('hidden');await video.play();
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
      function tick(){
        if(!stream)return;
        if(video.videoWidth){canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage(video,0,0);const qr=jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
          if(qr){try{preview(validate(qr.data));return}catch(e){error(e)}}}
        frame=requestAnimationFrame(tick);
      }
      tick();
    }catch(e){if(generation!==scanGeneration||!$('#silk-import-modal'))return;stop();$('#silk-qr-camera')?.classList.remove('hidden');error(Error('Kamera nicht verfügbar. Du kannst dein gespeichertes QR-Foto wählen oder den Kamerazugriff erneut versuchen.'))}
  }
  function open(){
    close();
    const wrap=document.createElement('div');wrap.id='silk-import-modal';
    wrap.innerHTML='<div class="sim-card" role="dialog" aria-modal="true" aria-label="Trinkgeld importieren"><button class="sim-close" type="button" aria-label="Schließen">×</button><h2>Trinkgeld importieren</h2><div id="silk-import-input"><p>QR-Code vor die Kamera halten oder dein gespeichertes QR-Foto wählen.</p><video id="silk-qr-video" class="hidden" playsinline muted></video><label class="sim-photo">QR-Foto aus Fotos wählen<input id="silk-qr-image" type="file" accept="image/*" hidden></label><button id="silk-qr-camera" class="hidden" type="button">Kamera erneut öffnen</button><details><summary>Weitere Importwege</summary><label class="sim-csv">CSV-Datei wählen<input id="silk-csv-file" type="file" accept=".csv,text/csv" hidden></label><label for="silk-qr-text">QR-Text einfügen</label><textarea id="silk-qr-text" placeholder="SILK1:..."></textarea><button id="silk-qr-paste" type="button">Text einlesen</button></details><p id="silk-import-error" role="alert"></p></div><div id="silk-import-preview" class="hidden"><p>Wähle den Zeitraum, dessen Beträge du übernehmen möchtest.</p><div class="grid2"><div class="field"><label for="silk-import-from">Von</label><input type="date" id="silk-import-from"></div><div class="field"><label for="silk-import-to">Bis</label><input type="date" id="silk-import-to"></div></div><div class="sim-sum" id="silk-import-summary"></div><div id="silk-import-table" class="sim-table-wrap"></div><div class="sim-actions"><button class="sim-cancel" type="button">Abbrechen</button><button class="sim-go" id="silk-import-apply" type="button">Beträge & Dienste laden</button></div></div></div>';
    document.body.appendChild(wrap);
    $('.sim-close',wrap).onclick=close;$('.sim-cancel',wrap).onclick=close;
    $('#silk-qr-camera').onclick=scan;
    $('.sim-photo',wrap).onclick=()=>{stop();$('#silk-qr-video').classList.add('hidden');$('#silk-qr-camera').classList.remove('hidden');$('#silk-import-error').textContent=''};
    $('#silk-qr-image').onchange=e=>readImage(e.target.files[0]);
    $('#silk-csv-file').onchange=async e=>{try{preview(csv(await e.target.files[0].text()))}catch(err){error(err)}};
    $('#silk-qr-paste').onclick=()=>{try{preview(validate($('#silk-qr-text').value))}catch(err){error(err)}};
    $('#silk-import-from').onchange=refresh;$('#silk-import-to').onchange=refresh;$('#silk-import-apply').onclick=apply;
    wrap.onclick=e=>{if(e.target===wrap)close()};
  }
  function exportStoredQR(){
    try{
      // Do not call saveState here: opening Settings can leave the day form
      // on a different date and overwrite freshly imported period data.
      let st={};
      try{st=JSON.parse(localStorage.getItem(typeof STORE!=='undefined'?STORE:'silk_tip_state')||'{}')}catch(_){}
      if(!st||typeof st!=='object')st={};
      const entries=Object.entries(st.byDate||{}).filter(([d,x])=>dateOK(d)&&((+x.f||0)>0||(+x.s||0)>0)).sort((a,b)=>a[0].localeCompare(b[0]));
      if(!entries.length)throw Error('Keine gespeicherten Trinkgeldtage gefunden.');
      const rowsOut=entries.map(([d,x])=>[d,amount(+x.f||0),amount(+x.s||0)]);
      const schedule=[];
      entries.forEach(([d,x])=>(x.assignments||[]).forEach(a=>{if(a&&a.name&&a.shift)schedule.push({date:d,name:String(a.name),shift:String(a.shift)})}));
      const payload='SILK1:'+JSON.stringify({v:1,type:'silk-tip',rows:rowsOut,schedule});
      const wrap=document.createElement('div');wrap.id='silk-export-modal';
      wrap.innerHTML='<div class="sim-card" role="dialog" aria-modal="true" aria-label="QR-Code exportieren"><button class="sim-close" type="button" aria-label="Schließen">×</button><h2>QR-Code exportieren</h2><p>Deine gespeicherten Trinkgeldbeträge sind bereit.</p><div class="sim-sum">'+entries.length+' Trinkgeldtage · '+schedule.length+' Mitarbeiterdienste</div><label for="silk-export-text" style="display:block;margin:14px 0 6px;font-size:12px;font-weight:650">Export-Code</label><textarea id="silk-export-text" readonly style="width:100%;min-height:120px"></textarea><button class="savewide" id="silk-export-copy" type="button" style="margin-top:10px">Code kopieren</button></div>';
      document.body.appendChild(wrap);
      $('#silk-export-text').value=payload;
      const closeExport=()=>wrap.remove();$('.sim-close',wrap).onclick=closeExport;wrap.onclick=e=>{if(e.target===wrap)closeExport()};
      $('#silk-export-copy').onclick=async()=>{
        const ta=$('#silk-export-text');ta.focus();ta.select();ta.setSelectionRange(0,ta.value.length);
        try{await navigator.clipboard.writeText(payload);$('#silk-export-copy').textContent='Code kopiert ✓'}
        catch(e){document.execCommand('copy');$('#silk-export-copy').textContent='Code kopiert ✓'}
      };
    }catch(e){alert(e.message||String(e))}
  }
  function inject(){
    const home=$('#settingsHome');if(!home||$('.silk-import-row',home))return;
    const button=document.createElement('button');button.className='settingsrow silk-import-row';button.type='button';
    button.innerHTML='<span class="silk-import-row-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7H3zM5.5 5.5h2v2h-2zM14 3h7v7h-7zM16.5 5.5h2v2h-2zM3 14h7v7H3zM5.5 16.5h2v2h-2zM14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/></svg></span><span><strong>Trinkgeld importieren</strong><small>QR scannen oder Foto wählen</small></span><span class="silk-import-chevron">›</span>';
    button.onclick=()=>{closeSettings();open();scan()};
    home.prepend(button);
    if(!$('.silk-export-row',home)){
      const exp=document.createElement('button');exp.className='settingsrow silk-export-row';exp.type='button';
      exp.innerHTML='<span class="silk-import-row-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 19h16"/></svg></span><span><strong>QR-Code exportieren</strong><small>Gespeicherte Beträge & Dienste</small></span><span class="silk-import-chevron">›</span>';
      exp.onclick=()=>{
        try{
          let st={};try{st=JSON.parse(localStorage.getItem(typeof STORE!=='undefined'?STORE:'silk_tip_state')||'{}')}catch(_){}
          const entries=Object.entries(st.byDate||{}).filter(([d,x])=>dateOK(d)&&((+x.f||0)>0||(+x.s||0)>0)).sort((a,b)=>a[0].localeCompare(b[0]));
          if(!entries.length){alert('Keine gespeicherten Trinkgeldtage gefunden.');return}
          const rowsOut=entries.map(([d,x])=>[d,amount(+x.f||0),amount(+x.s||0)]);
          const schedule=[];entries.forEach(([d,x])=>(x.assignments||[]).forEach(a=>{if(a&&a.name&&a.shift)schedule.push({date:d,name:String(a.name),shift:String(a.shift)})}));
          const payload='SILK1:'+JSON.stringify({v:1,type:'silk-tip',rows:rowsOut,schedule});
          window.prompt('SILK Export-Code – alles markieren und kopieren:',payload);
        }catch(e){alert('Exportfehler: '+(e.message||e))}
      };home.prepend(exp);
    }
  }
  inject();new MutationObserver(inject).observe(document.body,{childList:true,subtree:true});
})();