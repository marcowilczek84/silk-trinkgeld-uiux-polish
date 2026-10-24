import {personalAccess,unavailable,webRequest,requestBody,send} from '../server/module-runtime.mjs';
import {relayData} from '../server/data-relay.mjs';
export default async function handler(req,res){
 try{const client=personalAccess();if(!client)return send(res,unavailable());const body=await requestBody(req,3000000);return send(res,await relayData({client,request:webRequest(req,body),module:'tips',publishableKey:process.env.MODULE_SSO_SUPABASE_PUBLISHABLE_KEY}));}
 catch{return send(res,Response.json({error:'data_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}}));}
}
