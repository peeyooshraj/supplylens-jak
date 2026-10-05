import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {analyseItem} from './supplylens-engine.mjs';

const html=fs.readFileSync(new URL('./supplylens-jak.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Embedded application script not found');

function extractFunction(name){
  const line=script.split('\n').find(x=>x.startsWith('function '+name+'('));
  assert.ok(line,'Function '+name+' not found');
  return line;
}

const context={};vm.createContext(context);
for(const name of ['esc','csvEsc','parseCSV','importInventory','exceptionFingerprint'])vm.runInContext(extractFunction(name),context);

assert.equal(context.esc('<img src=x onerror=alert(1)>'),'&lt;img src=x onerror=alert(1)&gt;');
assert.equal(context.csvEsc('=HYPERLINK("https://example.invalid")'),'"\'=HYPERLINK(""https://example.invalid"")"');
assert.throws(()=>context.parseCSV('a,b\n"unclosed,2'),/unclosed quoted field/i);

const head=['sku','name','on_hand','incoming','lead_time_days','expiry_90d','cost','demand_history'];
const good=[['SKU1','<b>Medicine</b>','10','0','3','0','2','1|2|1|2|1|2|1|2|1']];
const parsed=context.importInventory(good,head);
assert.equal(parsed.length,1);assert.equal(parsed[0].on_hand,10);assert.equal(parsed[0].upstream_available,true);
assert.throws(()=>context.importInventory([['SKU1','A','NaN','0','3','0','2','1|2'],['SKU2','B','10','0','3','0','2','1|2']],head),/on_hand/i);
assert.throws(()=>context.importInventory([['SKU1','A','10','0','3','0','2','1|oops']],head),/demand_history/i);
assert.throws(()=>context.importInventory([['SKU1','A','10','0','3','11','2','1|2']],head),/cannot exceed/i);
assert.throws(()=>context.importInventory([['SKU1','A','10','0','3','0','2','1|2'],['SKU1','B','10','0','3','0','2','1|2']],head),/duplicate SKU/i);

const exceptionA={sku:'X',on_hand:10,incoming:0,lead_time_days:3,expiry_90d:0,demand_history:[1,2,3],rootCause:'Local inventory position',order:4,recommendedAction:'Order 4 units'};
assert.notEqual(context.exceptionFingerprint(exceptionA),context.exceptionFingerprint({...exceptionA,on_hand:5}),'A changed exception must invalidate an old human decision');

assert.match(html,/id="expiry" disabled/,'Expiry horizon must not pretend to be configurable with only expiry_90d data');
assert.doesNotMatch(html,/\$\{x\.name\}|\+x\.name\+|\$\{x\.sku\}|\+x\.sku\+/,'Imported identifiers must not be injected into HTML without escaping');

// Differential test: the self-contained browser build duplicates the analytical
// formulas, so compare it against the canonical engine until a build step can
// bundle the engine directly into the HTML.
const coreStart=script.indexOf('const avg=');
const coreEnd=script.indexOf('function recalc()');
assert.ok(coreStart>=0&&coreEnd>coreStart,'Browser analytical core not found');
const browserContext={document:{getElementById(id){
  if(id==='service')return{value:'1.645'};
  if(id==='review')return{value:'7'};
  if(id==='expiry')return{value:'90'};
  throw new Error('Unexpected DOM dependency '+id);
}}};
vm.createContext(browserContext);
vm.runInContext(script.slice(coreStart,coreEnd)+'\nglobalThis.browserAnalyse=x=>diagnoseSerious(computeSerious(x));',browserContext);
const parityItems=[
  {sku:'P1',name:'Parity regular',on_hand:12,incoming:0,lead_time_days:5,baseline_lead_time_days:4,expiry_90d:0,cost:3,mandated:true,demand_history:[3,4,3,5,4,5,4,6,5,6,5,7,6,7]},
  {sku:'P2',name:'Parity upstream',on_hand:8,incoming:0,lead_time_days:6,expiry_90d:0,cost:2,upstream_available:false,demand_history:[0,2,0,3,0,0,4,0,2,0,3,0,4,0]},
  {sku:'P3',name:'Parity expiry',on_hand:100,incoming:0,lead_time_days:3,expiry_90d:40,cost:4,demand_history:[2,2,3,2,2,3,2,2,3,2,2,3,2,2]}
];
for(const item of parityItems){
  const engine=analyseItem(item),browser=browserContext.browserAnalyse(item);
  assert.equal(browser.order,engine.order,item.sku+' order drift');
  assert.ok(Math.abs(browser.rop-engine.rop)<1e-9,item.sku+' reorder-point drift');
  assert.equal(browser.status,engine.status,item.sku+' status drift');
  assert.equal(browser.rootCause,engine.rootCause,item.sku+' cause drift');
  assert.equal(browser.exceptionScore,engine.exceptionScore,item.sku+' score drift');
  assert.equal(browser.confidence,engine.confidence,item.sku+' confidence drift');
  assert.deepEqual([...browser.contributingFactors],[...engine.contributingFactors],item.sku+' factor drift');
}

console.log('SupplyLens browser boundary: all contract tests passed.');
