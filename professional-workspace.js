/* SILK V1.2 — presentation adapter. No writes to repository, IDs or sync. */
(function () {
  'use strict';
  const body=document.body,main=document.getElementById('app'),drawer=document.getElementById('drawer');
  const resultSection=document.getElementById('resultSection');
  if(!main||!drawer||!resultSection)return;
  body.classList.add('silk-workspace');
  let view='entry',lastDrawerOpen=false,lastResultVisible=false,returnFocus=null,scheduled=false,resultKey='',overlay=null,overlayReturn=null;
  const icons={
    entry:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    settlement:'<path d="M4 4h16v16H4zM8 8h8M8 12h3M15 12h1M8 16h3M15 16h1"/>',
    staff:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',
    shifts:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    history:'<path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7M12 7v5l3 2"/>'
  };
  const svg=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[name]+'</svg>';
  const nav=document.createElement('nav');nav.className='workspace-nav';nav.setAttribute('aria-label','Arbeitsbereiche');
  nav.innerHTML='<div class="workspace-nav-inner">'+[['entry','Erfassung'],['settlement','Abrechnung'],['staff','Mitarbeiter'],['shifts','Dienste'],['history','Historie']].map(([key,label])=>'<button type="button" aria-label="'+label+'" data-workspace="'+key+'">'+svg(key)+'<span>'+label+'</span></button>').join('')+'</div>';
  document.querySelector('.topbar').append(nav);
  const skip=document.createElement('a');skip.className='workspace-skip';skip.href='#workspaceHeading';skip.textContent='Zum Arbeitsbereich';body.prepend(skip);
  const intro=main.querySelector('.intro');
  intro.innerHTML='<div><p class="workspace-eyebrow">SILK · Restaurant & Bar</p><h1 id="workspaceHeading" tabindex="-1">Trinkgeld erfassen</h1><p id="workspaceDescription">Beträge erfassen und die Dienste des Teams zuordnen.</p></div>';
  const overview=document.createElement('section');overview.className='workspace-overview';overview.setAttribute('aria-label','Aktueller Arbeitsstand');
  overview.innerHTML='<div><span>Abrechnungszeitraum</span><strong id="workspacePeriod"></strong></div><div><span>Erfasste Trinkgelder</span><strong id="workspaceAmount" class="workspace-amount"></strong></div><div class="workspace-state"><span>Arbeitsstand</span><div id="workspaceState"></div></div>';
  intro.after(overview);
  const empty=document.createElement('section');empty.className='workspace-empty';empty.hidden=true;
  empty.innerHTML='<h2>Noch keine aktuelle Abrechnung</h2><p>Berechne die erfassten Beträge, um die Verteilung und Auszahlungen zu prüfen.</p><button type="button" class="workspace-primary">Trinkgeld berechnen</button>';
  resultSection.before(empty);
  const presentation=document.createElement('div');presentation.id='workspaceSettlement';presentation.className='workspace-settlement';
  resultSection.prepend(presentation);
  const footer=document.createElement('footer');footer.className='workspace-footer';footer.textContent='Ambassador Digital · Simply Smarter.';main.append(footer);
  const hub=document.querySelector('.ad-hub-link');hub?.setAttribute('aria-label','Ambassador Digital Hub');
  const drawerTitle=drawer.querySelector('.drawer-title');drawerTitle.id='workspaceDrawerTitle';
  drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-labelledby',drawerTitle.id);
  drawer.querySelector('.drawerhead button').setAttribute('aria-label','Verwaltung schliessen');
  document.querySelector('.ad-menu-toggle').setAttribute('aria-label','Einstellungen und Import öffnen');
  document.querySelector('.ad-menu-toggle svg').innerHTML='<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>';
  const labels={entry:['Trinkgeld erfassen','Beträge erfassen und die Dienste des Teams zuordnen.'],settlement:['Abrechnung','Verteilung prüfen und die Abrechnung abschliessen.']};
  function setView(next,focus=false){
    view=next;body.dataset.workspaceView=view;
    document.getElementById('workspaceHeading').textContent=labels[view][0];
    document.getElementById('workspaceDescription').textContent=labels[view][1];
    if(focus)document.getElementById('workspaceHeading').focus({preventScroll:true});
    schedule();
  }
  function openArea(area,trigger){
    returnFocus=trigger;
    if(area==='entry'||area==='settlement'){setView(area,true);main.scrollIntoView({block:'start',behavior:'instant'});return;}
    // Use the V1.1 editor and workflow entry points; their conflict and dirty guards remain owners.
    window.openSettings();
    if(area==='staff'||area==='shifts')window.openEditor(area);else window.openSavedCalculations();
    schedule();
    requestAnimationFrame(()=>drawer.querySelector('.drawerhead button').focus());
  }
  nav.addEventListener('click',event=>{const button=event.target.closest('[data-workspace]');if(button)openArea(button.dataset.workspace,button);});
  empty.querySelector('button').onclick=()=>{if(!window.calculate())setView('entry',true);};
  const money=value=>window.chf(Number(value)||0);
  function dateLabel(value){if(!value)return 'Datum auswählen';return new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value+'T12:00:00'));}
  function put(id,value){const node=document.getElementById(id);if(node&&node.textContent!==value)node.textContent=value;}
  function cell(row,tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;row.append(el);return el;}
  function renderSettlement(){
    const original=document.getElementById('result');
    if(resultSection.classList.contains('hidden')||!original.textContent.trim())return;
    const numbers=window.SilkLocalRepository.getWork().calculation?.numbers;
    if(!numbers?.lines)return;
    const key=JSON.stringify([numbers,window.SilkLocalRepository.getStaffLabels()]);
    if(key===resultKey)return;resultKey=key;
    presentation.replaceChildren();
    const top=document.createElement('div');top.className='workspace-section-head';
    const title=document.createElement('h2');title.textContent='Verteilung & Auszahlung';top.append(title);
    const back=document.createElement('button');back.type='button';back.textContent='Erfassung bearbeiten';back.onclick=()=>setView('entry',true);top.append(back);presentation.append(top);
    const summary=document.createElement('dl');summary.className='workspace-distribution';
    // Summaries only combine the already calculated exact values. No new distribution formula.
    const staff=numbers.lines.filter(x=>x.days!==undefined);
    const kitchen=numbers.lines.find(x=>x.name==='Küche gesamt');
    const housekeeping=numbers.lines.find(x=>x.name==='Housekeeping gesamt');
    for(const [label,value] of [['Trinkgeld gesamt',numbers.total],['Service',staff.reduce((n,x)=>n+x.amount,0)],['Küche',kitchen?.amount||0],['Housekeeping',housekeeping?.amount||0]]){
      const item=document.createElement('div');cell(item,'dt',label);cell(item,'dd',money(value));summary.append(item);
    }presentation.append(summary);
    const table=document.createElement('table');table.className='workspace-table';
    const caption=document.createElement('caption');caption.textContent='Berechnete Anteile und Auszahlungen';table.append(caption);
    const head=document.createElement('thead'),header=document.createElement('tr');
    ['Mitarbeiter / Bereich','Dienste','Anteil (CHF)','Auszahlung (CHF)'].forEach((x,i)=>{const th=cell(header,'th',x,i>1?'numeric':'');th.scope='col';});head.append(header);table.append(head);
    const tbody=document.createElement('tbody');
    for(const line of numbers.lines){const row=document.createElement('tr');if(line.days===undefined)row.className='workspace-total-row';
      const name=line.days===undefined?line.name:window.SilkIdentity.staffLabel(line.name);
      const th=cell(row,'th',name);th.scope='row';cell(row,'td',line.details?.join(' · ')||'Gesamtanteil','workspace-duty-detail');
      cell(row,'td',money(line.amount),'numeric').dataset.label='Anteil';cell(row,'td',money(line.payout),'numeric workspace-payout').dataset.label='Auszahlung';tbody.append(row);
    }table.append(tbody);presentation.append(table);
    const rounded=numbers.lines.reduce((sum,line)=>sum+line.payout,0);
    const note=document.createElement('div');note.className='workspace-rounding';
    cell(note,'span','Auszahlung gesamt');cell(note,'strong',money(rounded));
    const help=document.createElement('p');help.textContent='Auszahlungen werden wie bisher auf ganze Franken gerundet. Differenz zum Trinkgeld gesamt: '+money(rounded-numbers.total)+'.';note.append(help);presentation.append(note);
    const rules=document.createElement('p');rules.className='workspace-rule-note';rules.textContent='Ausgangsverteilung: Service 70 % · Küche 30 %. Housekeeping: je 2,5 % vom jeweiligen Anteil. Sonderregeln und Schichtgewichtungen bleiben berücksichtigt.';presentation.append(rules);
    resultSection.classList.add('workspace-projected');
  }
  function ensureSearch(kind,host,list){
    let box=host.querySelector('.workspace-search');
    if(!box){box=document.createElement('label');box.className='workspace-search';box.textContent=kind==='staff'?'Mitarbeiter suchen':'Dienst suchen';const input=document.createElement('input');input.type='search';input.placeholder=kind==='staff'?'Name eingeben':'Bezeichnung eingeben';input.autocomplete='off';box.append(input);list.before(box);input.addEventListener('input',()=>filterRows(kind));
      const empty=document.createElement('p');empty.className='workspace-no-match';empty.hidden=true;empty.textContent='Keine passenden Einträge. Suche anpassen oder leeren.';list.after(empty);
    }
    filterRows(kind);
  }
  function filterRows(kind){const host=document.getElementById(kind==='staff'?'staffEditor':'shiftEditor'),query=host.querySelector('.workspace-search input')?.value.trim().toLocaleLowerCase('de-CH')||'';let found=0;
    host.querySelectorAll(kind==='staff'?'.editrow':'.shift-edit').forEach(row=>{const visible=!query||row.querySelector('input').value.toLocaleLowerCase('de-CH').includes(query);row.hidden=!visible;if(visible)found++;});
    const empty=host.querySelector('.workspace-no-match');if(empty)empty.hidden=found>0;
  }
  function update(){
    observer.disconnect();
    if(!window.document?.body||!main.isConnected)return;
    try{
      const state=window.SilkLocalRepository.getState(),mode=state.mode||'day';
      put('workspacePeriod',mode==='day'?dateLabel(document.getElementById('singleDate').value):dateLabel(document.getElementById('periodStart').value)+' – '+dateLabel(document.getElementById('periodEnd').value));
      const amount=[...document.querySelectorAll('#days .day')].reduce((n,day)=>n+[...day.querySelectorAll('input[type="number"]')].reduce((s,x)=>s+(Number(x.value)||0),0),0);
      put('workspaceAmount',money(amount));
      const status=document.getElementById('workStatus'),statusHost=document.getElementById('workspaceState');if(status&&status.parentElement!==statusHost)statusHost.append(status);
      const sync=document.querySelector('.silk-sync-status');if(sync&&sync.parentElement!==statusHost)statusHost.append(sync);
      for(const day of document.querySelectorAll('#days .day')){
        const head=day.querySelector('.dayhead'),panel=day.querySelector('.daybody');panel.id=day.id+'-body';head.setAttribute('aria-controls',panel.id);head.setAttribute('aria-expanded',String(day.classList.contains('open')));
        day.querySelectorAll('.field').forEach(field=>{const input=field.querySelector('input');if(input){const label=field.querySelector('label');label.htmlFor=input.id;label.textContent=input.id.startsWith('f_')?'Frühdienst · CHF':'Spätdienst · CHF';}});
      }
      main.querySelector('#dayPicker label').htmlFor='singleDate';
      document.querySelectorAll('.mode button').forEach(x=>x.setAttribute('aria-pressed',String(x.classList.contains('active'))));
      const open=drawer.classList.contains('open');let active=view;
      if(open){active=!document.getElementById('staffEditor').classList.contains('hidden')?'staff':!document.getElementById('shiftEditor').classList.contains('hidden')?'shifts':document.getElementById('savedCalculations')&&!document.getElementById('savedCalculations').classList.contains('hidden')?'history':'settings';}
      if(open&&!lastDrawerOpen&&!returnFocus)returnFocus=document.querySelector('.ad-menu-toggle');
      if(!open&&lastDrawerOpen){returnFocus?.focus?.({preventScroll:true});for(const input of drawer.querySelectorAll('.workspace-search input'))input.value='';}
      lastDrawerOpen=open;drawer.dataset.workspacePanel=active;
      drawerTitle.textContent=({staff:'Mitarbeiter',shifts:'Dienste',history:'Historie',settings:'Einstellungen'})[active]||'Einstellungen';
      nav.querySelectorAll('button').forEach(button=>{if(button.dataset.workspace===active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
      ensureSearch('staff',document.getElementById('staffEditor'),document.getElementById('employeeEditor'));
      ensureSearch('shifts',document.getElementById('shiftEditor'),document.getElementById('shiftEditorRows'));
      const nextOverlay=document.querySelector('#silk-import-modal .sim-card,#clearPeriodDialog:not(.hidden) .draft-dialog-card');
      if(nextOverlay!==overlay){
        if(nextOverlay){overlayReturn=document.activeElement;overlay=nextOverlay;main.inert=true;document.querySelector('.topbar').inert=true;drawer.inert=true;overlay.querySelector('button')?.focus();}
        else{overlay=null;main.inert=open;document.querySelector('.topbar').inert=open;drawer.inert=!open;overlayReturn?.focus?.({preventScroll:true});}
      }
      for(const label of document.querySelectorAll('#silk-import-modal .sim-photo,#silk-import-modal .sim-csv')){
        label.tabIndex=0;label.setAttribute('role','button');label.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();label.click();}};
      }
      const resultVisible=!resultSection.classList.contains('hidden');
      if(resultVisible&&!lastResultVisible)setView('settlement');
      lastResultVisible=resultVisible;
      empty.hidden=view!=='settlement'||resultVisible;
      renderSettlement();
    }finally{observer.observe(body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','data-dirty']});}
  }
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;update();});}
  const observer=new MutationObserver(schedule);
  document.addEventListener('click',event=>{
    if(event.target.closest('.calcbtn'))queueMicrotask(()=>{if(!resultSection.classList.contains('hidden'))setView('settlement',true);});
    if(event.target.closest('.ad-menu-toggle'))returnFocus=event.target.closest('button');
    if(event.target.closest('.addwide')){const panel=event.target.closest('#staffEditor,#shiftEditor');const input=panel?.querySelector('.workspace-search input');if(input)input.value='';schedule();}
    if(event.target.closest('.saved-open[data-draft="true"]'))setView('entry');
  });
  document.addEventListener('keydown',event=>{
    // Capture Escape before the legacy drawer handler. A newly opened dirty-state
    // decision must not be cancelled by the very same key's default action.
    if(event.key==='Escape'&&document.querySelector('dialog[open]')){event.stopImmediatePropagation();return;}
    if(event.key==='Escape'&&!overlay&&drawer.classList.contains('open')){event.preventDefault();event.stopImmediatePropagation();window.closeSettings();return;}
    if(!overlay||document.querySelector('dialog[open]'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(overlay.closest('#silk-import-modal'))overlay.querySelector('.sim-close').click();else window.closeClearPeriod();}
    if(event.key==='Tab'){const nodes=[...overlay.querySelectorAll('button,input:not([hidden]),textarea,select,summary,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);const first=nodes[0],last=nodes.at(-1);event.stopImmediatePropagation();if(event.shiftKey&&(document.activeElement===first||!overlay.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!overlay.contains(document.activeElement))){event.preventDefault();first?.focus();}}
  },true);
  for(const name of ['silk:local-change','silk:cloud-applied'])window.addEventListener(name,schedule);
  main.addEventListener('input',schedule);main.addEventListener('change',schedule);
  setView('entry');update();
})();
