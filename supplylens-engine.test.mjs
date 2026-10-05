import assert from 'node:assert/strict';
import {mean,stdev,croston,backtest,safetyStock,applyABC,xyzClass,analyseItem,analysePortfolio,dataQuality} from './supplylens-engine.mjs';
assert.equal(mean([2,4,6]),4);
assert.equal(Math.round(stdev([1,2,3])*100)/100,1);
assert.ok(croston([0,0,5,0,0,0,7,0],3).every(x=>x>0));
const bt=backtest([4,5,4,6,5,5,7,6,5,6,7,6,8,7]);
assert.ok(bt.length>=4&&bt.every(x=>Number.isFinite(x.mae)));
assert.equal(Math.round(safetyStock({dailySigma:2,leadMean:4,leadSigma:0,dailyMean:10,z:1.645})*100)/100,6.58);
const abc=applyABC([{sku:'H',cost:100,demand_history:[10]},{sku:'M',cost:10,demand_history:[10]},{sku:'L',cost:1,demand_history:[10]}]);
assert.equal(abc.find(x=>x.sku==='H').abc,'A');
assert.equal(xyzClass([10,10,10,10]),'X');
const item=analyseItem({sku:'T',name:'Test',on_hand:5,incoming:0,reserved:0,lead_time_days:4,lead_time_sd:0,expiry_90d:0,cost:2,demand_history:[4,5,4,6,5,4,5,6,5,6,5,6,7,6]});
assert.equal(item.status,'critical');assert.ok(item.order>0);assert.ok(item.rop>0);
assert.ok(item.exceptionScore>0);assert.equal(item.rootCause,'Local demand increase');
const upstream=analyseItem({sku:'U',name:'Upstream Test',on_hand:3,incoming:0,reserved:0,lead_time_days:5,expiry_90d:0,cost:2,upstream_available:false,demand_history:[2,2,3,2,3,2,2,3,2,3,2,3]});
assert.equal(upstream.rootCause,'Upstream supply unavailable');assert.match(upstream.recommendedAction,/upstream/i);
assert.ok(upstream.contributingFactors.includes('Local inventory position'));
const conflict=analyseItem({sku:'E',name:'Expiry + shortage',on_hand:10,incoming:0,lead_time_days:5,expiry_90d:4,cost:2,demand_history:[4,5,4,5,4,5,4,5,4,5,4,5]});
assert.equal(conflict.status,'critical');assert.match(conflict.recommendedAction,/manual review/i);assert.ok(conflict.contributingFactors.length>=2);

const short=analyseItem({sku:'S',name:'Short History',on_hand:20,incoming:0,lead_time_days:3,expiry_90d:0,cost:1,demand_history:[5,5,5,5,5,5,5,5]});
assert.equal(short.confidence,'Insufficient');

const base={sku:'V',name:'Valid',on_hand:20,incoming:0,lead_time_days:3,expiry_90d:0,cost:1,demand_history:[1,2,1,2,1,2,1,2,1]};
assert.throws(()=>analyseItem({...base,on_hand:NaN}),/finite non-negative/);
assert.throws(()=>analyseItem({...base,demand_history:[1,2,-1]}),/Invalid demand/);
assert.throws(()=>analyseItem({...base,expiry_90d:21}),/cannot exceed/);
assert.throws(()=>analyseItem({...base,lead_time_days:0}),/positive/);
assert.throws(()=>analyseItem(base,{z:1.645,review:0}),/review period/);
assert.throws(()=>analyseItem(base,{z:NaN,review:7}),/service factor/);

const quality=dataQuality([{...base,sku:'D'},{...base,sku:'D'}]);
assert.ok(quality.some(x=>x.issue==='Duplicate SKU'));
assert.throws(()=>analysePortfolio([{...base,sku:'D'},{...base,sku:'D'}]),/Duplicate SKU/);
console.log('SupplyLens analytical engine: all tests passed.');
