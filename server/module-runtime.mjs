import {createModuleClient} from './module-client.mjs';
let cached;
export function personalAccess(env=process.env){
 if(env.MODULE_SSO_ENABLED!=='true')return null;
 if(!cached)cached=createModuleClient({module:'tips',clientId:'ambassador-tips',clientSecret:env.MODULE_SSO_CLIENT_SECRET,issuer:env.MODULE_SSO_ISSUER,origin:env.MODULE_SSO_ORIGIN});
 return cached;
}
export function unavailable(){return new Response(JSON.stringify({error:'not_found'}),{status:404,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});}
export function webRequest(req,body){const origin='https://'+req.headers.host,headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);return new Request(origin+req.url,{method:req.method,headers,body:!['GET','HEAD'].includes(req.method)?body:undefined});}
export async function send(res,response){res.statusCode=response.status;for(const[k,v]of response.headers)if(k!=='set-cookie')res.setHeader(k,v);const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);res.end(Buffer.from(await response.arrayBuffer()));}
export async function requestBody(req,maximum=4096){let body=req.body;if(body!==undefined)body=typeof body==='string'?body:JSON.stringify(body);else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>maximum)throw Error('SIZE');chunks.push(chunk);}body=Buffer.concat(chunks).toString();}if(Buffer.byteLength(body)>maximum)throw Error('SIZE');return body;}
