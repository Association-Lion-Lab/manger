const {foodName,foodKey,inUnit,groupIngredients,isAntiWasteIngredient}=require('./ingredients');
const {recipeTaste,tasteRank}=require('./public/tastes');
const {isDietCompatible}=require('./household');
const {dateKey,addDays,isDateKey}=require('./dates');
function shoppingList(data,start,end=addDays(start,6)) {
  const totals=new Map();
  for(const {date,name,unit,amount} of data.items)if(date>=start&&date<=end){
    const key=JSON.stringify([name,unit]),current=totals.get(key);
    if(current){
      const sum=current.amount+amount;
      current.error+=Math.abs(current.amount)>=Math.abs(amount)?(current.amount-sum)+amount:(amount-sum)+current.amount;
      current.amount=sum;
    }else totals.set(key,{name,unit,amount,error:0});
  }
  return groupIngredients([...totals.values()].sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name))||Buffer.compare(Buffer.from(a.unit),Buffer.from(b.unit))).map(({error,...item})=>({...item,amount:item.amount+error})));
}

function pantryStocks(data) {
  const counts=new Map();
  for(const row of data.stocks.filter(row=>!row.explicitLot))counts.set(foodKey(row),(counts.get(foodKey(row))||0)+1);
  return data.stocks.map(row=>({...row,ambiguous:!row.explicitLot&&counts.get(foodKey(row))>1}));
}

function matchingStocks(stocks, item, date) {
  return stocks.filter(stock => !stock.ambiguous && foodKey(stock) === foodKey(item) && stock.recordedOn <= date && (!stock.useBy || stock.useBy >= date));
}

function consumeStocks(stocks, item, date) {
  let remaining = item.amount;
  for (const stock of matchingStocks(stocks, item, date)) {
    const taken = Math.min(remaining, inUnit(stock, item.unit));
    stock.amount = Math.max(0, stock.amount - inUnit({ ...item, amount: taken }, stock.unit));
    remaining = Math.max(0, remaining - taken);
  }
  return item.amount - remaining;
}

function reservePantry(data, end, countFrom = null) {
  const stocks = pantryStocks(data), covered = [];
  const first = stocks.filter(stock => !stock.ambiguous && stock.recordedOn <= end).map(stock => stock.recordedOn).sort()[0];
  if (!first) return { stocks, covered };
  // Only visit planned days, rather than every day since the oldest stock.
  const dates = [...new Set(data.meals.filter(row=>row.date>=first&&row.date<=end).map(row=>row.date))].sort().map(date=>({date}));
  for (const { date } of dates) for (const item of shoppingList(data, date, date)) {
    const amount = consumeStocks(stocks, item, date);
    if (countFrom && date >= countFrom && amount > 0) covered.push({ ...item, amount });
  }
  return { stocks, covered: groupIngredients(covered) };
}

function pantry(data) {
  const today = dateKey(new Date());
  const remaining = new Map(reservePantry(data, addDays(today, -1)).stocks.map(item => [item.id, item.amount]));
  return pantryStocks(data).map(item => {
    return { ...item, dateStatus: !item.useBy ? null : item.useBy < today ? 'past' : item.useBy <= addDays(today, 3) ? 'soon' : 'later', remaining: item.ambiguous ? 0 : Math.round(remaining.get(item.id) * 100) / 100 };
  });
}

function pantryShopping(data, start) {
  const { covered } = reservePantry(data, addDays(start, 6), start);
  return shoppingList(data, start).map(item => {
    const stock = covered.find(row => foodKey(row) === foodKey(item));
    const used = stock ? Math.min(item.amount, inUnit(stock, item.unit)) : 0;
    return { ...item, amount: Math.max(0, Math.round((item.amount - used) * 100) / 100), fromPantry: Math.round(used * 100) / 100 };
  }).filter(item => item.amount > 0);
}

function availablePantry(data, end) {
  return reservePantry(data, end).stocks.filter(item => !item.ambiguous && item.recordedOn <= end);
}

