export const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
export const stdev=a=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1))};
export const mae=(a,b)=>mean(a.map((x,i)=>Math.abs(x-b[i])));
export const rmse=(a,b)=>Math.sqrt(mean(a.map((x,i)=>(x-b[i])**2)));
export const wape=(a,b)=>{const d=a.reduce((s,x)=>s+Math.abs(x),0);return d?100*a.reduce((s,x,i)=>s+Math.abs(x-b[i]),0)/d:null};

export function naive(history,h=1){const v=history.at(-1)||0;return Array(h).fill(v)}
export function movingAverage(history,h=1,window=7){const v=mean(history.slice(-window));return Array(h).fill(v)}
export function ses(history,h=1,alpha=.3){if(!history.length)return Array(h).fill(0);let level=history[0];for(let i=1;i<history.length;i++)level=alpha*history[i]+(1-alpha)*level;return Array(h).fill(Math.max(0,level))}
export function croston(history,h=1,alpha=.2){
  if(!history.some(x=>x>0))return Array(h).fill(0);
  let q=history.find(x=>x>0),p=1,last=-1,interval=1;
  history.forEach((x,i)=>{if(x>0){if(last>=0)interval=i-last;q=alpha*x+(1-alpha)*q;p=alpha*interval+(1-alpha)*p;last=i}});
  return Array(h).fill(Math.max(0,q/Math.max(p,.001)));
}

export const modelCatalog=[
  {name:'Naive',predict:(h,n)=>naive(h,n)},
  {name:'Moving average (7)',predict:(h,n)=>movingAverage(h,n,7)},
  ...[.2,.4,.6,.8].map(a=>({name:'SES alpha='+a,predict:(h,n)=>ses(h,n,a)})),
  ...[.1,.2,.3].map(a=>({name:'Croston alpha='+a,predict:(h,n)=>croston(h,n,a)}))
];

export function backtest(history,minTrain=8){
  if(history.length<=minTrain)return [];
  return modelCatalog.map(m=>{
    const actual=[],pred=[];
    for(let t=minTrain;t<history.length;t++){actual.push(history[t]);pred.push(m.predict(history.slice(0,t),1)[0])}
    return{name:m.name,mae:mae(actual,pred),rmse:rmse(actual,pred),wape:wape(actual,pred),n:actual.length};
  }).sort((a,b)=>a.mae-b.mae);
}

export function forecastBest(history,horizon=30){
  const scores=backtest(history);
  const winner=scores[0]?.name||'Moving average (7)';
  const model=modelCatalog.find(x=>x.name===winner)||modelCatalog[1];
  const values=model.predict(history,horizon);
  return{model:winner,daily:values[0]||0,values,scores};
}

export function demandProfile(history){
  const m=mean(history),cv=m?stdev(history)/m:0,nonzero=history.filter(x=>x>0).length;
  const adi=nonzero?history.length/nonzero:Infinity;
  return{mean:m,cv,adi,intermittent:adi>=1.32};
}

export function applyABC(items){
  const valued=items.map(x=>({...x,annualValue:(x.annual_demand??mean(x.demand_history)*365)*(x.cost||0)})).sort((a,b)=>b.annualValue-a.annualValue);
  const total=valued.reduce((s,x)=>s+x.annualValue,0);let cum=0;const cls=new Map;
  valued.forEach(x=>{cum+=x.annualValue;const before=(cum-x.annualValue)/(total||1),share=cum/(total||1);cls.set(x.sku,before<.80?'A':share<=.95?'B':'C')});
  return items.map(x=>({...x,abc:cls.get(x.sku)||'C'}));
}

export function xyzClass(history){const p=demandProfile(history);return p.cv<=.5?'X':p.cv<=1?'Y':'Z'}

export function safetyStock({dailySigma,leadMean,leadSigma=0,dailyMean,z=1.645}){
  return z*Math.sqrt(Math.max(0,leadMean*dailySigma**2+(dailyMean**2)*(leadSigma**2)));
}

