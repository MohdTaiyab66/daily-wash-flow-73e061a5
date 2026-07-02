const targets=await fetch('http://127.0.0.1:9222/json/list').then(r=>r.json());
const t=targets.find(x=>x.url.includes('/app/service/')) || targets.find(x=>x.url.includes('127.0.0.1:8080'));
let id=0,pending=new Map();const ws=new WebSocket(t.webSocketDebuggerUrl);
function send(method,params={}){const mid=++id;ws.send(JSON.stringify({id:mid,method,params}));return new Promise((res,rej)=>pending.set(mid,{res,rej}));}
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(m.error):p.res(m.result)} else {
 if(['Runtime.consoleAPICalled','Runtime.exceptionThrown','Log.entryAdded','Page.javascriptDialogOpening','Network.loadingFailed','Network.responseReceived'].includes(m.method)) {
  if(m.method==='Network.responseReceived' && !String(m.params.response.url).includes('@id') && !String(m.params.response.url).includes('src/')) return;
  console.log(JSON.stringify(m));
 }
}};
await new Promise((res,rej)=>{ws.onopen=res; ws.onerror=rej});
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable');
await send('Page.reload',{ignoreCache:true});
await new Promise(r=>setTimeout(r,5000));
const r=await send('Runtime.evaluate',{expression:`({url:location.href,text:document.body.innerText,html:document.body.innerHTML.slice(0,1000)})`,returnByValue:true});
console.log('DOM', JSON.stringify(r.result.value,null,2));
ws.close();
