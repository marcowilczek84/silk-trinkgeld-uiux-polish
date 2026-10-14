// @ts-check
/* Legacy names/codes are immutable keys. Labels may change; references never do. */
(function (global) {
  'use strict';
  const repo = global.SilkLocalRepository;
  /** @param {string} key */
  const staffLabel = key => {
    const labels = repo.getStaffLabels();
    return Object.prototype.hasOwnProperty.call(labels, key) && typeof labels[key] === 'string' ? labels[key] : key;
  };
  /** @param {string} key */
  const shiftLabel = key => repo.getShifts(global.SILK_DEFAULT_SHIFTS).find(s => s.name === key)?.label || key;

  /** @param {string} value @param {string[]} entries @param {(key:string)=>string} label */
  function resolve(value, entries, label) {
    // A legacy key wins over a display label. Ambiguous labels are never guessed.
    if (entries.includes(value)) return value;
    const matches = entries.filter(key => label(key) === value);
    return matches.length === 1 ? matches[0] : value;
  }

  /** @param {SilkDraftInput|null|undefined} input @param {string[]} staff @param {SilkShift[]} shifts */
  function restoreProblem(input, staff, shifts) {
    if (!input || !input.byDate || !Array.isArray(input.staff) || !Array.isArray(input.shifts)) {
      return 'Dieser ältere Entwurf hat kein vollständiges Eingabeformat. Er bleibt unverändert gespeichert.';
    }
    const source = new Map(input.shifts.map(s => [s.name, s]));
    const current = new Map(shifts.map(s => [s.name, s]));
    for (const day of Object.values(input.byDate)) {
      for (const assignment of day.assignments || []) {
        if (!assignment.shift) continue;
        if (!staff.includes(assignment.name)) {
          return 'Ein zugeordneter Mitarbeiter fehlt in der aktuellen Liste. Der Entwurf bleibt unverändert; bitte die Zuordnung zuerst klären.';
        }
        const before = source.get(assignment.shift), now = current.get(assignment.shift);
        if (!before || !now) {
          return 'Ein zugeordneter Dienst fehlt in der aktuellen Liste. Der Entwurf bleibt unverändert; bitte die Zuordnung zuerst klären.';
        }
        if (Number(before.f) !== Number(now.f) || Number(before.s) !== Number(now.s)) {
          return 'Die Gewichtung eines zugeordneten Dienstes wurde inzwischen geändert. Der Entwurf bleibt unverändert und wird nicht mit anderen Anteilen geladen.';
        }
      }
    }
    return '';
  }

  const resolveStaff = /** @param {string} value */ value => resolve(value, repo.getStaff(global.SILK_DEFAULT_STAFF), staffLabel);
  const resolveShift = /** @param {string} value */ value => resolve(value, repo.getShifts(global.SILK_DEFAULT_SHIFTS).map(s => s.name), shiftLabel);
  /** @param {SilkAssignment[]} assignments */
  function resolveAssignments(assignments) {
    const seen = new Set();
    return assignments.map(a => {
      const name = resolveStaff(a.name), shift = resolveShift(a.shift);
      if (seen.has(name)) throw new Error('Ein Mitarbeiter wurde über Name und Kennung mehrfach zugeordnet. Bitte den Import prüfen.');
      seen.add(name);
      return {name, shift};
    });
  }

  global.SilkIdentity = {
    staffLabel, shiftLabel, restoreProblem,
    newKey: /** @param {string} kind */ kind => kind + '-' + global.SilkStorageModels.uuid(),
    resolveStaff, resolveShift, resolveAssignments
  };
})(window);