function finiteNonnegative(v){return Number.isFinite(v)&&v>=0}

export function itemDataIssues(item,row=1){
  const issues=[],sku=typeof item?.sku==='string'&&item.sku.trim()?item.sku.trim():'—';
  const add=issue=>issues.push({row,sku,issue});
  if(sku==='—')add('Missing SKU');
  if(typeof item?.name!=='string'||!item.name.trim())add('Missing medicine name');
  if(!Array.isArray(item?.demand_history)||!item.demand_history.length)add('No demand history');
  else if(item.demand_history.some(v=>!finiteNonnegative(v)))add('Invalid demand value');
  for(const [key,label] of [['on_hand','On-hand inventory'],['incoming','Incoming inventory'],['expiry_90d','Expiry quantity'],['cost','Cost']]){
    if(!finiteNonnegative(item?.[key]))add(label+' must be a finite non-negative number');
  }
  if(!(Number.isFinite(item?.lead_time_days)&&item.lead_time_days>0))add('Lead time must be a finite positive number');
  if(item?.reserved!==undefined&&!finiteNonnegative(item.reserved))add('Reserved inventory must be a finite non-negative number');
  if(item?.lead_time_sd!==undefined&&!finiteNonnegative(item.lead_time_sd))add('Lead-time deviation must be a finite non-negative number');
  if(item?.baseline_lead_time_days!==undefined&&!(Number.isFinite(item.baseline_lead_time_days)&&item.baseline_lead_time_days>0))add('Baseline lead time must be a finite positive number');
  if(Number.isFinite(item?.expiry_90d)&&Number.isFinite(item?.on_hand)&&item.expiry_90d>item.on_hand)add('Expiry quantity cannot exceed on-hand inventory');
  if(item?.upstream_available!==undefined&&typeof item.upstream_available!=='boolean')add('Upstream availability must be boolean');
  if(item?.mandated!==undefined&&typeof item.mandated!=='boolean')add('Mandated flag must be boolean');
  return issues;
}

export function assertValidItem(item){
  const issues=itemDataIssues(item);
  if(issues.length)throw new TypeError('Invalid inventory item: '+issues.map(x=>x.issue).join('; '));
  return item;
}