function previewMenu(data, input) {
  if (!input || !isDateKey(input.start) || new Date(`${input.start}T12:00:00Z`).getUTCDay() !== 1 || !Number.isInteger(input.maxMinutes) || input.maxMinutes < 1 || input.maxMinutes > 1440 || !Array.isArray(input.memberIds) || !Array.isArray(input.slots) || !input.slots.length || input.slots.length > 14) throw new Error('Critères du menu invalides.');
  const home = data.home;
  if (new Set(input.memberIds).size !== input.memberIds.length || input.memberIds.some(id => !Number.isInteger(id) || !home.members.some(member => member.id === id))) throw new Error('Participants inconnus.');
  const members = home.members.filter(member => input.memberIds.includes(member.id));
  const people = members.length || input.people;
  if ((home.members.length && !members.length) || !Number.isInteger(people) || people < 1 || people > 100) throw new Error('Choisis au moins une personne.');
  const existing = data.meals.filter(row=>row.date>=input.start&&row.date<=addDays(input.start,6)), seen = new Set();
  const slots = input.slots.map(item => {
    if (!item || !Number.isInteger(item.day) || item.day < 0 || item.day > 6 || !['midi', 'soir'].includes(item.slot)) throw new Error('Créneau invalide.');
    const key = `${item.day}/${item.slot}`;
    if (seen.has(key) || existing.some(meal => meal.date === addDays(input.start, item.day) && meal.slot === item.slot)) throw new Error('Créneau déjà occupé ou répété. Recharge le planning.');
    seen.add(key); return item;
  }).sort((a, b) => a.day - b.day || a.slot.localeCompare(b.slot));
  const candidates = [...data.recipes].sort((a,b)=>Buffer.compare(Buffer.from(a.title),Buffer.from(b.title))||a.id-b.id).filter(recipe => recipe.minutes <= input.maxMinutes && members.every(member => isDietCompatible(member.diet, recipe.diet))).map(recipe => ({ ...recipe, ...recipeTaste(recipe.ingredients, members, home.avoidedIngredients), needs: groupIngredients(recipe.ingredients.map(item => ({ ...item, amount: item.amount * people / recipe.servings }))) }));
  if (!candidates.length) throw new Error('Aucune recette adaptée aux régimes et au temps choisi.');
  for (const slot of slots) if (slot.recipeId !== undefined && (!Number.isInteger(slot.recipeId) || !candidates.some(recipe => recipe.id === slot.recipeId))) throw new Error('Le plat choisi ne respecte plus les critères du menu.');
  const stocks = availablePantry(data, addDays(input.start, 6));
  const ingredients = new Set(shoppingList(data, input.start).map(item => foodName(item.name))), used = new Map();
  existing.forEach(meal => [meal.recipeId, ...(meal.dishes || []).map(dish => dish.recipeId)].filter(Boolean).forEach(id => used.set(id, (used.get(id) || 0) + 1)));
  // ponytail: greedy chronological choice, not a global menu optimization.
  // Reserve manual choices first, including later meals, before proposing the rest.
  return [...slots].sort((a, b) => Number(b.recipeId !== undefined) - Number(a.recipeId !== undefined)).map(slot => {
    const date = addDays(input.start, slot.day);
    const stockFor = item => matchingStocks(stocks, item, date);
    const ranked = candidates.map(recipe => {
      const relevant = recipe.needs.filter(item => isAntiWasteIngredient(item.name));
      const covered = relevant.filter(item => stockFor(item).reduce((sum, stock) => sum + inUnit(stock, item.unit), 0) + 1e-8 >= item.amount);
      return { recipe, covered, soon: covered.filter(item => stockFor(item).some(stock => stock.amount > 0 && stock.useBy && stock.useBy <= addDays(date, 3))).length, reused: relevant.filter(item => ingredients.has(foodName(item.name))).length };
    }).sort((a, b) => ((used.get(a.recipe.id) || 0) * 2 + tasteRank(a.recipe)) - ((used.get(b.recipe.id) || 0) * 2 + tasteRank(b.recipe)) || tasteRank(a.recipe) - tasteRank(b.recipe) || b.soon - a.soon || b.covered.length - a.covered.length || b.reused - a.reused || a.recipe.title.localeCompare(b.recipe.title, 'fr'));
    const { recipe, covered } = slot.recipeId === undefined ? ranked[0] : ranked.find(item => item.recipe.id === slot.recipeId);
    used.set(recipe.id, (used.get(recipe.id) || 0) + 1);
    recipe.needs.forEach(item => {
      ingredients.add(foodName(item.name));
      consumeStocks(stocks, item, date);
    });
    return { day: slot.day, slot: slot.slot, recipeId: recipe.id, pantryIngredients: covered.map(item => item.name) };
  }).sort((a, b) => a.day - b.day || a.slot.localeCompare(b.slot));
}

