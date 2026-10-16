/* SILK V1.4 Variant C: read-only candidate from the unchanged exact engine.
 * No payment, finalization or database-write authorization.
 */
(function(global){
 'use strict';
 function preview(input){
   if(!global.SilkFinance||!global.SilkVariantC)throw new Error('SILK_C_DEPENDENCY_MISSING');
   const exact=global.SilkFinance.calculate(input);
   const c=global.SilkVariantC.allocate(exact);
   if(c.inputCents!==exact.inputCents||c.lines.length!==exact.lines.length)throw new Error('SILK_C_INTEGRITY_MISMATCH');
   return {...exact,...c,candidatePayoutCents:c.payoutCents,exactCalculationVersion:exact.version,version:'silk-whole-chf-c-2',policy:'whole-chf-largest-remainder-half-up',previewOnly:true,canFinalize:false,serverFinalizationRequired:true,finalizationStatus:c.cashReconciliationRequired?'CASH_RECONCILIATION_AND_SQL_PARITY_REQUIRED':'STAGING_SQL_PARITY_REQUIRED'};
 }
 global.SilkVariantCPreview={preview};
})(typeof window==='undefined'?globalThis:window);
