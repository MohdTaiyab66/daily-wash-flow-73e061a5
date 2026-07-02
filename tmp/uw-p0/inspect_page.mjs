const targets=await fetch('http://127.0.0.1:9222/json/list').then(r=>r.json());
const t=targets.find(x=>x.url.includes('/app/service/')) || targets.find(x=>x.url.includes('127.0.0.1:8080'));
console.log(t);
let id=0,pending=new Map();const ws=new WebSocket(t.webSocketDebuggerUrl);const events=[];
function send(method,params={}){const mid=++id;ws.send(JSON.stringify({id:mid,method,params}));return new Promise((res,rej)=>pending.set(mid,{res,rej}));}
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(m.error):p.res(m.result)} else {events.push(m); if(['Runtime.exceptionThrown','Log.entryAdded','Console.messageAdded'].includes(m.method)) console.log('EVENT',JSON.stringify(m)); }};
await new Promise((res,rej)=>{ws.onopen=res; ws.onerror=rej});
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
const expr=`({url:location.href,title:document.title,text:document.body.innerText,html:document.body.innerHTML.slice(0,2000),ls:Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)?.slice(0,100)]),root:document.getElementById('root')?.innerHTML.slice(0,1000)})`;
const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true});
console.log(JSON.stringify(r.result.value,null,2));
ws.close();
