const {foodKey}=require('./ingredients');
const {isDateKey,addDays}=require('./dates');
const {pantryShopping}=require('./calculations');
const aisles=['','Fruits et légumes','Frais','Épicerie','Surgelés','Maison','Autres'];
function shoppingError(message,status=400){return Object.assign(new Error(message),{code:'MANGER_SHOPPING_INPUT',status});}
const text=(value,max,trim=true)=>typeof value==='string'&&Boolean(trim?value.trim():value)&&value.length<=max&&!value.includes('\0');
function weekKey(start){if(!isDateKey(start))throw shoppingError('Début de semaine invalide');return start;}
const identity=item=>item.manualId==null?foodKey(item):`manual:${item.manualId}`;
function validate(kind,input,id=null){
  if(!input)throw shoppingError('Article invalide');
  if(kind==='sync'){
    if(!isDateKey(input.weekStart)||!Array.isArray(input.items)||!input.items.length||input.items.length>200||input.items.some(i=>!i||!text(i.name,80)||!text(i.unit,24)||!Number.isFinite(i.amount)||i.amount<=0||(i.manualId!=null&&(!Number.isSafeInteger(i.manualId)||i.manualId<1))))throw shoppingError('Achats hors connexion invalides.');
    if(new Set(input.items.map(identity)).size!==input.items.length)throw shoppingError('Article envoyé plusieurs fois.');return input;
  }
  if(!text(input.name,80,kind!=='check')||!text(input.unit,24,kind!=='check'))throw shoppingError('Article invalide');
  if(kind==='check'&&(!isDateKey(input.weekStart)||typeof input.checked!=='boolean'))throw shoppingError('Article invalide');
  if(kind==='aisle'&&!aisles.includes(input.aisle))throw shoppingError('Rayon invalide');
  if(['check','aisle'].includes(kind)&&input.manualId!=null&&(!Number.isSafeInteger(input.manualId)||!isDateKey(input.weekStart)))throw shoppingError('Article inconnu');
  if(kind==='manual'){
    if(!isDateKey(input.weekStart)||!Number.isFinite(input.amount)||input.amount<=0||input.amount>10000||!aisles.includes(input.aisle))throw shoppingError('Article invalide');
    if(id!==null&&(!Number.isSafeInteger(id)||id<=0||!input.previous||typeof input.previous.name!=='string'||typeof input.previous.unit!=='string'||typeof input.previous.aisle!=='string'||!Number.isFinite(input.previous.amount)||[input.previous.name,input.previous.unit,input.previous.aisle].some(s=>s.includes('\0'))))throw shoppingError('Article invalide');
  }
  return input;
}
function shoppingState(data,start){
  const checks=new Set(data.checks.filter(i=>i.week_start===start).map(foodKey)),aisleMap=new Map(data.aisles.map(i=>[foodKey(i),i.aisle]));
  return [...pantryShopping(data,start).map(i=>({...i,aisle:aisleMap.get(foodKey(i))||null,checked:checks.has(foodKey(i))})),
    ...data.manual.filter(i=>i.week_start===start).map(({week_start,...i})=>({...i,checked:Boolean(i.checked)}))];
}
const weekState=(data,start)=>({recipes:data.recipes,meals:data.meals.filter(i=>i.date>=start&&i.date<=addDays(start,6)),shopping:shoppingState(data,start)});
function syncMatches(current,input){
  const accepted=[],rejected=[];
  for(const [index,item] of input.items.entries()){
    const match=current.find(row=>identity(row)===identity(item));
    if(!match||foodKey(match)!==foodKey(item)||match.unit!==item.unit||match.amount!==item.amount)rejected.push(index);else accepted.push(index);
  }
  return {accepted,rejected};
}
module.exports={validate,weekKey,identity,shoppingError,shoppingState,weekState,syncMatches};
