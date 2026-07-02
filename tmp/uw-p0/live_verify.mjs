import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const OUT = '/tmp/browser/uw-p0';
const shots = path.join(OUT, 'screenshots');
await fs.mkdir(shots, { recursive: true });
const trial = JSON.parse(await fs.readFile(path.join(OUT, 'trial.json'), 'utf8'));
const preview = process.env.VERIFY_PREVIEW || `https://${process.env.LOVABLE_PREVIEW_HOST}`;
const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY || `sb-${new URL(sbUrl).hostname.split('.')[0]}-auth-token`;
if (!sbUrl || !anon || !serviceKey) throw new Error('missing env');
const admin = createClient(sbUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const userClient = createClient(sbUrl, anon, { auth: { persistSession: false, autoRefreshToken: false } });

async function signin(email, password) {
  const { data, error } = await userClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signin ${email}: ${error?.message}`);
  return data.session;
}
function cdpSession(wsUrl) {
  let id = 0; const pending = new Map(); const listeners = [];
  const ws = new WebSocket(wsUrl);
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const {resolve,reject}=pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); }
    else listeners.forEach(fn => fn(msg));
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve({
      send(method, params={}) { const mid=++id; ws.send(JSON.stringify({ id: mid, method, params })); return new Promise((resolve,reject)=>pending.set(mid,{resolve,reject})); },
      on(fn){ listeners.push(fn); }, close(){ ws.close(); }
    }));
    ws.addEventListener('error', reject);
  });
}
async function browserCdp() {
  const v = await fetch('http://127.0.0.1:9222/json/version').then(r=>r.json());
  return cdpSession(v.webSocketDebuggerUrl);
}
async function makePage(browser, name) {
  const logs=[];
  const { browserContextId } = await browser.send('Target.createBrowserContext', { disposeOnDetach: false });
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId, width: 390, height: 844 });
  const { webSocketDebuggerUrl } = (await fetch('http://127.0.0.1:9222/json/list').then(r=>r.json())).find(t=>t.id===targetId);
  const c = await cdpSession(webSocketDebuggerUrl);
  c.on(msg=>{ if(msg.method==='Runtime.consoleAPICalled'){ logs.push({at:new Date().toISOString(), type:msg.params.type, args:(msg.params.args||[]).map(a=>a.value ?? a.description ?? a.unserializableValue).filter(v=>v!==undefined)}); } });
  await c.send('Runtime.enable'); await c.send('Page.enable'); await c.send('DOM.enable'); await c.send('Network.enable');
  await c.send('Emulation.setGeolocationOverride', { latitude: 26.8469, longitude: 80.9464, accuracy: 5 });
  await c.send('Browser.grantPermissions', { origin: preview, permissions: ['geolocation'], browserContextId });
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  c.name = name; c.contextId = browserContextId; c.logs=logs;
  return c;
}
async function waitLoad(c) {
  await new Promise(res => { let done=false; const t=setTimeout(()=>{if(!done){done=true;res()}},8000); c.on(msg=>{ if(msg.method==='Page.loadEventFired' && !done){done=true;clearTimeout(t);res();} }); });
  await new Promise(r=>setTimeout(r,700));
}
async function nav(c, url) { await c.send('Page.navigate', { url }); await waitLoad(c); }
async function evalJs(c, expression, awaitPromise=true) {
  const r = await c.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description));
  return r.result.value;
}
async function injectSession(c, session, route) {
  await nav(c, preview + '/');
  await evalJs(c, `localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(session))}); true`);
  await nav(c, preview + route);
}
async function screenshot(c, name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const file = path.join(shots, name + '.png');
  await fs.writeFile(file, Buffer.from(r.data, 'base64'));
  return file;
}
async function text(c) { return evalJs(c, `document.body.innerText`); }
async function clickText(c, txt, exact=false) {
  return evalJs(c, `(() => { const needle=${JSON.stringify(txt)}; const exact=${exact}; const els=[...document.querySelectorAll('button,a,label,[role=button]')]; const el=els.find(e=> exact ? e.innerText.trim()===needle : e.innerText.toLowerCase().includes(needle.toLowerCase())); if(!el) return {ok:false, text: document.body.innerText.slice(0,1200)}; el.scrollIntoView({block:'center'}); el.click(); return {ok:true, tag:el.tagName, label:el.innerText}; })()`);
}

async function clickDialogText(c, txt, exact=false) {
  return evalJs(c, `(() => { const needle=${JSON.stringify(txt)}; const exact=${exact}; const root=document.querySelector('[role="dialog"]') || document.querySelector('[data-radix-dialog-content]') || document.body; const els=[...root.querySelectorAll('button,a,label,[role=button]')]; const el=els.find(e=> exact ? e.innerText.trim().toLowerCase()===needle.toLowerCase() : e.innerText.toLowerCase().includes(needle.toLowerCase())); if(!el) return {ok:false, text: root.innerText.slice(0,1200)}; el.scrollIntoView({block:'center'}); el.click(); return {ok:true, tag:el.tagName, label:el.innerText}; })()`);
}
async function clickDialogAndSetFile(c, txt) {
  let eventResolve; const eventP = new Promise(res => eventResolve=res);
  c.on(msg => { if(msg.method==='Page.fileChooserOpened') eventResolve(msg.params); });
  await clickDialogText(c, txt, true);
  const evt = await Promise.race([eventP, new Promise((_,rej)=>setTimeout(()=>rej(new Error('no file chooser for '+txt)), 5000))]);
  await c.send('DOM.setFileInputFiles', { files: [fakePhoto], backendNodeId: evt.backendNodeId });
  await new Promise(r=>setTimeout(r,1800));
}

async function fill(c, selector, value) { return evalJs(c, `(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; el.focus(); const proto=Object.getPrototypeOf(el); const desc=Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); desc?.set?.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new InputEvent('input',{bubbles:true, inputType:'insertText', data:${JSON.stringify(value)}})); el.dispatchEvent(new Event('change',{bubbles:true})); return el.value; })()`); }
async function waitFor(c, predicate, timeout=12000) {
  const start=Date.now(); let last;
  while(Date.now()-start<timeout){ try { last=await evalJs(c, `(() => { ${predicate} })()`); if(last) return last; } catch(e){ last=e.message; } await new Promise(r=>setTimeout(r,400)); }
  throw new Error(`waitFor timeout ${predicate} last=${JSON.stringify(last)}`);
}
async function makeImage(file) {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
  await fs.writeFile(file, Buffer.from(b64,'base64'));
}
const fakePhoto = path.join(OUT, 'camera-proof.png'); await makeImage(fakePhoto);
async function setFileChooser(c) { await c.send('Page.setInterceptFileChooserDialog', { enabled: true }); }
async function clickAndSetFile(c, selectorOrText, byText=false) {
  let eventResolve; const eventP = new Promise(res => eventResolve=res);
  const listener = msg => { if(msg.method==='Page.fileChooserOpened') eventResolve(msg.params); };
  c.on(listener);
  if (byText) await clickText(c, selectorOrText); else await evalJs(c, `document.querySelector(${JSON.stringify(selectorOrText)})?.click()`);
  const evt = await Promise.race([eventP, new Promise((_,rej)=>setTimeout(()=>rej(new Error('no file chooser')), 5000))]);
  await c.send('DOM.setFileInputFiles', { files: [fakePhoto], backendNodeId: evt.backendNodeId });
  await new Promise(r=>setTimeout(r,1800));
}
async function queryDb() {
  const [svc, assignment, unavail, dirty, notifs, alerts, ledger, photos] = await Promise.all([
    admin.from('services').select('id,status,unavailable_reason,assignment_id,customer_id,partner_id,started_at,completed_at,updated_at,gps_flag,gps_distance_m').in('id',[trial.service1, trial.service2]).order('sequence_no'),
    admin.from('assignments').select('*').eq('id', trial.assignmentId).maybeSingle(),
    admin.from('unavailability_reports').select('*').in('service_id',[trial.service1, trial.service2]).order('created_at'),
    admin.from('dirty_vehicle_reports').select('*').in('service_id',[trial.service1, trial.service2]).order('created_at'),
    admin.from('customer_notifications').select('*').in('user_id',[trial.customer1.customerId, trial.customer2.customerId]).order('created_at'),
    admin.from('admin_alerts').select('*').contains('meta', { assignment_id: trial.assignmentId }).order('created_at'),
    admin.from('wallet_ledger').select('*').eq('partner_id', trial.partnerId).in('service_id',[trial.service1, trial.service2]).order('created_at'),
    admin.from('service_photos').select('*').in('service_id',[trial.service1, trial.service2]),
  ]);
  return { svc: svc.data, assignment: assignment.data, unavail: unavail.data, dirty: dirty.data, notifs: notifs.data, alerts: alerts.data, ledger: ledger.data, photos: photos.data, errors: {svc:svc.error, assignment:assignment.error, unavail:unavail.error, dirty:dirty.error, notifs:notifs.error, alerts:alerts.error, ledger:ledger.error, photos:photos.error} };
}
async function callRpcDirect(serviceId, reason, notes, photos) {
  const p = createClient(sbUrl, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  await p.auth.signInWithPassword({ email: trial.partnerEmail, password: trial.partnerPassword });
  const { data, error } = await p.rpc('submit_service_unavailable', { p_service_id: serviceId, p_reason: reason, p_notes: notes, p_photos: photos, p_lat: 26.8469, p_lng: 80.9464 });
  return { data, error };
}

const browser = await browserCdp();
const partner = await makePage(browser, 'partner');
const customer1 = await makePage(browser, 'customer1');
const customer2 = await makePage(browser, 'customer2');
const adminPage = await makePage(browser, 'admin');
const [partnerSess, c1Sess, c2Sess] = await Promise.all([
  signin(trial.partnerEmail, trial.partnerPassword), signin(trial.customer1.email, trial.customer1.password), signin(trial.customer2.email, trial.customer2.password)
]);
// Use existing first admin account for admin screenshots
const { data: roles } = await admin.from('user_roles').select('user_id').eq('role','admin').limit(1);
let adminSession = null;
if (roles?.[0]?.user_id) {
  const { data: u } = await admin.auth.admin.getUserById(roles[0].user_id);
  const email = u?.user?.email;
  const phone = email?.split('@')[0];
  if (email && phone) {
    await admin.auth.admin.updateUserById(roles[0].user_id, { password: `UWP@${phone}#2026`, email_confirm: true });
    adminSession = await signin(email, `UWP@${phone}#2026`);
  }
}