export function analyseItem(item,policy={z:1.645,review:7,expiryHorizon:90}){
  assertValidItem(item);
  if(!(Number.isFinite(policy?.z)&&policy.z>0))throw new TypeError('Invalid policy: service factor z must be positive and finite');
  if(!(Number.isFinite(policy?.review)&&policy.review>=1))throw new TypeError('Invalid policy: review period must be at least 1 day');
  const f=forecastBest(item.demand_history,30),prof=demandProfile(item.demand_history);
  const residuals=item.demand_history.slice(1).map((v,i)=>v-item.demand_history[i]);
  const sigma=Math.max(stdev(residuals)/Math.sqrt(2),stdev(item.demand_history)*.5);
  const ss=safetyStock({dailySigma:sigma,leadMean:item.lead_time_days,leadSigma:item.lead_time_sd||0,dailyMean:f.daily,z:policy.z});
  const rop=f.daily*item.lead_time_days+ss;
  const position=item.on_hand+item.incoming-(item.reserved||0),available=Math.max(0,item.on_hand-(item.reserved||0));
  const cover=f.daily?available/f.daily:999,target=f.daily*(item.lead_time_days+policy.review)+ss;
  const order=Math.max(0,Math.ceil(target-position)),expiryQty=item.expiry_90d||0,expiryRatio=item.on_hand?expiryQty/item.on_hand:0;
  let status='healthy';
  if(position<=rop||cover<item.lead_time_days)status='critical';
  else if(position<=rop+f.daily*policy.review||cover<item.lead_time_days+policy.review)status='watch';
  if(status==='healthy'&&(cover>30||expiryRatio>.25))status='excess';
  const annualDemand=f.daily*365,turns=item.on_hand?annualDemand/item.on_hand:0;
  const half=Math.max(3,Math.floor(item.demand_history.length/2));
  const prior=mean(item.demand_history.slice(-half*2,-half)),recent=mean(item.demand_history.slice(-half));
  const demandShift=prior?(recent-prior)/prior:0;
  const leadBaseline=item.baseline_lead_time_days||item.lead_time_days;
  const leadShift=leadBaseline?(item.lead_time_days-leadBaseline)/leadBaseline:0;
  const upstreamAvailable=item.upstream_available!==false;
  const mandateRisk=!!item.mandated&&cover<item.lead_time_days+policy.review;
  const contributingFactors=[];
  if(!upstreamAvailable)contributingFactors.push('Upstream supply unavailable');
  if(expiryRatio>.25)contributingFactors.push('Excess / near-expiry exposure');
  if(leadShift>.2)contributingFactors.push('Replenishment lead-time deterioration');
  if(demandShift>.2)contributingFactors.push('Local demand increase');
  if(status==='critical'||status==='watch')contributingFactors.push('Local inventory position');
  const rootCause=contributingFactors[0]||'No material exception';
  let exceptionScore=0;
  exceptionScore+=status==='critical'?40:status==='watch'?22:0;
  exceptionScore+=Math.min(20,expiryRatio*60);
  exceptionScore+=Math.min(15,Math.abs(demandShift)*35);
  exceptionScore+=Math.min(15,Math.max(0,leadShift)*35);
  exceptionScore+=mandateRisk?10:0;
  exceptionScore+=!upstreamAvailable?18:0;
  exceptionScore=Math.min(100,Math.round(exceptionScore));
  const bestMAE=f.scores[0]?.mae,confidenceRatio=f.daily&&Number.isFinite(bestMAE)?bestMAE/f.daily:Infinity;
  const confidence=!f.scores.length?'Insufficient':confidenceRatio<=.2?'High':confidenceRatio<=.45?'Medium':'Low';
  let recommendedAction=order?'Order '+order+' units':'No purchase action';
  if(!upstreamAvailable)recommendedAction='Escalate/monitor upstream supply';
  else if(expiryRatio>.25&&(status==='critical'||status==='watch'))recommendedAction='Manual review: stock risk + near-expiry stock';
  else if(expiryRatio>.25)recommendedAction='Hold purchase; review near-expiry stock';
  return{...item,...prof,xyz:xyzClass(item.demand_history),forecast:f,sigma,ss,rop,position,available,cover,target,order,status,expiryRatio,annualDemand,turns,demandShift,leadShift,upstreamAvailable,mandateRisk,rootCause,contributingFactors,exceptionScore,confidence,recommendedAction};
}

export function analysePortfolio(items,policy){
  const issues=dataQuality(items);if(issues.length)throw new TypeError('Invalid inventory portfolio: '+issues.map(x=>'row '+x.row+' '+x.issue).join('; '));
  return applyABC(items).map(x=>analyseItem(x,policy));
}

export function dataQuality(items){
  const issues=[],seen=new Set;
  items.forEach((x,i)=>{
    issues.push(...itemDataIssues(x,i+1));
    const key=typeof x?.sku==='string'?x.sku.trim():'';
    if(key&&seen.has(key))issues.push({row:i+1,sku:key,issue:'Duplicate SKU'});
    if(key)seen.add(key);
  });return issues;
}

export function portfolioKPIs(items){
  return{critical:items.filter(x=>x.status==='critical').length,excess:items.filter(x=>x.status==='excess').length,
    inventoryValue:items.reduce((s,x)=>s+x.on_hand*x.cost,0),suggestedSpend:items.reduce((s,x)=>s+x.order*x.cost,0),
    atRiskValue:items.filter(x=>x.expiryRatio>.25).reduce((s,x)=>s+(x.expiry_90d||0)*x.cost,0)};
}
