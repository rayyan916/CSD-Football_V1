/** Optional HTTP relay. No dependencies. Run: node server.mjs
 * Deploy behind HTTPS on a Node host, or use on a trusted local network.
 * Rooms are deliberately ephemeral and expire after 2 minutes of inactivity.
 */
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
export function makeServer(){
const rooms=new Map(),sessions=new Map();
function erase(room){rooms.delete(room.code);for(let s of room.slots)if(s)sessions.delete(s.token)}
const timer=setInterval(()=>{for(let r of rooms.values())if(Date.now()-r.updated>120000)erase(r)},30000);timer.unref();
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(data))};
 if(req.method==='OPTIONS'){reply(200,{});return}
 if(url.pathname==='/api/health'){reply(200,{relay:'civic-football-v1'});return}
 if(url.pathname.startsWith('/api/')){
  try{
   let body={};if(req.method==='POST'){let chunks=[],len=0;for await(let b of req){len+=b.length;if(len>32000){reply(413,{error:'訊息太大'});return}chunks.push(b)}body=JSON.parse(Buffer.concat(chunks).toString()||'{}')}
   if(url.pathname==='/api/create'&&req.method==='POST'){
    if(rooms.size>=100){reply(503,{error:'房間已滿，請稍後再試'});return}
    let code;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(code));
    let token=randomUUID(),s={token,queue:[],last:Date.now()},r={code,updated:Date.now(),slots:[s,null]};s.room=r;s.slot=0;rooms.set(code,r);sessions.set(token,s);reply(200,{code,token});return
   }
   if(url.pathname==='/api/join'&&req.method==='POST'){
    let r=rooms.get(String(body.code).toUpperCase());if(!r){reply(404,{error:'找不到比賽編號'});return}if(r.slots[1]){reply(409,{error:'這場比賽已有兩名玩家'});return}
    let token=randomUUID(),s={token,queue:[],last:Date.now(),room:r,slot:1};r.slots[1]=s;r.updated=Date.now();sessions.set(token,s);r.slots[0].queue.push({type:'__connected'});reply(200,{token});return
   }
   let token=(req.headers.authorization||'').replace(/^Bearer /,''),s=sessions.get(token);if(!s){reply(401,{error:'房間已失效，請重新連線'});return}
   s.last=Date.now();s.room.updated=Date.now();let other=s.room.slots[1-s.slot];
   if(url.pathname==='/api/poll'&&req.method==='GET'){let q=s.queue.splice(0,40);reply(200,{messages:q});return}
   if(url.pathname==='/api/send'&&req.method==='POST'){
    let msg=body.message;if(!msg||typeof msg.type!=='string'){reply(400,{error:'無效訊息'});return}
    if(other){if(msg.type==='state'||msg.type==='input')other.queue=other.queue.filter(x=>x.type!==msg.type);if(other.queue.length<40)other.queue.push(msg)}reply(200,{ok:true});return
   }
   if(url.pathname==='/api/leave'&&req.method==='POST'){if(other)other.queue.push({type:'leave'});erase(s.room);reply(200,{ok:true});return}
   reply(404,{error:'找不到此操作'});return
  }catch{reply(400,{error:'無效請求'});return}
 }
 if(req.method!=='GET'){res.writeHead(405);res.end();return}
 try{if(url.pathname==='/'||url.pathname==='/index.html'){let b=await readFile(root+'index.html');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(b)}else{res.writeHead(404);res.end('Not found')}}catch{res.writeHead(500);res.end('Game file missing')}
});server.on('close',()=>clearInterval(timer));return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const argPort=process.argv.indexOf('--port'),port=argPort>=0?Number(process.argv[argPort+1]):Number(process.env.PORT||3000);
 makeServer().listen(port,'0.0.0.0',()=>console.log('Civic Football ready on port '+port));
}
