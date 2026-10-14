(function () {
  'use strict';
  let editor=null;
  const oldOpen=openSettings,oldClose=closeSettings,oldBack=backSettings;
  const copy=SilkSyncMerge.clone;
  function setModal(open){drawer.inert=!open;drawer.setAttribute('aria-hidden',String(!open));document.querySelector('main').inert=open;document.querySelector('header').inert=open;}
  setModal(false);
  openSettings=function(){setModal(true);oldOpen();};
  // A row's ID is never taken from the editable label field.
  function currentRows(kind) {
    return kind === 'staff'
      ? STAFF.map(id => ({id, label:SilkIdentity.staffLabel(id)}))
      : SHIFTS.map(s => ({...s, id:s.name, label:s.label || s.name}));
  }
  function readEditor() {
    if (!editor) return;
    const nodes = editor.kind === 'staff'
      ? [...employeeEditor.querySelectorAll('.editrow')]
      : [...shiftEditorRows.querySelectorAll('.shift-edit')];
    const weight = (node, field, previous) => node.querySelector('[data-field='+field+']').value === String(previous*100)
      ? previous : Number(node.querySelector('[data-field='+field+']').value)/100;
    editor.rows = nodes.map((node, i) => ({...editor.rows[i],
      label:node.querySelector('input').value,
      ...(editor.kind === 'shifts' ? {
        f:weight(node,'f',editor.rows[i].f),
        s:weight(node,'s',editor.rows[i].s)
      } : {})
    }));
  }
  function dirtyEditor(){readEditor();return editor&&!SilkSyncMerge.equal(editor.rows,editor.original);}
  function leaveEditor(action){if(!dirtyEditor()){editor=null;action();return;}
    let dialog=document.getElementById('editorDecision');if(!dialog){dialog=document.createElement('dialog');dialog.id='editorDecision';dialog.className='release-dialog';document.body.appendChild(dialog);}
    dialog.innerHTML='<h2>Änderungen speichern?</h2><p>Die Änderungen in der Verwaltung wurden noch nicht übernommen.</p><div class="dialog-actions"><button data-choice="save">Speichern</button><button data-choice="discard">Verwerfen</button><button data-choice="back">Zurück</button></div>';
    dialog.onclick=e=>{const c=e.target.dataset.choice;if(!c)return;if(c==='save'&&!commitEditor())return;if(c!=='back')editor=null;dialog.close();if(c!=='back')action();};dialog.showModal();
  }
  closeSettings=function(){leaveEditor(()=>{oldClose();setModal(false);});};
  backSettings=function(){leaveEditor(()=>{oldBack();});};
  openEditor=function(kind){const rows=currentRows(kind);editor={kind,rows:copy(rows),original:copy(rows)};settingsHome.classList.add('hidden');document.getElementById('savedCalculations')?.classList.add('hidden');staffEditor.classList.toggle('hidden',kind!=='staff');shiftEditor.classList.toggle('hidden',kind!=='shifts');document.querySelectorAll('.editor-error').forEach(x=>x.remove());renderEditor();};
  function renderEditor(){if(!editor)return;
    if(editor.kind==='staff')employeeEditor.innerHTML=editor.rows.map((row,i)=>`<div class="editrow"><input aria-label="Mitarbeiter ${i+1}" value="${esc(row.label)}"><button class="mini danger" onclick="removeEmployee(${i})" aria-label="Mitarbeiter ${esc(row.label||String(i+1))} löschen">Löschen</button></div>`).join('');
    else shiftEditorRows.innerHTML=editor.rows.map((s,i)=>`<div class="shift-edit"><label>Dienst<input data-field="name" aria-label="Dienst ${i+1}" value="${esc(s.label)}"></label><div class="grid2"><label>Früh (%)<input data-field="f" aria-label="Frühanteil Dienst ${i+1}" type="number" min="0" max="100" value="${s.f*100}"></label><label>Spät (%)<input data-field="s" aria-label="Spätanteil Dienst ${i+1}" type="number" min="0" max="100" value="${s.s*100}"></label></div><button class="mini danger" onclick="removeShift(${i})">Dienst löschen</button></div>`).join('');
  }
  function showEditorError(message){const box=editor.kind==='staff'?staffEditor:shiftEditor;let node=box.querySelector('.editor-error');if(!node){node=document.createElement('p');node.className='editor-error period-error';node.setAttribute('role','alert');box.querySelector('.editor').before(node);}node.textContent=message;}
  function commitEditor(){
    if(!editor)return true;
    readEditor();
    if(!SilkSyncMerge.equal(currentRows(editor.kind),editor.original)){
      showEditorError('Die gemeinsame Liste wurde inzwischen geändert. Bitte Änderungen verwerfen und die aktuelle Liste erneut öffnen.');return false;
    }
    const rows=editor.rows.map(x=>({...x,label:editor.kind==='staff'?x.label.trim():x.label.trim().toUpperCase()}));
    if(!rows.length||rows.some(x=>!x.label)){showEditorError('Jeder Eintrag benötigt eine Bezeichnung. Zum Entfernen bitte Löschen verwenden.');return false;}
    if(new Set(rows.map(x=>x.label)).size!==rows.length||rows.some(x=>rows.some(y=>y.id!==x.id&&y.id===x.label))){showEditorError('Diese Bezeichnung ist bereits einem anderen Eintrag zugeordnet. Bitte eine eindeutige Bezeichnung verwenden.');return false;}
    if(editor.kind==='shifts'&&rows.some(x=>!Number.isFinite(x.f)||!Number.isFinite(x.s)||x.f<0||x.s<0||Math.abs(x.f+x.s-1)>.001)){showEditorError('Früh und Spät müssen zusammen 100 % ergeben.');return false;}
    const removed=editor.original.filter(x=>!rows.some(row=>row.id===x.id)).map(x=>x.id);
    const reference=editor.kind==='staff'?'name':'shift';
    if(Object.values(getState().byDate||{}).some(d=>(d.assignments||[]).some(a=>a.shift&&removed.includes(a[reference])))){
      showEditorError('Ein Eintrag ist noch einem Tag zugeordnet. Bitte die Zuordnung zuerst prüfen; sie wird nicht automatisch gelöscht.');return false;
    }
    const labels={...SilkLocalRepository.getStaffLabels()};
    const next=editor.kind==='staff'?rows.map(x=>{labels[x.id]=x.label;return x.id;}):rows.map(({id,label,...x})=>({...x,name:id,label}));
    try {
      SilkLocalRepository.transaction(()=>{
        if(editor.kind==='staff'){SilkLocalRepository.saveStaff(next);SilkLocalRepository.saveStaffLabels(labels);}
        else SilkLocalRepository.saveShifts(next);
        // Any old result must be recalculated, even when only its labels changed.
        SilkLocalRepository.saveWork({...SilkLocalRepository.getWork(),calculation:null});
      });
    } catch(error) {showEditorError('Speichern fehlgeschlagen. Die bisherigen Daten bleiben erhalten. Bitte Änderungen noch nicht schliessen.');return false;}
    if(editor.kind==='staff')STAFF=next;else{SHIFTS=next;rebuild();}
    editor=null;buildVisibleDays();oldBack();return true;
  }
  addEmployee=function(){readEditor();editor.rows.push({id:SilkIdentity.newKey('staff'),label:''});renderEditor();employeeEditor.querySelector('.editrow:last-child input')?.focus();};
  addShift=function(){readEditor();editor.rows.push({id:SilkIdentity.newKey('shift'),label:'',f:.5,s:.5,color:'#eee'});renderEditor();};
  removeEmployee=function(i){readEditor();editor.rows.splice(i,1);renderEditor();};
  removeShift=function(i){readEditor();editor.rows.splice(i,1);renderEditor();};
  saveEmployees=commitEditor;saveShifts=commitEditor;
  for(const box of [staffEditor,shiftEditor]){
    const footer=document.createElement('div');footer.className='editor-actions';
    footer.append(box.querySelector('.addwide'),box.querySelector('.savewide'));
    const discard=document.createElement('button');discard.className='secondary';discard.textContent='Verwerfen';discard.onclick=()=>{editor=null;oldBack();};footer.append(discard);box.append(footer);
  }
  // Remote refresh never silently replaces a form currently being edited.
  window.addEventListener('silk:cloud-applied',()=>{if(editor){const remote=currentRows(editor.kind);if(!SilkSyncMerge.equal(remote,editor.original)){showEditorError('Der gemeinsame Stand wurde geändert. Bitte Eingaben vergleichen oder verwerfen.');}}});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||document.querySelector('dialog[open]'))return;
    const modal=document.getElementById('silkConflictPanel')||document.getElementById('silkPairing')||(drawer.classList.contains('open')?drawer:null);if(!modal)return;
    const nodes=[...modal.querySelectorAll('button,input,select,a[href],[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first?.focus();}
  });
})();