function suggestions(data, start = null, maxMinutes = null, memberIds = null, targetDate = start || dateKey(new Date())) {
  // Stock is an estimate: reserve existing meals through the suggested week before ranking.
  const home = data.home;
  const members = memberIds === null ? home.members : home.members.filter(member => memberIds.includes(member.id));
  if (memberIds !== null && (!Array.isArray(memberIds) || memberIds.some(id => !home.members.some(member => member.id === id)))) throw new Error('Participants inconnus');
  const memberDiets = members.map(member => member.diet);
  const candidates=[...data.recipes].sort((a,b)=>a.id-b.id).map(({id,title,minutes,servings,tags,diet})=>({id,title,minutes,servings,tags,diet,
    lastEaten:data.meals.filter(m=>m.recipeId===id||(m.dishes||[]).some(d=>d.recipeId===id)).map(m=>m.date).sort().at(-1)||null
  })).filter(recipe=>(maxMinutes==null||recipe.minutes<=maxMinutes)&&memberDiets.every(diet=>isDietCompatible(diet,recipe.diet)));
  const ingredientsFor=id=>data.recipes.find(recipe=>recipe.id===id).ingredients;
  const plannedIngredients = new Set(start ? shoppingList(data, start).map(item => item.name) : []);
  const stocks = availablePantry(data, start ? addDays(start, 6) : targetDate).filter(item => item.recordedOn <= targetDate && (!item.useBy || item.useBy >= targetDate));
  const plannedRecipeIds=new Set(start?data.meals.filter(m=>m.date>=start&&m.date<=addDays(start,6)).flatMap(m=>[m.recipeId,...(m.dishes||[]).map(d=>d.recipeId)]).filter(id=>id!==null):[]);
  const ranked = candidates.map(recipe => ({ ...recipe, ...recipeTaste(ingredientsFor(recipe.id), members, home.avoidedIngredients) })).map(recipe => ({
    ...recipe,
    tags: [...recipe.tags],
    reusedIngredients: [...new Set(ingredientsFor(recipe.id).map(item => foodName(item.name)).filter(name => isAntiWasteIngredient(name) && plannedIngredients.has(name)))],
    pantryIngredients: [...new Set(groupIngredients(ingredientsFor(recipe.id)).filter(item => {
      return isAntiWasteIngredient(item.name) && matchingStocks(stocks, item, targetDate).reduce((sum, stock) => sum + inUnit(stock, item.unit), 0) + 1e-8 >= item.amount * (members.length || recipe.servings) / recipe.servings;
    }).map(item => item.name))],
    alreadyPlanned: plannedRecipeIds.has(recipe.id)
  })).map(recipe => ({ ...recipe, useSoonIngredients: [...new Set(groupIngredients(ingredientsFor(recipe.id)).filter(item => recipe.pantryIngredients.includes(item.name) && matchingStocks(stocks, item, targetDate).some(stock => stock.amount > 0 && stock.useBy && stock.useBy <= addDays(targetDate, 3))).map(item => item.name))] })).sort((left, right) =>
    tasteRank(left) - tasteRank(right) ||
    Number(left.alreadyPlanned) - Number(right.alreadyPlanned) ||
    right.useSoonIngredients.length - left.useSoonIngredients.length ||
    right.pantryIngredients.length - left.pantryIngredients.length ||
    right.reusedIngredients.length - left.reusedIngredients.length ||
    Number(Boolean(left.lastEaten)) - Number(Boolean(right.lastEaten)) ||
    String(left.lastEaten || '').localeCompare(String(right.lastEaten || '')) ||
    left.title.localeCompare(right.title, 'fr')
  );
  return ranked.slice(0, 3);
}


const inputRule=rule=>(...args)=>{try{return rule(...args);}catch(error){error.code||='MANGER_CALCULATION_INPUT';throw error;}};
module.exports={shoppingList,pantry,pantryShopping,suggestions:inputRule(suggestions),previewMenu:inputRule(previewMenu)};
