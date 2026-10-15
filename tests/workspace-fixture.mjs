// Synthetic data only. No production names, sessions or workspace access.
export const fixture = {
  staff:['qa-alex','qa-robin','qa-noa','qa-mika','qa-luca','Emily'],
  staffLabels:{'qa-alex':'Alex Beispiel','qa-robin':'Robin Muster','qa-noa':'Noa Beispiel','qa-mika':'Mika Muster','qa-luca':'Luca Beispiel','Emily':'Pauschale (Test)'},
  shifts:[{name:'qa-early',label:'F1',f:1,s:0,color:'#d9dde2'},{name:'qa-late',label:'SP1',f:0,s:1,color:'#1015e8'},{name:'qa-mid',label:'MD',f:.35,s:.65,color:'#e4e7eb'}],
  settlements:[],work:{activeId:null,checkpoint:null,calculation:null},
  state:{mode:'day',singleDate:'2026-10-01',periodStart:'2026-10-01',periodEnd:'2026-10-01',byDate:{
    '2026-10-01':{f:'312.40',s:'530.30',assignments:[{name:'qa-alex',shift:'qa-early'},{name:'qa-robin',shift:'qa-early'},{name:'qa-noa',shift:'qa-late'},{name:'qa-mika',shift:'qa-late'},{name:'qa-luca',shift:'qa-mid'},{name:'Emily',shift:'qa-mid'}]},
    '2026-10-02':{f:'84.65',s:'205.20',assignments:[{name:'qa-alex',shift:'qa-early'},{name:'qa-noa',shift:'qa-late'}]}
  }}
};
