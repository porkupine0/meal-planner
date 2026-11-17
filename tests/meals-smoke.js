const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const c=await b.newContext({viewport:{width:375,height:667},deviceScaleFactor:2,hasTouch:true,isMobile:true});await c.route(/firebase|gstatic|googleapis|anthropic/,r=>r.abort());const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8800/?debug&nosw');await p.waitForSelector('.tab');await p.waitForTimeout(400);
await p.click('[data-act="generate"]');await p.waitForTimeout(500);
const out={};
const snap=()=>p.evaluate(()=>{const T=__T;const m=T.groceryModel();return {html:document.querySelector('#app, main, body').innerText.length,total:m.total,url:T.walmartModel(m).url,days:Object.values(T.getWeek(T.curStart()).days).filter(d=>d.rid).length}});
const base=await snap();
// 1. switches off: no meal rows, even if data exists
await p.evaluate(()=>{const T=__T,w=T.getWeek(T.curStart());const ks=Object.keys(w.days).sort();w.days[ks[4]].b={t:'pancakes'};w.days[ks[4]].l={r:T.S.recipes.find(r=>r.k==='main'&&(r.c||[]).includes('S')).id};T.render()});await p.waitForTimeout(300);
out.offRows=await p.$$eval('.meal-lines',a=>a.length);const off=await snap();out.offSame=(off.total===base.total&&off.url===base.url);
// 2. switch on in settings via the checkbox
await p.$eval('.tab[data-view="settings"]',e=>e.click());await p.waitForTimeout(300);
await p.$eval('[data-meal-slot="b"]',e=>e.click());await p.$eval('[data-meal-slot="l"]',e=>e.click());await p.waitForTimeout(300);
out.settings=await p.evaluate(()=>[__T.S.settings.mealB,__T.S.settings.mealL]);
await p.$eval('.tab[data-view="plan"]',e=>e.click());await p.waitForTimeout(300);
out.onRows=await p.$$eval('.meal-lines',a=>a.length);
const on=await snap();out.textBreakfastNoChange=(on.total===base.total+ (on.total-base.total)); 
out.recipeLunchAdds=on.total-base.total; out.noRecipePanel=await p.evaluate(()=>__T.groceryModel().noRecipe.map(x=>x.label+': '+x.text));
// 3. add via UI: breakfast text on another day
await p.evaluate(()=>{const el=[...document.querySelectorAll('[data-act="meal"][data-slot="b"]')][0];el&&el.scrollIntoView({block:'center'})});await p.waitForTimeout(200);
const addBtn=await p.$('[data-act="meal"][data-slot="b"]');if(addBtn){await addBtn.click();await p.waitForTimeout(300);
 out.pickerHasOnlyCat=await p.$('[data-act="onlycat"]')!==null;out.pickerHasClaude=await p.$('[data-act="aiopen"]')!==null;
 await p.fill('#meal-text','Waffles');await p.click('[data-act="mealtext"]:not([data-text])');await p.waitForTimeout(400);}
out.waffles=await p.evaluate(()=>Object.values(__T.getWeek(__T.curStart()).days).filter(d=>d.b&&d.b.t==='Waffles').length);
await p.screenshot({path:'meals-day.png'});
// 4. clear keeps slots
const ks=await p.evaluate(()=>Object.keys(__T.getWeek(__T.curStart()).days).sort()[4]);
await p.evaluate(k=>{const b=document.querySelector(`[data-act="clear"][data-day="${k}"]`);b&&b.click()},ks);await p.waitForTimeout(400);
out.clearKept=await p.evaluate(k=>{const d=__T.getWeek(__T.curStart()).days[k];return [!!d.b,!!d.l,d.rid]},ks);
// 5. menu text
out.menu=await p.evaluate(()=>{const f=__T;return typeof f.menuText==='function'?f.menuText().split('\n').slice(0,6):'n/a'});
// 6. switch off hides and drops from list
await p.evaluate(()=>{__T.S.settings.mealB=false;__T.S.settings.mealL=false;__T.render()});await p.waitForTimeout(300);
out.offAgainRows=await p.$$eval('.meal-lines',a=>a.length);const off2=await snap();out.offAgainTotalBack=off2.total<=base.total;
console.log(JSON.stringify(out,null,1));console.log(errs);await b.close()})();
