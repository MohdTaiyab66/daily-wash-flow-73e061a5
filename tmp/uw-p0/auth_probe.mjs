const targets=await fetch('http://127.0.0.1:9222/json/list').then(r=>r.json());
const t=targets.find(x=>x.url.includes('/app/service/'));
let id=0,pending=new Map();const ws=new WebSocket(t.webSocketDebuggerUrl);
function send(method,params={}){const mid=++id;ws.send(JSON.stringify({id:mid,method,params}));return new Promise((res,rej)=>pending.set(mid,{res,rej}));}
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(m.error):p.res(m.result)} };
await new Promise((res,rej)=>{ws.onopen=res; ws.onerror=rej});
const expr=`(async()=>{
 const k=Object.keys(localStorage).find(k=>k.includes('auth-token'));
 const raw=localStorage.getItem(k);
 let parsed; try{parsed=JSON.parse(raw)}catch(e){parsed={parseError:String(e), raw}}
 const m=await import('/src/integrations/supabase/client.ts');
 const s=await m.supabase.auth.getSession();
 const u=await m.supabase.auth.getUser();
 return {k, parsedKeys:Object.keys(parsed||{}), parsed, sessionError:s.error?.message, sessionUser:s.data?.session?.user?.id, userError:u.error?.message, user:u.data?.user?.id, body:document.body.innerText.slice(0,300)};
})()`;
const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
console.log(JSON.stringify(r.result.value,null,2));
ws.close();