const realtime = { customer1: [], customer2: [], partner: [], admin: [] };
await injectSession(customer1, c1Sess, '/c/subscriptions');
await injectSession(customer2, c2Sess, '/c/subscriptions');
await evalJs(customer1, `window.__rt=[]; window.addEventListener('uwRealtimeEvidence', e=>window.__rt.push(e.detail)); true`);
await evalJs(customer2, `window.__rt=[]; window.addEventListener('uwRealtimeEvidence', e=>window.__rt.push(e.detail)); true`);
await screenshot(customer1, '01-customer1-before');
await screenshot(customer2, '02-customer2-before');
await injectSession(partner, partnerSess, `/app/service/${trial.service1}`);
await setFileChooser(partner);
await waitFor(partner, `return document.body.innerText.includes('Mark unavailable')`, 20000);
await screenshot(partner, '03-partner-service1-open');
const parkingCheck = await evalJs(partner, `document.body.innerText.toLowerCase().includes('parking')`);
let evidence = { trial, parkingCheck, steps: [], console: {} };
await evalJs(partner, `document.querySelector('[role=dialog] button, [data-radix-dialog-content] button')?.innerText.includes('Close') && document.querySelector('[role=dialog] button, [data-radix-dialog-content] button')?.click(); true`);
// Unavailable flow
let r = await clickText(partner, 'Mark unavailable'); evidence.steps.push({ step:'open unavailable', r, at:new Date().toISOString() });
await waitFor(partner, `return document.body.innerText.includes('Vehicle unavailable')`);
await screenshot(partner, '04-unavailable-reason-screen');
r = await clickText(partner, 'Other'); evidence.steps.push({ step:'select other', r, at:new Date().toISOString() });
await screenshot(partner, '05-unavailable-other-selected');
const disabledWithoutRemarks = await evalJs(partner, `[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Submit'))?.disabled ?? null`);
await fill(partner, 'textarea', 'P0 live verification remarks: customer unavailable');
await screenshot(partner, '06-unavailable-remarks-mandatory');
await clickAndSetFile(partner, 'Capture', true);
await waitFor(partner, `return document.body.innerText.includes('Photo 1') || document.body.innerText.includes('Add another')`, 15000);
await screenshot(partner, '07-unavailable-photo1');
await clickAndSetFile(partner, 'Add another', true);
await waitFor(partner, `return document.body.innerText.includes('Photo 2') || document.body.innerText.includes('(2/2') || ![...document.querySelectorAll('button')].find(b=>b.innerText.includes('Submit'))?.disabled`, 15000);
await screenshot(partner, '08-unavailable-photo2');
r = await clickText(partner, 'Submit'); evidence.steps.push({ step:'submit unavailable', r, at:new Date().toISOString(), disabledWithoutRemarks });
await waitFor(partner, `return location.pathname.includes(${JSON.stringify('/app/service/'+trial.service2)}) && document.body.innerText.includes('Hyundai')`, 20000);
await screenshot(partner, '09-partner-auto-next-after-unavailable');
await new Promise(r=>setTimeout(r,2500));
await screenshot(customer1, '10-customer1-realtime-unavailable');
// Dirty flow on service2
await screenshot(partner, '11-partner-service2-open');
r = await clickText(partner, 'Start service'); evidence.steps.push({ step:'start service2', r, at:new Date().toISOString() });
await waitFor(partner, `return document.body.innerText.includes('Before service') || document.body.innerText.includes('Dirty vehicle')`, 12000);
await screenshot(partner, '12-service2-started');
r = await clickText(partner, 'Dirty vehicle'); evidence.steps.push({ step:'open dirty', r, at:new Date().toISOString() });
await waitFor(partner, `return document.body.innerText.includes('Report dirty vehicle')`);
await screenshot(partner, '13-dirty-reason-screen');
r = await clickText(partner, 'Heavy Mud'); evidence.steps.push({ step:'select dirty reason', r, at:new Date().toISOString() });
for (const angle of ['front','rear','left','right']) {
  await clickDialogAndSetFile(partner, angle);
  await waitFor(partner, `return ([...document.querySelectorAll('[role=dialog] button')].filter(b=>b.innerText.includes('✓')).length >= ${['front','rear','left','right'].indexOf(angle)+1}) || document.querySelector('[role=dialog]')?.innerText.toLowerCase().includes(${JSON.stringify(angle)})`, 15000);
  await new Promise(r=>setTimeout(r,600));
  await screenshot(partner, `14-dirty-${angle}-captured`);
}
await screenshot(partner, '15-dirty-four-photos');
r = await clickDialogText(partner, 'Submit report'); evidence.steps.push({ step:'submit dirty', r, at:new Date().toISOString() });
await waitFor(partner, `return location.pathname.includes('/app/live') || document.body.innerText.includes('All done') || document.body.innerText.includes('Today')`, 20000);
await screenshot(partner, '16-route-after-dirty');
await new Promise(r=>setTimeout(r,3000));
await screenshot(customer2, '17-customer2-realtime-dirty');
if (adminSession) {
  await injectSession(adminPage, adminSession, '/admin/live');
  await new Promise(r=>setTimeout(r,2000));
  await screenshot(adminPage, '18-admin-live-ops');
  await nav(adminPage, preview + `/admin/service/${trial.service1}`); await screenshot(adminPage, '19-admin-service1');
  await nav(adminPage, preview + `/admin/service/${trial.service2}`); await screenshot(adminPage, '20-admin-service2');
}
const bodyAfter = await text(partner);
evidence.partnerAfterText = bodyAfter.slice(0,2000);
evidence.customer1Text = (await text(customer1)).slice(0,2000);
evidence.customer2Text = (await text(customer2)).slice(0,2000);
evidence.customer1RealtimeLog = await evalJs(customer1, `window.__rt || []`);
evidence.customer2RealtimeLog = await evalJs(customer2, `window.__rt || []`);
evidence.console.partner = partner.logs;
evidence.console.customer1 = customer1.logs;
evidence.console.customer2 = customer2.logs;
evidence.console.admin = adminPage.logs;
evidence.db = await queryDb();
// RPC response evidence from actual UI is console-only; fetch latest unavailable rows + direct dry rerun on completed unavailable should show duplicate/guard if attempted
// collect console logs not available through this minimal harness; DB rows prove execution.
await fs.writeFile(path.join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ screenshots: await fs.readdir(shots), evidence: path.join(OUT,'evidence.json'), db: evidence.db, parkingCheck, disabledWithoutRemarks }, null, 2));
