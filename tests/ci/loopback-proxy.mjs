// Runner-host access to its internal Docker bridge, without giving containers egress.
import net from 'node:net';
import assert from 'node:assert/strict';
assert.equal(process.env.SILK_C2_CI,'synthetic-only');assert.equal(process.env.GITHUB_ACTIONS,'true');
const [api,db]=process.argv.slice(2);for(const host of [api,db])assert.match(host,/^(172\.(1[6-9]|2\d|3[01])|10\.\d+|192\.168)\.\d+\.\d+$/);
for(const [local,host,port] of [[54321,api,8000],[54322,db,5432]]){
 const server=net.createServer(client=>{const upstream=net.connect({host,port});client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());client.on('close',()=>upstream.destroy());upstream.on('close',()=>client.destroy());client.pipe(upstream).pipe(client);});server.listen(local,'127.0.0.1');
}
