/* Current work, editable checkpoint and final settlement are separate states. */
(function () {
  'use strict';
  const repo=SilkLocalRepository,M=SilkSyncMerge;
  let calculating=false, restoring=false, pendingAction=null;
  const dates=()=>visibleDates().map(dateIn);
  const stamp=value=>new Intl.DateTimeFormat('de-CH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  function snapshot() {
    const state=getState(),keys=dates();
    return {mode:MODE,singleDate:singleDate.value,periodStart:keys[0]||periodStart.value,periodEnd:keys.at(-1)||periodEnd.value,
      byDate:Object.fromEntries(keys.map(key=>{const d=state.byDate?.[key]||{};return [key,{f:d.f??'',s:d.s??'',assignments:(d.assignments||[]).filter(a=>a.shift).map(a=>({...a})).sort((a,b)=>a.name.localeCompare(b.name))}];})),staff:[...STAFF],shifts:SHIFTS.map(x=>({...x}))};
  }
  const fingerprint=()=>M.stable(snapshot());
  function isDirty(){const w=repo.getWork();return !!w.checkpoint && fingerprint()!==M.stable(w.checkpoint) || !w.checkpoint && Object.values(snapshot().byDate).some(d=>d.f!==''||d.s!==''||d.assignments.length);}
  function updateWorkStatus() {
    let node=document.getElementById('workStatus');
    if(!node){node=document.createElement('p');node.id='workStatus';node.setAttribute('aria-live','polite');document.querySelector('.draft-actions').before(node);}
    const work=repo.getWork(),active=repo.getSettlements().find(x=>String(x.id)===String(work.activeId));
    const dirty=isDirty();node.textContent=dirty?'Ungespeicherte Änderungen':active?.dataFormat==='draft-v2'?'Entwurf gespeichert':active?.dataFormat==='final-v2'?'Abrechnung finalisiert':'Aktueller Arbeitsstand';
    node.dataset.dirty=String(dirty);
    const button=document.querySelector('.draft-actions button');
    button.textContent=active?.dataFormat?.startsWith('draft')?'Entwurf speichern':'Als Entwurf speichern';
    const finalButton=document.getElementById('saveCalculationButton');
    if(finalButton){finalButton.textContent=active?.dataFormat==='final-v2'&&!dirty?'Finalisiert':'Abrechnung finalisieren';finalButton.disabled=active?.dataFormat==='final-v2'&&!dirty;finalButton.classList.toggle('saved',finalButton.disabled);}
  }
  function refresh() {updateWorkStatus();if(!calculating)resultSection.classList.add('hidden');}
  function validateDay(d) {
    const assigned=(d.assignments||[]).filter(a=>a.shift),empty=v=>v===''||v==null;
    if(empty(d.f)&&empty(d.s)&&!assigned.length)return {key:'neutral',label:'Nicht bearbeitet'};
    if([d.f,d.s].some(v=>!empty(v)&&(!Number.isFinite(Number(v))||Number(v)<0)))return {key:'review',label:'Betrag prüfen'};
    if(assigned.some(a=>!STAFF.includes(a.name)||!FACTOR[a.shift]))return {key:'review',label:'Zuordnung prüfen'};
    if(empty(d.f)||empty(d.s))return {key:'incomplete',label:'Unvollständig'};
    let early=Number(d.f)*.7*.975,late=Number(d.s)*.7*.975;
    const emily=assigned.find(a=>a.name==='Emily');
    if(emily){const weight=FACTOR[emily.shift],max=Math.min(10,early+late);let ef=Math.min(max*weight.f,early),es=Math.min(max*weight.s,late),remaining=max-ef-es;if(remaining>0){const add=Math.min(remaining,early-ef);ef+=add;es+=Math.min(remaining-add,late-es);}early-=ef;late-=es;}
    const regular=assigned.filter(a=>a.name!=='Emily');
    if(early>0.000001&&!regular.some(a=>FACTOR[a.shift].f>0))return {key:'review',label:'Frühdienst prüfen'};
    if(late>0.000001&&!regular.some(a=>FACTOR[a.shift].s>0))return {key:'review',label:'Spätdienst prüfen'};
    return {key:'complete',label:'Vollständig'};
  }
  function validateAll() {
    const keys=dates();if(!keys.length)return false;
    const problems=keys.map(date=>({date,...validateDay(getState().byDate?.[date]||{})})).filter(x=>x.key!=='complete');
    let msg=document.getElementById('calculationError');
    if(!msg){msg=document.createElement('p');msg.id='calculationError';msg.className='period-error';msg.setAttribute('role','alert');document.querySelector('.actionbar').prepend(msg);}
    msg.textContent=problems.length?`${problems.length} Tag(e) noch bearbeiten: ${problems.slice(0,3).map(x=>x.date+' · '+x.label).join('; ')}${problems.length>3?' …':''}. Unvollständige Eingaben kannst du als Entwurf speichern.`:'';
    msg.classList.toggle('hidden',!problems.length);
    if(problems.length){const first=document.getElementById('day_'+problems[0].date);if(first&&!first.classList.contains('open'))toggleDay(problems[0].date);first?.scrollIntoView({block:'center'});}
    return !problems.length;
  }
  function showDecision(action) {
    if(!isDirty()){action();return;}
    pendingAction=action;
    let dialog=document.getElementById('unsavedDialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='unsavedDialog';dialog.className='release-dialog';dialog.innerHTML='<h2>Ungespeicherte Änderungen</h2><p>Den aktuellen Stand als Entwurf speichern oder die Änderungen seit dem letzten Zwischenstand verwerfen?</p><div class="dialog-actions"><button data-choice="save">Speichern</button><button data-choice="discard">Verwerfen</button><button data-choice="back">Zurück</button></div>';document.body.appendChild(dialog);
      dialog.onclick=e=>{const choice=e.target.dataset.choice;if(!choice)return;const next=pendingAction;pendingAction=null;if(choice==='save'&&!saveCurrentDraft())return;if(choice==='discard')discardWork();dialog.close();if(choice!=='back')next?.();};}
    dialog.showModal();
  }
  function restoreInputs(input) {
    repo.transaction(()=>{
      repo.saveStaff(input.staff||STAFF);repo.saveShifts(input.shifts||SHIFTS);
      repo.saveState({...getState(),mode:input.mode,singleDate:input.singleDate,periodStart:input.periodStart,periodEnd:input.periodEnd,byDate:{...getState().byDate,...input.byDate}});
    });
    STAFF=repo.getStaff();SHIFTS=repo.getShifts();rebuild();restoring=true;try{loadState();}finally{restoring=false;}resultSection.classList.add('hidden');updateWorkStatus();
  }
  function discardWork() {
    const work=repo.getWork();
    if(work.checkpoint)restoreInputs(work.checkpoint);
    else {const st=getState();for(const key of dates())st.byDate[key]={f:'',s:'',assignments:[]};repo.saveState(st);loadState();}
    repo.saveWork({...work,calculation:null});updateWorkStatus();
  }
  window.saveCurrentDraft=function() {
    saveState();const keys=dates();if(!keys.length)return false;
    const input=snapshot(),work=repo.getWork(),items=repo.getSettlements();
    const existing=items.find(x=>String(x.id)===String(work.activeId)&&x.dataFormat?.startsWith('draft'));
    const id=existing?.id||SilkStorageModels.uuid(),now=new Date().toISOString();
    const item={id,dataFormat:'draft-v2',label:input.periodStart+' – '+input.periodEnd,createdAt:existing?.createdAt||now,savedAt:now,periodStart:input.periodStart,periodEnd:input.periodEnd,inputSnapshot:input};
    repo.transaction(()=>{repo.saveSettlements([...items.filter(x=>String(x.id)!==String(id)),item]);repo.saveWork({...work,activeId:id,checkpoint:input});});
    updateWorkStatus();return true;
  };
  window.continueDraft=function(id){showDecision(()=>{
    const item=repo.getSettlements().find(x=>String(x.id)===String(id)&&x.dataFormat?.startsWith('draft'));if(!item?.inputSnapshot)return;
    const input=item.inputSnapshot;
    repo.transaction(()=>{repo.saveWork({activeId:item.id,checkpoint:input,calculation:null});restoreInputs(input);});
    closeSettings();updateWorkStatus();
  });};
  window.deleteDraft=function(id){if(!confirm('Diesen Entwurf löschen?'))return;
    const remove=()=>{repo.transaction(()=>{repo.saveSettlements(repo.getSettlements().filter(x=>String(x.id)!==String(id)));if(String(repo.getWork().activeId)===String(id))repo.saveWork({activeId:null,checkpoint:null,calculation:null});});openSavedCalculations();updateWorkStatus();};
    if(String(repo.getWork().activeId)===String(id))showDecision(remove);else remove();
  };
  window.saveCurrentCalculation=function(){
    if(!validateAll())return;
    const work=repo.getWork();if(work.calculation?.fingerprint!==fingerprint()){alert('Die Eingaben haben sich geändert. Bitte zuerst neu berechnen.');return;}
    if(!confirm('Diese geprüfte Abrechnung jetzt finalisieren? Sie wird als abgeschlossene Abrechnung gespeichert.'))return;
    const existing=repo.getSettlements().find(x=>String(x.id)===String(work.activeId));
    const id=existing?.dataFormat?.startsWith('draft')?existing.id:SilkStorageModels.uuid(),now=new Date().toISOString(),input=snapshot();
    const item={id,dataFormat:'final-v2',label:input.periodStart+' – '+input.periodEnd,periodStart:input.periodStart,periodEnd:input.periodEnd,savedAt:now,finalizedAt:now,inputSnapshot:input,resultData:work.calculation.numbers,html:result.innerHTML};
    repo.transaction(()=>{repo.saveSettlements([...repo.getSettlements().filter(x=>String(x.id)!==String(id)),item]);repo.saveWork({activeId:id,checkpoint:input,calculation:work.calculation});});
    resultSection.classList.remove('hidden');updateWorkStatus();
  };
  const coreCalculate=calculate;
  calculate=function(){saveState();if(!validateAll()){resultSection.classList.add('hidden');return false;}calculating=true;
    try {coreCalculate();repo.saveWork({...repo.getWork(),calculation:{fingerprint:fingerprint(),numbers:window.SilkCalculatedNumbers}});const button=document.getElementById('saveCalculationButton');if(button)button.onclick=saveCurrentCalculation;updateWorkStatus();}
    finally{calculating=false;}
    return true;
  };
  window.openSavedCalculations=function(){
    settingsHome.classList.add('hidden');staffEditor.classList.add('hidden');shiftEditor.classList.add('hidden');
    let panel=document.getElementById('savedCalculations');if(!panel){panel=document.createElement('div');panel.id='savedCalculations';drawer.appendChild(panel);}panel.classList.remove('hidden');
    const items=repo.getSettlements().sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)));
    const group=(title,list,draft)=>`<h3>${title}</h3><div class="saved-list">${list.map(x=>`<div class="saved-item"><button class="saved-open" data-open="${esc(x.id)}" data-draft="${draft}"><strong>${esc(x.label)}</strong><small>${draft?'Entwurf':x.dataFormat==='final-v2'?'Finalisiert':'Ergebnis-Archiv'} · ${esc(stamp(x.savedAt))}</small></button>${draft?`<button class="saved-delete" data-delete="${esc(x.id)}" aria-label="Entwurf löschen">Löschen</button>`:''}</div>`).join('')||'<p class="saved-empty">Noch keine Einträge.</p>'}</div>`;
    panel.innerHTML='<button class="backlink" onclick="backFromSaved()">← Einstellungen</button>'+group('Entwürfe',items.filter(x=>x.dataFormat?.startsWith('draft')),true)+group('Finalisierte Abrechnungen',items.filter(x=>x.dataFormat==='final-v2'),false)+group('Bisheriges Ergebnis-Archiv',items.filter(x=>!x.dataFormat?.startsWith('draft')&&x.dataFormat!=='final-v2'),false);
    panel.onclick=e=>{const b=e.target.closest('button');if(b?.dataset.delete)deleteDraft(b.dataset.delete);if(b?.dataset.open)b.dataset.draft==='true'?continueDraft(b.dataset.open):restoreSavedCalculation(b.dataset.open);};
  };
  window.restoreSavedCalculation=function(id){const item=repo.getSettlements().find(x=>String(x.id)===String(id));if(!item)return;
    let dialog=document.getElementById('archiveDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='archiveDialog';dialog.className='release-dialog archive-dialog';document.body.appendChild(dialog);}
    // Archive content is kept separate from editable current inputs.
    dialog.innerHTML=`<h2>${item.dataFormat==='final-v2'?'Finalisierte Abrechnung':'Ergebnis-Archiv'}</h2><p>${esc(item.label)} · ${esc(stamp(item.savedAt))}</p><div class="archive-result"></div><button type="button">Schließen</button>`;
    const template=document.createElement('template');template.innerHTML=item.html||'';
    template.content.querySelectorAll('script,iframe,object,embed,style,link').forEach(x=>x.remove());template.content.querySelectorAll('*').forEach(x=>[...x.attributes].forEach(a=>{if(a.name.startsWith('on')||/^(href|src)$/i.test(a.name))x.removeAttribute(a.name);}));
    dialog.querySelector('.archive-result').append(template.content);dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal();
  };
  window.clearCurrentPeriod=()=>showDecision(()=>document.getElementById('clearPeriodDialog').classList.remove('hidden'));
  window.closeClearPeriod=()=>document.getElementById('clearPeriodDialog').classList.add('hidden');
  window.confirmClearPeriod=function(){repo.transaction(()=>{const st=getState();for(const key of dates())delete st.byDate[key];repo.saveState(st);repo.saveWork({activeId:null,checkpoint:null,calculation:null});});loadState();closeClearPeriod();refresh();};
  const previousBuild=buildVisibleDays;
  buildVisibleDays=function(){previousBuild();paintDays();updateWorkStatus();};
  function paintDays(){for(const day of document.querySelectorAll('.day')){const key=day.id.slice(4),status=validateDay(getState().byDate?.[key]||{});day.dataset.status=status.key;const meta=document.getElementById('meta_'+key);meta.textContent=(status.key==='complete'?'✓ ':status.key==='review'?'! ':'')+status.label;day.querySelectorAll('select').forEach(s=>s.setAttribute('aria-label','Dienst für '+s.dataset.name));}}
  const previousChange=changeDay;
  changeDay=function(key){previousChange(key);updatePeriodTotal();paintDays();updateWorkStatus();};
  // Save/Discard/Back before changing the selected period. Restore controls while asking.
  const rawSetMode=setMode,rawParts=updatePeriodFromParts,rawLoad=loadState;
  loadState=function(){restoring=true;try{return rawLoad();}finally{restoring=false;}};
  setMode=function(mode){if(restoring||repo.isApplyingCloud()||mode===MODE)return rawSetMode(mode);showDecision(()=>{repo.saveWork({...repo.getWork(),activeId:null,checkpoint:null,calculation:null});rawSetMode(mode);updateWorkStatus();});};
  updatePeriodFromParts=function(){const selected={};for(const prefix of ['periodStart','periodEnd'])for(const part of ['Day','Month','Year'])selected[prefix+part]=document.getElementById(prefix+part).value;setPeriodRange(periodStart.value,periodEnd.value);showDecision(()=>{for(const [id,value] of Object.entries(selected))document.getElementById(id).value=value;repo.saveWork({activeId:null,checkpoint:null,calculation:null});rawParts();});};
  singleDate.onchange=()=>{const next=singleDate.value;singleDate.value=getState().singleDate||next;showDecision(()=>{singleDate.value=next;repo.saveWork({activeId:null,checkpoint:null,calculation:null});buildVisibleDays();});};
  document.querySelector('.companion-app-link')?.addEventListener('click',e=>{e.preventDefault();const href=e.currentTarget.href;showDecision(()=>{location.href=href;});});
  window.addEventListener('beforeunload',e=>{if(isDirty()){e.preventDefault();e.returnValue='';}});
  window.addEventListener('silk:local-change',refresh);
  window.addEventListener('silk:cloud-applied',()=>{paintDays();updateWorkStatus();if(document.getElementById('savedCalculations')&&!document.getElementById('savedCalculations').classList.contains('hidden'))openSavedCalculations();});
  window.SilkWorkflow={snapshot,fingerprint,isDirty,guard:showDecision,validateDay,validateAll,updateWorkStatus};
  const savedRow=[...settingsHome.querySelectorAll('.settingsrow')].find(x=>x.textContent.includes('Gespeicherte Berechnungen'));
  if(savedRow){savedRow.onclick=openSavedCalculations;savedRow.querySelector('strong').textContent='Entwürfe & Abrechnungen';savedRow.querySelector('small').textContent='Fortsetzen oder abgeschlossene Ergebnisse öffnen';}
  paintDays();updateWorkStatus();
})();
