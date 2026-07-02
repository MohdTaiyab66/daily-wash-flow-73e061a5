const targets=await fetch('http://127.0.0.1:9222/json/list').then(r=>r.json());
const t=targets.find(x=>x.url.includes('/app/service/1d33491d')) || targets.find(x=>x.url.includes('/app/service/'));
console.log({url:t?.url,id:t?.id,title:t?.title});
let id=0,pending=new Map();const ws=new WebSocket(t.webSocketDebuggerUrl);
function send(method,params={}){const mid=++id;ws.send(JSON.stringify({id:mid,method,params}));return new Promise((res,rej)=>pending.set(mid,{res,rej}));}
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(m.error):p.res(m.result)} else if(['Runtime.exceptionThrown','Runtime.consoleAPICalled','Log.entryAdded'].includes(m.method)){ if(JSON.stringify(m).includes('error')||JSON.stringify(m).includes('Error')) console.log('EV', JSON.stringify(m).slice(0,2000)); }};
await new Promise((res,rej)=>{ws.onopen=res; ws.onerror=rej});
await send('Runtime.enable'); await send('Log.enable');
const expr=`(async()=>{
 const k=Object.keys(localStorage).find(k=>k.includes('auth-token'));
 let auth={}; try{const m=await import('/src/integrations/supabase/client.ts'); const u=await m.supabase.auth.getUser(); const s=await m.supabase.auth.getSession(); auth={session:s.data?.session?.user?.id,user:u.data?.user?.id,userErr:u.error?.message};}catch(e){auth={err:String(e)}}
 return {ready:document.readyState,url:location.href,title:document.title,text:document.body.innerText,html:document.body.innerHTML.slice(0,3000),auth,ls:k};
})()`;
const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
console.log(JSON.stringify(r.result.value,null,2));
ws.close();
