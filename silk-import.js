(function () {
  const $ = (s, root=document) => root.querySelector(s);
  const money = n => new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF'}).format(n);
  let rows = [], stream = null, frame = 0;
  const dateOK = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s+'T12:00:00').getTime()) && new Date(s+'T12:00:00').toISOString().slice(0,10)===s;
  const amount = n => { const v=Number(n); if(!Number.isFinite(v)||v<0||v>100000)throw Error('Ungültiger Trinkgeldbetrag.');return Math.round(v*100)/100 };
  function validate(input) {
    const raw = input.trim().startsWith('SILK1:') ? JSON.parse(input.trim().slice(6)) : JSON.parse(input);
    if(raw.v!==1 || raw.type!=='silk-tip' || !Array.isArray(raw.rows))throw Error('Dieser QR-Code enthält keine SILK-Trinkgelddaten.');
    const list=raw.rows.map(r=>{if(!Array.isArray(r)||r.length<3||!dateOK(r[0]))throw Error('Ungültiges Datum im QR-Code.');return {date:r[0],early:amount(r[1]),late:amount(r[2])}});
    if(!list.length || list.length>93 || new Set(list.map(r=>r.date)).size!==list.length)throw Error('Der QR-Code enthält keine gültige Tagesliste.');
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
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}const video=$('#silk-qr-video');if(video)video.srcObject=null}
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
    if(!dateOK(from)||!dateOK(to)||from>to||!subset.length){summary.textContent='Bitte einen Zeitraum mit vorhandenen Einträgen wählen.';button.disabled=true;return}
    button.disabled=false;
    summary.textContent=subset.length+' Tage mit Einträgen · '+money(subset.reduce((a,r)=>a+r.early+r.late,0));
  }
  function apply(){
    const from=$('#silk-import-from').value,to=$('#silk-import-to').value,subset=rows.filter(r=>r.date>=from&&r.date<=to);
    if(!subset.length)return;
    saveState();
    const state=getState(),byDate={...(state.byDate||{})};
    const conflicts=subset.filter(r=>+byDate[r.date]?.f||+byDate[r.date]?.s);
    if(conflicts.length&&!confirm(conflicts.length+' vorhandene Tagesbeträge ersetzen? Die Mitarbeiterdienste bleiben erhalten.'))return;
    subset.forEach(r=>{byDate[r.date]={...(byDate[r.date]||{}),f:String(r.early),s:String(r.late)}});
    localStorage.setItem(STORE,JSON.stringify({...state,byDate,periodStart:from,periodEnd:to,mode:'period'}));
    periodStart.value=from;periodEnd.value=to;setMode('period');
    close();
    $('#days')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function readImage(file){
    if(!file)return;
    const image=new Image(),url=URL.createObjectURL(file);
    image.onload=()=>{URL.revokeObjectURL(url);try{
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      const qr=jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
      if(!qr)throw Error('Kein lesbarer QR-Code im Bild gefunden.');
      preview(validate(qr.data));
    }catch(e){error(e)}};
    image.onerror=()=>{URL.revokeObjectURL(url);error(Error('Bild konnte nicht geöffnet werden.'))};
    image.src=url;
  }
  async function scan(){
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      const video=$('#silk-qr-video');video.srcObject=stream;video.classList.remove('hidden');await video.play();
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
      function tick(){
        if(!stream)return;
        if(video.videoWidth){canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage(video,0,0);const qr=jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
          if(qr){try{preview(validate(qr.data))}catch(e){error(e)}return}}
        frame=requestAnimationFrame(tick);
      }
      tick();
    }catch(e){stop();error(Error('Kamera nicht verfügbar. Du kannst ein QR-Bild auswählen.'))}
  }
  function open(){
    close();
    const wrap=document.createElement('div');wrap.id='silk-import-modal';
    wrap.innerHTML='<div class="sim-card" role="dialog" aria-modal="true" aria-label="Trinkgeld importieren"><button class="sim-close" type="button" aria-label="Schließen">×</button><h2>Trinkgeld importieren</h2><div id="silk-import-input"><p>QR-Code scannen oder ein Bild beziehungsweise eine CSV-Datei auswählen.</p><div class="sim-choices"><button id="silk-qr-camera" type="button">Kamera öffnen</button><label>QR-Bild wählen<input id="silk-qr-image" type="file" accept="image/*" hidden></label><label>CSV-Datei wählen<input id="silk-csv-file" type="file" accept=".csv,text/csv" hidden></label></div><video id="silk-qr-video" class="hidden" playsinline muted></video><details><summary>QR-Text einfügen</summary><textarea id="silk-qr-text" placeholder="SILK1:..."></textarea><button id="silk-qr-paste" type="button">Text einlesen</button></details><p id="silk-import-error" role="alert"></p></div><div id="silk-import-preview" class="hidden"><p>Wähle den Zeitraum, dessen Beträge du übernehmen möchtest.</p><div class="grid2"><div class="field"><label for="silk-import-from">Von</label><input type="date" id="silk-import-from"></div><div class="field"><label for="silk-import-to">Bis</label><input type="date" id="silk-import-to"></div></div><div class="sim-sum" id="silk-import-summary"></div><div class="sim-actions"><button class="sim-cancel" type="button">Abbrechen</button><button class="sim-go" id="silk-import-apply" type="button">Übernehmen</button></div></div></div>';
    document.body.appendChild(wrap);
    $('.sim-close',wrap).onclick=close;$('.sim-cancel',wrap).onclick=close;
    $('#silk-qr-camera').onclick=scan;
    $('#silk-qr-image').onchange=e=>readImage(e.target.files[0]);
    $('#silk-csv-file').onchange=async e=>{try{preview(csv(await e.target.files[0].text()))}catch(err){error(err)}};
    $('#silk-qr-paste').onclick=()=>{try{preview(validate($('#silk-qr-text').value))}catch(err){error(err)}};
    $('#silk-import-from').onchange=refresh;$('#silk-import-to').onchange=refresh;$('#silk-import-apply').onclick=apply;
    wrap.onclick=e=>{if(e.target===wrap)close()};
  }
  function inject(){
    const drawer=$('.drawer');if(!drawer||$('.silk-import-row',drawer))return;
    const button=document.createElement('button');button.className='settingsrow silk-import-row';button.type='button';
    button.innerHTML='<span class="silk-import-row-icon">▦</span><span><strong>Trinkgeld importieren</strong><small>QR-Code oder CSV</small></span><span class="silk-import-chevron">›</span>';
    button.onclick=()=>{closeSettings();open()};
    drawer.insertBefore(button,$('.drawerhead',drawer)?.nextSibling||drawer.firstChild);
  }
  inject();new MutationObserver(inject).observe(document.body,{childList:true,subtree:true});
})();
