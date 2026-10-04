/* Three-way merge: an unchanged client never overwrites a newer remote value. */
(function (global) {
  'use strict';
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const stable = value => JSON.stringify(value, (_, item) => item && !Array.isArray(item) && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  const equal = (a, b) => stable(a) === stable(b);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function merge(base, local, remote, path = [], conflicts = []) {
    if (equal(local, base)) return { value: clone(remote), conflicts };
    if (equal(remote, base) || equal(local, remote)) return { value: clone(local), conflicts };
    // Periods, checkpoints and saved settlements are indivisible business records.
    const atomic = path[0] === 'period' || path[0] === 'work' || (path[0] === 'settlements' && path.length === 2);
    if (!atomic && object(local) && object(remote) && (object(base) || base === undefined)) {
      const value = {};
      for (const key of new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)])) {
        const next = merge(base?.[key], local[key], remote[key], [...path, key], conflicts).value;
        if (next !== undefined) value[key] = next;
      }
      return { value, conflicts };
    }
    conflicts.push({ path, base: clone(base), local: clone(local), remote: clone(remote) });
    return { value: clone(local), conflicts };
  }
  function choose(value, path, selected) {
    if (!path.length) return clone(selected);
    const result = clone(value); let parent = result;
    for (const key of path.slice(0, -1)) parent = parent[key] ||= {};
    if (selected === undefined) delete parent[path.at(-1)]; else parent[path.at(-1)] = clone(selected);
    return result;
  }
  function protectFinalization(base, value) {
    const downgraded=[];
    for(const [id,item] of Object.entries(value.settlements||{})) {
      if(item.dataFormat!=='final-v2'||base?.settlements?.[id]?.dataFormat==='final-v2')continue;
      const input=item.inputSnapshot,period=value.period;
      const from=period.mode==='day'?period.singleDate:period.periodStart,to=period.mode==='day'?period.singleDate:period.periodEnd;
      const match=input&&input.mode===period.mode&&input.periodStart===from&&input.periodEnd===to&&equal(input.staff,value.staff)&&equal(input.shifts,value.shifts)&&Object.entries(input.byDate).every(([date,d])=>{
        const current=value.days[date]||{};return d.f===(current.f??'')&&d.s===(current.s??'')&&equal(Object.fromEntries((d.assignments||[]).filter(a=>a.shift).map(a=>[a.name,a.shift])),current.assignments||{});
      });
      if(match)continue;
      item.dataFormat='draft-v2';delete item.finalizedAt;delete item.resultData;delete item.html;
      if(String(value.work?.activeId)===id)value.work={...value.work,calculation:null};
      downgraded.push(id);
    }
    return downgraded;
  }
  global.SilkSyncMerge = { clone, stable, equal, merge, choose, protectFinalization };
})(typeof window === 'undefined' ? globalThis : window);
