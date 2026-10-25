const DAY_MS=86_400_000;
const dateKey=date=>date.toISOString().slice(0,10);
const addDays=(key,days)=>dateKey(new Date(new Date(`${key}T12:00:00Z`).getTime()+days*DAY_MS));
function isDateKey(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())&&dateKey(date)===value;
}
module.exports={DAY_MS,dateKey,addDays,isDateKey};
