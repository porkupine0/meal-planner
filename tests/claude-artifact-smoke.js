// Stub of the claude.ai artifact database: doc.set/delete/onSnapshot and collection.orderBy().limit().onSnapshot, no field-level writes.
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const c=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await c.route(/firebase|gstatic|googleapis|anthropic/,r=>r.abort());
await c.addInitScript(()=>{ const store=JSON.parse(localStorage.getItem('__stub')||'{}'); const ls=[]; const save=()=>localStorage.setItem('__stub',JSON.stringify(store));
 const fire=()=>ls.forEach(f=>f());
 const dsnap=p=>({exists:p in store,id:p.split('/').pop(),data:()=>JSON.parse(JSON.stringify(store[p]))});
 const db={doc:p=>({set:async d=>{store[p]=JSON.parse(JSON.stringify(d));save();setTimeout(fire,0)},delete:async()=>{delete store[p];save();setTimeout(fire,0)},onSnapshot:(cb)=>{const f=()=>cb(dsnap(p));ls.push(f);setTimeout(f,0)}}),
  collection:n=>{const q={orderBy:()=>q,limit:()=>q,onSnapshot:(cb)=>{const f=()=>cb({docs:Object.keys(store).filter(k=>k.startsWith(n+'/')).map(dsnap)});ls.push(f);setTimeout(f,0)}};return q}};
 window.claude={use:async k=>k==='db'?db:null};});
const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8800/?debug&nosw');await p.waitForSelector('.tab');await p.waitForTimeout(800);
console.log('mode',await p.evaluate(()=>__T.S.mode),'fresh',await p.evaluate(()=>!!__T.S.weeksFresh));
await p.click('[data-act="generate"]');await p.waitForTimeout(600);
console.log('planned',await p.evaluate(()=>Object.values(__T.getWeek(__T.curStart()).days).filter(d=>d.rid).length));
await p.$eval('.tab[data-view="grocery"]',e=>e.click());await p.waitForTimeout(300);const ck=await p.$('input.check');await ck.click();await p.waitForTimeout(900);
const before=await p.evaluate(()=>Object.keys(__T.getWeek(__T.curStart()).checked||{}).length);
await p.reload();await p.waitForSelector('.tab');await p.waitForTimeout(1200);
console.log('checked before/after reload',before,await p.evaluate(()=>Object.keys(__T.getWeek(__T.curStart()).checked||{}).length),'planned after reload',await p.evaluate(()=>Object.values(__T.getWeek(__T.curStart()).days).filter(d=>d.rid).length));
await p.$eval('.tab[data-view="settings"]',e=>e.click());await p.waitForTimeout(300);
console.log('errors',errs);await b.close()})();
