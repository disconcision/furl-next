const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'furl-navigation-'));
const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch({channel:'chrome',headless:true});
const p=await b.newPage({viewport:{width:1280,height:900},colorScheme:'dark'});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
const settle=()=>p.waitForTimeout(200);
await p.goto(process.env.TEST_URL||'http://127.0.0.1:8766/furl.html');await p.waitForTimeout(500);
await p.getByRole('combobox',{name:'Example'}).selectOption('3');await p.waitForSelector('.furl-match');await settle();
assert.equal(await p.locator('.furl-context').count(),0);
assert.equal(await p.locator('.furl-call-arrow').count(),0);
const param=p.locator('.furl-parameter');
const paramValue=param.locator('.furl-value-text');
assert.equal(await paramValue.innerText(),'[2, 4, 6]');
await param.locator('.code-editor').click();await settle();
const focusBefore=await p.evaluate(()=>document.activeElement.closest('[data-row]')?.dataset.row);
const geometry=()=>p.locator('.furl-row').evaluateAll(es=>es.map(e=>({id:e.dataset.row,y:e.getBoundingClientRect().top,h:e.getBoundingClientRect().height,columns:[...e.children].filter(x=>['furl-pattern','furl-expression','furl-value'].includes(x.className)).map(x=>x.getBoundingClientRect().left)})));
const before=await geometry();
await paramValue.click();await settle();
assert.equal(await p.locator('.furl-call-arrow').count(),2);
assert.deepEqual(await geometry(),before);
assert.equal(await p.locator('#caret').count(),0);
assert.equal(await paramValue.getAttribute('aria-pressed'),'true');
await p.getByRole('button',{name:'Next function call',exact:true}).click();await settle();
assert.equal(await paramValue.innerText(),'[4, 6]');
await p.keyboard.press('ArrowRight');await settle();
assert.equal(await paramValue.innerText(),'[6]');
await p.keyboard.press('ArrowRight');await settle();assert.equal(await paramValue.innerText(),'[]');
assert.equal(await p.getByRole('button',{name:'Next function call',exact:true}).isDisabled(),true);
await paramValue.click();await p.keyboard.press('ArrowLeft');await settle();assert.equal(await paramValue.innerText(),'[6]');
await p.keyboard.press('Escape');await settle();
assert.equal(await p.locator('.furl-call-arrow').count(),0);
assert.equal(await p.evaluate(()=>document.activeElement.closest('[data-row]')?.dataset.row),focusBefore);
assert.deepEqual(await geometry(),before);
assert.equal((await p.locator('.furl-row').last().locator('.furl-value').innerText()).trim(),'12');
// Any executed body value uses its enclosing function, including a value that
// becomes blank in the base invocation. Navigation remains available there.
const bodyValue=p.locator('.furl-branch').nth(1).locator('.furl-value-text').last();
await bodyValue.click();await settle();await p.getByRole('button',{name:'Next function call',exact:true}).click();await settle();
assert.equal(await bodyValue.innerText(),'');assert.equal(await p.locator('.furl-call-arrow').count(),2);
await p.getByRole('button',{name:'Previous function call',exact:true}).click();await settle();assert.equal(await bodyValue.innerText(),'6');
await p.screenshot({path:path.join(output,'live-dark.png'),fullPage:true});
await p.emulateMedia({colorScheme:'light'});await p.screenshot({path:path.join(output,'live-light.png'),fullPage:true});
// No hidden selected value returns when hiding/showing the value column.
await p.getByRole('button',{name:'Values',exact:true}).click();await settle();await p.getByRole('button',{name:'Values',exact:true}).click();await settle();assert.equal(await p.locator('.furl-call-arrow').count(),0);
// Removing the call/branch rows places the match directly below parameters.
const junction=await p.locator('.furl-function').evaluate(e=>({bottom:e.querySelector('.furl-parameters').getBoundingClientRect().bottom,top:e.querySelector('.furl-match').getBoundingClientRect().top,fork:e.querySelector('[data-part=fork]').getBoundingClientRect().top,stem:e.querySelector('.furl-case-comb [data-part=stem]').getBoundingClientRect().top}));
assert.ok(Math.abs(junction.bottom-junction.top)<.1);assert.ok(Math.abs(junction.fork-junction.top)<.1);assert.ok(Math.abs(junction.stem-junction.top)<.1);
await p.getByRole('button',{name:'Show one match branch at a time'}).click();await settle();
let branch=await p.locator('.furl-branch').getAttribute('data-branch');
const stem=()=>p.getByRole('button',{name:'Next match branch (Shift-click for previous)',exact:true});
await stem().click();await settle();assert.notEqual(await p.locator('.furl-branch').getAttribute('data-branch'),branch);
await stem().click({modifiers:['Shift']});await settle();assert.equal(await p.locator('.furl-branch').getAttribute('data-branch'),branch);
await p.locator('.furl-branch > [data-row^="branch-"] .furl-expression .code-editor').click();await settle();await p.keyboard.press('Control+Alt+ArrowRight');await settle();assert.notEqual(await p.locator('.furl-branch').getAttribute('data-branch'),branch);
await p.getByRole('button',{name:'Unfurl match comb to Hazel code',exact:true}).click();await settle();assert.equal(await p.locator('.furl-match').count(),0);
await p.getByRole('button',{name:'Furl all lets, functions, and matches'}).click();await settle();assert.equal(await p.locator('.furl-match').count(),1);
// Small screen: inspectors scroll with the grid and add no document overflow.
await p.setViewportSize({width:390,height:844});await paramValue.click();await settle();assert.equal(await p.locator('.furl-call-arrow').count(),2);
assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await p.setViewportSize({width:1280,height:900});
await p.getByRole('button',{name:'Show all match branches as columns'}).click();await settle();
// Long samples leave room for both arrows before the neighboring comb stack.
const finalExpression=p.locator('.furl-row').last().locator('.code-editor');
async function paste(editor,text){await editor.click();await settle();await p.keyboard.press('Meta+a');await settle();await p.evaluate(text=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:()=>Promise.resolve(text)}}),text);await p.keyboard.press('Meta+v');await settle();}
await paste(finalExpression,'sum([10, 20, 30])');
await paramValue.click();await settle();await p.keyboard.press('ArrowLeft');await settle();await p.keyboard.press('ArrowLeft');await settle();assert.equal(await paramValue.innerText(),'[10, 20, 30]');
const longValue=p.locator('.furl-branch').nth(1).locator('.furl-value-text').first();await longValue.click();await settle();
let bounds=await p.locator('.furl-value-inspector[data-selected=true]').evaluate(e=>({cell:e.closest('.furl-value').getBoundingClientRect().toJSON(),prev:e.querySelector('.previous').getBoundingClientRect().toJSON(),next:e.querySelector('.next').getBoundingClientRect().toJSON()}));
assert.ok(bounds.prev.right<bounds.cell.left);assert.ok(bounds.next.right<=bounds.cell.right);
// The nearest enclosing function owns each inspector, even in nested closures.
await p.locator('.furl-scope > .furl-comb[data-comb-kind="let block"]').first().click();await settle();
await paste(p.locator('#active-code-editor'),'let outer = fun x -> let twice = fun y -> y * 2 in twice(x) + twice(x + 1) in outer(1) + outer(2)');
await p.getByRole('button',{name:'Furl all lets, functions, and matches'}).click();await settle();
const params=p.locator('.furl-parameter .furl-value-text');assert.equal(await params.count(),2);
assert.deepEqual(await params.allInnerTexts(),['1','1']);await params.nth(1).click();await settle();await p.getByRole('button',{name:'Next function call',exact:true}).click();await settle();assert.deepEqual(await params.allInnerTexts(),['1','2']);
await params.nth(0).click();await settle();await p.getByRole('button',{name:'Next function call',exact:true}).click();await settle();assert.deepEqual(await params.allInnerTexts(),['2','3']);assert.equal(await p.locator('.furl-row').last().locator('.furl-value').innerText(),'16');
assert.deepEqual(errors,[]);console.log('PASS live: selected value call navigation, keyboard/escape focus, blank samples, stable geometry, no extra rows, joined parameter/match, stem cycling, branch shortcut, source round trip, mobile.');
console.log('Screenshots:',output);await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
