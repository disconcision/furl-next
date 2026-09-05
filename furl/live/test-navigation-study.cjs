const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'furl-navigation-'));
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:1280,height:1000},colorScheme:'dark',reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 // file:// plus blocked network proves this artifact is actually self-contained.
 await p.route(/^https?:/,r=>r.abort());
 await p.goto(require('node:url').pathToFileURL(path.resolve(__dirname,'../../src/web/www/navigation.html')).href);
 const cycle=p.locator('[data-concept=cycle]'),arrows=p.locator('[data-concept=arrows]'),chooser=p.locator('[data-concept=chooser]');
 const index=c=>c.locator('.branch').getAttribute('data-branch');
 const rows=c=>c.locator('.row').evaluateAll(es=>es.map(e=>({top:e.getBoundingClientRect().top,h:e.getBoundingClientRect().height,columns:[...e.children].map(x=>x.getBoundingClientRect().left)})));
 assert.equal(await index(cycle),'2');let before=await rows(cycle);
 await cycle.locator('.comb').click();assert.equal(await index(cycle),'0');assert.deepEqual(await rows(cycle),before);
 await p.keyboard.press('ArrowRight');assert.equal(await index(cycle),'1');await cycle.locator('.comb').click({modifiers:['Shift']});assert.equal(await index(cycle),'0');
 before=await rows(arrows);await arrows.locator('.comb').click();assert.equal(await arrows.locator('.stem-arrows button').count(),2);assert.deepEqual(await rows(arrows),before);await arrows.getByRole('button',{name:'Next branch',exact:true}).click();assert.equal(await index(arrows),'0');await p.keyboard.press('Escape');assert.equal(await arrows.locator('.stem-arrows').count(),0);
 before=await rows(chooser);await chooser.locator('.fork').click();assert.equal(await chooser.locator('.chooser').count(),1);assert.deepEqual(await rows(chooser),before);await p.keyboard.press('ArrowUp');await p.keyboard.press('Enter');assert.equal(await index(chooser),'1');assert.equal(await chooser.locator('.chooser').count(),0);
 await chooser.locator('.fork').click();await p.screenshot({path:path.join(output,'study-dark.png'),fullPage:true});await p.keyboard.press('Escape');assert.equal(await chooser.locator('.chooser').count(),0);
 await p.emulateMedia({colorScheme:'light'});await arrows.locator('.comb').click();await p.screenshot({path:path.join(output,'study-light.png'),fullPage:true});
 await p.getByRole('button',{name:'Show all columns',exact:true}).click();for(const c of [cycle,arrows,chooser])assert.equal(await c.locator('.branch').count(),3);
 // All-column bridge joins the final curved branch rather than stopping early.
 const bridge=await cycle.locator('.fork line').evaluate(e=>e.getBoundingClientRect().toJSON());const cap=await cycle.locator('.branch').last().locator('.comb path').evaluate(e=>e.getBoundingClientRect().toJSON());assert.ok(Math.abs(bridge.right-cap.left)<.2);
 await p.getByRole('button',{name:'Reset comparison',exact:true}).click();await cycle.getByRole('button',{name:'Show source',exact:true}).click();assert.match(await cycle.locator('pre').innerText(),/case xs/);await cycle.getByRole('button',{name:'Return to projection',exact:true}).click();assert.equal(await index(cycle),'2');
 await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await arrows.locator('.comb').click();await arrows.getByRole('button',{name:'Next branch',exact:true}).click();assert.equal(await index(arrows),'0');
 assert.deepEqual(errors,[]);console.log('PASS study: all 3 concepts, pointer and keyboard, source view, all columns, comb joins, stable row grid, mobile and offline without network.');console.log('Screenshots:',output);await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
