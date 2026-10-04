(function () {
  'use strict';
  let editor=null;
  const oldOpen=openSettings,oldClose=closeSettings,oldBack=backSettings;
  const copy=SilkSyncMerge.clone;
  function setModal(open){drawer.inert=!open;drawer.setAttribute('aria-hidden',String(!open));document.querySelector('main').inert=open;document.querySelector('header').inert=open;}
  setModal(false);
  openSettings=function(){setModal(true);oldOpen();};
  function readEditor(){if(!editor)return;editor.rows=editor.kind==='staff'?[...employeeEditor.querySelectorAll('input')].map(x=>x.value):[...shiftEditorRows.querySelectorAll('.shift-edit')].map(row=>({name:row.querySelector('[data-field=name]').value,f:Number(row.querySelector('[data-field=f]').value)/100,s:Number(row.querySelector('[data-field=s]').value)/100,color:row.dataset.color}));}
  function dirtyEditor(){readEditor();return editor&&!SilkSyncMerge.equal(editor.rows,editor.original);}
  function leaveEditor(action){if(!dirtyEditor()){editor=null;action();return;}
    let dialog=document.getElementById('editorDecision');if(!dialog){dialog=document.createElement('dialog');dialog.id='editorDecision';dialog.className='release-dialog';document.body.appendChild(dialog);}
    dialog.innerHTML='<h2>Änderungen speichern?</h2><p>Die Änderungen in der Verwaltung wurden noch nicht übernommen.</p><div class="dialog-actions"><button data-choice="save">Speichern</button><button data-choice="discard">Verwerfen</button><button data-choice="back">Zurück</button></div>';
    dialog.onclick=e=>{const c=e.target.dataset.choice;if(!c)return;if(c==='save'&&!commitEditor())return;if(c!=='back')editor=null;dialog.close();if(c!=='back')action();};dialog.showModal();
  }
  closeSettings=function(){leaveEditor(()=>{oldClose();setModal(false);});};
  backSettings=function(){leaveEditor(()=>{oldBack();});};
  openEditor=function(kind){editor={kind,rows:copy(kind==='staff'?STAFF:SHIFTS),original:copy(kind==='staff'?STAFF:SHIFTS)};settingsHome.classList.add('hidden');document.getElementById('savedCalculations')?.classList.add('hidden');staffEditor.classList.toggle('hidden',kind!=='staff');shiftEditor.classList.toggle('hidden',kind!=='shifts');renderEditor();};
  function renderEditor(){if(!editor)return;
    if(editor.kind==='staff')employeeEditor.innerHTML=editor.rows.map((name,i)=>`<div class="editrow"><input aria-label="Mitarbeiter ${i+1}" value="${esc(name)}"><button class="mini danger" onclick="removeEmployee(${i})" aria-label="Mitarbeiter ${esc(name||String(i+1))} löschen">Löschen</button></div>`).join('');
    else shiftEditorRows.innerHTML=editor.rows.map((s,i)=>`<div class="shift-edit" data-color="${esc(s.color||'#eee')}"><label>Dienst<input data-field="name" aria-label="Dienst ${i+1}" value="${esc(s.name)}"></label><div class="grid2"><label>Früh (%)<input data-field="f" aria-label="Frühanteil Dienst ${i+1}" type="number" min="0" max="100" value="${s.f*100}"></label><label>Spät (%)<input data-field="s" aria-label="Spätanteil Dienst ${i+1}" type="number" min="0" max="100" value="${s.s*100}"></label></div><button class="mini danger" onclick="removeShift(${i})">Dienst löschen</button></div>`).join('');
  }
  function showEditorError(message){const box=editor.kind==='staff'?staffEditor:shiftEditor;let node=box.querySelector('.editor-error');if(!node){node=document.createElement('p');node.className='editor-error period-error';node.setAttribute('role','alert');box.querySelector('.editor').before(node);}node.textContent=message;}
  function commitEditor(){if(!editor)return true;readEditor();const remote=editor.kind==='staff'?STAFF:SHIFTS;if(!SilkSyncMerge.equal(remote,editor.original)&&!confirm('Andere Geräte haben diese Liste geändert. Deine angezeigte Fassung stattdessen übernehmen?'))return false;const rows=editor.kind==='staff'?editor.rows.map(x=>x.trim()).filter(Boolean):editor.rows.map(x=>({...x,name:x.name.trim().toUpperCase()})).filter(x=>x.name);
    if(!rows.length){showEditorError('Mindestens ein Eintrag ist erforderlich.');return false;}
    const names=editor.kind==='staff'?rows:rows.map(x=>x.name);if(new Set(names).size!==names.length){showEditorError('Jede Bezeichnung darf nur einmal vorkommen.');return false;}
    if(editor.kind==='shifts'&&rows.some(x=>!Number.isFinite(x.f)||!Number.isFinite(x.s)||x.f<0||x.s<0||Math.abs(x.f+x.s-1)>.001)){showEditorError('Früh und Spät müssen zusammen 100 % ergeben.');return false;}
    if(editor.kind==='staff'){STAFF=rows;SilkLocalRepository.saveStaff(STAFF);}else{SHIFTS=rows;rebuild();SilkLocalRepository.saveShifts(SHIFTS);}
    editor=null;buildVisibleDays();oldBack();return true;
  }
  addEmployee=function(){readEditor();editor.rows.push('');renderEditor();employeeEditor.querySelector('input:last-of-type')?.focus();};
  addShift=function(){readEditor();editor.rows.push({name:'',f:.5,s:.5,color:'#eee'});renderEditor();};
  removeEmployee=function(i){readEditor();editor.rows.splice(i,1);renderEditor();};
  removeShift=function(i){readEditor();editor.rows.splice(i,1);renderEditor();};
  saveEmployees=commitEditor;saveShifts=commitEditor;
  for(const box of [staffEditor,shiftEditor]){
    const footer=document.createElement('div');footer.className='editor-actions';
    footer.append(box.querySelector('.addwide'),box.querySelector('.savewide'));
    const discard=document.createElement('button');discard.className='secondary';discard.textContent='Verwerfen';discard.onclick=()=>{editor=null;oldBack();};footer.append(discard);box.append(footer);
  }
  // Remote refresh never silently replaces a form currently being edited.
  window.addEventListener('silk:cloud-applied',()=>{if(editor){const remote=editor.kind==='staff'?STAFF:SHIFTS;if(!SilkSyncMerge.equal(remote,editor.original)){showEditorError('Der gemeinsame Stand wurde geändert. Bitte Eingaben vergleichen oder verwerfen.');}}});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||document.querySelector('dialog[open]'))return;
    const modal=document.getElementById('silkConflictPanel')||document.getElementById('silkPairing')||(drawer.classList.contains('open')?drawer:null);if(!modal)return;
    const nodes=[...modal.querySelectorAll('button,input,select,a[href],[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first?.focus();}
  });
  const syncRow=document.createElement('button');syncRow.className='settingsrow';syncRow.innerHTML='<span class="setting-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5M6 8a7 7 0 0 1 12-2l2 3M4 15l2 3a7 7 0 0 0 12-2"/></svg></span><span class="setting-copy"><strong>Geräteverbindung</strong><small>Gemeinsamen Stand und Konflikte prüfen</small></span><span class="setting-arrow">›</span>';
  syncRow.onclick=()=>{if(SilkLocalRepository.getConflicts().length)SilkSyncService.showConflicts();else if(!SilkLocalRepository.getWorkspace())SilkSyncService.pair();else SilkSyncService.syncNow();};settingsHome.append(syncRow);
})();
