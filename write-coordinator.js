/* A browser-owned lock has no timeout and cannot be stolen by a background tab. */
(function (global) {
  'use strict';
  let writable=false, release, error='', failed=false;
  const message=()=>error || (writable?'':'Dieser Tab ist schreibgeschützt. Schließe den bearbeitenden SILK-Tab und übernimm anschließend hier die Bearbeitung.');
  function paint() {
    if(!document.body)return;
    let node=document.getElementById('silkWriteStatus');
    if(!node){node=document.createElement('aside');node.id='silkWriteStatus';node.setAttribute('role','alert');document.body.prepend(node);}
    node.hidden=writable&&!error;node.replaceChildren(document.createTextNode(message()));
    if(!writable&&navigator.locks){const b=document.createElement('button');b.textContent='Bearbeitung übernehmen';b.onclick=()=>acquire();node.append(b);}
    if(failed){const b=document.createElement('button');b.textContent='Eingaben erneut speichern';b.onclick=()=>{try{global.saveState();}catch{/* Visible inputs remain available. */}};node.append(b);}
  }
  async function acquire() {
    if(writable)return true;
    if(!navigator.locks){error='Sicheres Bearbeiten ist in diesem Browser nicht verfügbar. Bitte SILK in einem aktuellen Browser über HTTPS öffnen.';paint();return false;}
    return new Promise(resolve=>{
      navigator.locks.request('silk-document-v2-writer',{mode:'exclusive',ifAvailable:true},async lock=>{
        writable=!!lock;paint();resolve(writable);
        if(!lock)return;
        global.dispatchEvent(new CustomEvent('silk:writer-ready'));
        await new Promise(done=>{release=done;});writable=false;
      }).catch(()=>{error='Der Schreibschutz konnte nicht eingerichtet werden. Bitte den Browser neu öffnen.';paint();resolve(false);});
    });
  }
  function fail(text){error=text;failed=true;paint();}
  function assertWritable(){if(!writable){paint();throw new Error('SILK_READ_ONLY_TAB');}}
  global.SilkWriteCoordinator={acquire,canWrite:()=>writable,assertWritable,hasFailure:()=>failed,
    fail,clearFailure(){error='';failed=false;paint();}};
  global.SilkWriteCoordinator.ready=acquire();
  document.addEventListener('DOMContentLoaded',paint);
  // Do not accept edits that cannot be saved. Navigation and archive inspection stay available.
  for(const type of ['beforeinput','change'])document.addEventListener(type,event=>{if(!writable&&event.target.matches('input,select,textarea')){event.preventDefault();event.stopImmediatePropagation();paint();global.loadState?.();}},true);
  global.addEventListener('pagehide',()=>{release?.();writable=false;});
  global.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  global.addEventListener('beforeunload',event=>{if(failed){event.preventDefault();event.returnValue='';}});
  global.addEventListener('error',event=>{if(event.error?.message==='SILK_READ_ONLY_TAB'){event.preventDefault();paint();}});
  global.addEventListener('storage',event=>{if(event.key==='silk_document_v2'&&!writable&&!failed)global.dispatchEvent(new CustomEvent('silk:cloud-applied'));});
  global.addEventListener('silk:writer-ready',()=>{if(document.readyState!=='loading')global.dispatchEvent(new CustomEvent('silk:cloud-applied'));});
})(window);
