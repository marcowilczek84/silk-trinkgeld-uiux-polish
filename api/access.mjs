import {personalAccess,unavailable,webRequest,requestBody,send} from '../server/module-runtime.mjs';
export default async function handler(req,res){
 try{const client=personalAccess();if(!client)return send(res,unavailable());const body=await requestBody(req);return send(res,await client.handle(webRequest(req,body)));}
 catch{return send(res,Response.json({error:'authority_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}}));}
}
