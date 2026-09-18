(function () {
  const splash = document.createElement("div");
  splash.id = "silk-launch-splash";

  const silkLogo = document.querySelector("img[data-silk-logo]")?.src || "";
  splash.innerHTML = `
    <div class="sls-inner">
      <img class="sls-logo" src="${silkLogo}" alt="SILK Restaurant & Bar">
      <span class="sls-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M7 3v4M12 3v4M17 3v4M5 8h14v4a7 7 0 0 1-14 0V8Z"/>
          <path d="M8 21h8M12 16v5"/>
        </svg>
      </span>
      <span class="sls-label">Trinkgeld</span>
      <strong class="sls-title">Guten Tag</strong>
      <small class="sls-sub">Interne Anwendung</small>
    </div>
    <img class="sls-meili" src="https://ambassador-fruehstuecksliste.vercel.app/meili-selection.png" alt="Meili Selection Hotels">
  `;

  document.body.appendChild(splash);
  window.setTimeout(() => {
    splash.classList.add("is-leaving");
    window.setTimeout(() => splash.remove(), 500);
  }, 2500);
})();


/* CSV Trinkgeld-Import — 18.09.2026 */
(function(){
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const money=n=>new Intl.NumberFormat("de-CH",{style:"currency",currency:"CHF"}).format(n);
  const norm=s=>String(s||"").trim().toLowerCase().replace(/[ä]/g,"ae").replace(/[ü]/g,"ue").replace(/[ö]/g,"oe").replace(/[^a-z0-9]/g,"");
  const num=v=>{v=String(v??"").trim().replace(/[’'\s]/g,"").replace(",","."); const n=parseFloat(v); return Number.isFinite(n)?n:0};
  const iso=v=>{const s=String(v||"").trim(); let m=s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/); if(!m)return null; let y=+m[3]; if(y<100)y+=2000; return y+"-"+String(+m[2]).padStart(2,"0")+"-"+String(+m[1]).padStart(2,"0")};
  const de=d=>{const [y,m,day]=d.split("-");return day+"."+m+"."+y};
  function parseCSV(text){
    const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());
    if(lines.length<2) throw Error("Die Datei enthält keine Trinkgeld-Daten.");
    const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?";":",";
    const split=line=>line.split(sep).map(x=>x.trim().replace(/^"|"$/g,""));
    const h=split(lines[0]).map(norm);
    const di=h.findIndex(x=>x==="datum"||x==="date");
    const fi=h.findIndex(x=>x.includes("frueh"));
    const si=h.findIndex(x=>x.includes("spaet"));
    if(di<0||fi<0||si<0) throw Error("Benötigt werden die Spalten Datum, Frühschicht und Spätschicht.");
    const rows=lines.slice(1).map(split).map(c=>({date:iso(c[di]),early:num(c[fi]),late:num(c[si])})).filter(r=>r.date&&(r.early||r.late));
    if(!rows.length) throw Error("Es wurden keine gültigen Einträge gefunden.");
    rows.sort((a,b)=>a.date.localeCompare(b.date));
    return rows;
  }
  function modal(rows){
    const old=$("#silk-import-modal"); if(old)old.remove();
    const total=rows.reduce((s,r)=>s+r.early+r.late,0), from=rows[0].date,to=rows[rows.length-1].date;
    const wrap=document.createElement("div"); wrap.id="silk-import-modal";
    wrap.innerHTML='<div class="sim-card"><div class="sim-icon">↥</div><h2>Trinkgeld berechnen?</h2><p>Möchtest du das Trinkgeld vom <strong>'+de(from)+'</strong> bis <strong>'+de(to)+'</strong> berechnen?</p><div class="sim-sum"><span>Gesamtsumme</span><strong>'+money(total)+'</strong></div><div class="sim-actions"><button class="sim-cancel">Abbrechen</button><button class="sim-go">Weiter</button></div></div>';
    document.body.appendChild(wrap);
    $(".sim-cancel",wrap).onclick=()=>wrap.remove();
    $(".sim-go",wrap).onclick=()=>{wrap.remove(); importIntoApp(rows,from,to,total)};
  }
  function setNative(el,val){const p=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value"); if(p?.set)p.set.call(el,val); else el.value=val; el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}
  function importIntoApp(rows,from,to,total){
    /* Keep an explicit import payload so the existing app can use it without altering its normal data. */
    sessionStorage.setItem("silkTipImport",JSON.stringify({version:1,from,to,total,rows,createdAt:new Date().toISOString()}));
    /* Open the existing calculation view and prefill its date range. */
    const calcBtn=$$("button").find(b=>/berechn/i.test(b.textContent||"")); if(calcBtn)calcBtn.click();
    setTimeout(()=>{
      const dates=$$('input[type="date"]');
      if(dates[0])setNative(dates[0],from); if(dates[1])setNative(dates[1],to);
      /* Expose imported day amounts to the calculation UI as non-destructive data.
         Existing saved tips are never overwritten. */
      window.dispatchEvent(new CustomEvent("silk-tip-import",{detail:{rows,from,to,total}}));
      const run=$$("button").find(b=>/^(anzeigen|weiter|berechnen)$/i.test((b.textContent||"").trim())||/zeitraum.*berechn/i.test(b.textContent||""));
      if(run)run.click();
      showNotice("Import übernommen · "+de(from)+"–"+de(to)+" · "+money(total));
    },180);
  }
  function showNotice(t){let n=document.createElement("div");n.className="silk-import-notice";n.textContent=t;document.body.appendChild(n);setTimeout(()=>n.classList.add("show"),10);setTimeout(()=>{n.classList.remove("show");setTimeout(()=>n.remove(),250)},3200)}
  function choose(){let i=document.createElement("input");i.type="file";i.accept=".csv,text/csv,text/plain";i.onchange=async()=>{if(!i.files?.[0])return;try{modal(parseCSV(await i.files[0].text()))}catch(e){alert("Import nicht möglich:\n"+e.message)}};i.click()}
  function inject(){
    $$(".drawer").forEach(drawer=>{
      if($(".silk-import-row",drawer))return;
      const row=document.createElement("button");row.type="button";row.className="settingsrow silk-import-row";row.innerHTML='<span class="silk-import-row-icon">↥</span><span><strong>Trinkgeld importieren</strong><small>CSV-Datei einlesen</small></span><span class="silk-import-chevron">›</span>';row.onclick=choose;
      const head=$(".drawerhead",drawer); if(head?.nextSibling)drawer.insertBefore(row,head.nextSibling);else drawer.appendChild(row);
    });
  }
  new MutationObserver(inject).observe(document.documentElement,{childList:true,subtree:true}); setTimeout(inject,500);
})();