interface SilkShift { name:string; label?:string; f:number; s:number; color?:string }
interface SilkAssignment { name:string; shift:string }
interface SilkDraftInput { staff:string[]; shifts:SilkShift[]; byDate:Record<string,{assignments?:SilkAssignment[]}> }
interface Window {
 SILK_DEFAULT_STAFF?:string[];
 SILK_DEFAULT_SHIFTS?:SilkShift[];
 SilkLocalRepository:{getStaffLabels():Record<string,string>;getStaff(fallback?:string[]):string[];getShifts(fallback?:SilkShift[]):SilkShift[]};
 SilkStorageModels:{uuid():string};
 SilkIdentity:{staffLabel(key:string):string;shiftLabel(key:string):string;resolveStaff(value:string):string;resolveShift(value:string):string;resolveAssignments(assignments:SilkAssignment[]):SilkAssignment[];newKey(kind:string):string;restoreProblem(input:SilkDraftInput|null|undefined,staff:string[],shifts:SilkShift[]):string};
}
