const {foodName,foodKey,inUnit,groupIngredients,isAntiWasteIngredient,isTapWater}=require('./ingredients');
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
  }).filter(item => item.amount > 0 && !isTapWater(item.name));
}

function availablePantry(data, end) {
  return reservePantry(data, end).stocks.filter(item => !item.ambiguous && item.recordedOn <= end);
}

// Validates the shared criteria; returns the selected members and portions.
function menuCriteria(home, input) {
  if (!input || !isDateKey(input.start) || new Date(`${input.start}T12:00:00Z`).getUTCDay() !== 1 || !Number.isInteger(input.maxMinutes) || input.maxMinutes < 1 || input.maxMinutes > 1440 || !Array.isArray(input.memberIds) || !Array.isArray(input.slots) || !input.slots.length || input.slots.length > 14) throw new Error('Critères du menu invalides.');
  if (new Set(input.memberIds).size !== input.memberIds.length || input.memberIds.some(id => !Number.isInteger(id) || !home.members.some(member => member.id === id))) throw new Error('Participants inconnus.');
  const members = home.members.filter(member => input.memberIds.includes(member.id));
  const people = members.length || input.people;
  if ((home.members.length && !members.length) || !Number.isInteger(people) || people < 1 || people > 100) throw new Error('Choisis au moins une personne.');
  return { members, people };
}

function menuSlots(data, input) {
  const existing = data.meals.filter(row => row.date >= input.start && row.date <= addDays(input.start, 6)), seen = new Set();
  return input.slots.map(item => {
    if (!item || !Number.isInteger(item.day) || item.day < 0 || item.day > 6 || !['midi', 'soir'].includes(item.slot) || (item.split !== undefined && typeof item.split !== 'boolean') || (item.dishes !== undefined && item.recipeId !== undefined)) throw new Error('Créneau invalide.');
    const key = `${item.day}/${item.slot}`;
    if (seen.has(key) || existing.some(meal => meal.date === addDays(input.start, item.day) && meal.slot === item.slot)) throw new Error('Créneau déjà occupé ou répété. Recharge le planning.');
    seen.add(key); return item;
  }).sort((a, b) => a.day - b.day || a.slot.localeCompare(b.slot));
}

const mealRecipeIds = meal => [meal.recipeId, ...(meal.dishes || []).map(dish => dish.recipeId)].filter(Boolean);

// Members grouped by diet, strictest first (vegan before omnivore).
function dietGroups(members) {
  const diets = [...new Set(members.map(member => member.diet))].sort((a, b) => isDietCompatible(a, b) ? 1 : -1);
  return diets.map(diet => members.filter(member => member.diet === diet));
}

// Mixed diets: about two meals out of five are split, every other meal from the second one.
function defaultSplit(index, count) {
  return index % 2 === 1 && index < 2 * Math.round(count * 2 / 5);
}

// Recipes these members can all eat in time, with their tastes and the quantities for their portions.
function menuPool(data, input, members, people) {
  return [...data.recipes].sort((a, b) => Buffer.compare(Buffer.from(a.title), Buffer.from(b.title)) || a.id - b.id)
    .filter(recipe => recipe.minutes <= input.maxMinutes && members.every(member => isDietCompatible(member.diet, recipe.diet)))
    .map(recipe => ({ ...recipe, ...recipeTaste(recipe.ingredients, members, data.home.avoidedIngredients), needs: groupIngredients(recipe.ingredients.map(item => ({ ...item, amount: item.amount * people / recipe.servings }))) }));
}

// For a less strict group, prefer what the strictest group cannot eat (meat for an omnivore beside a pescetarian).
function ownDishes(pool, strictest) {
  const own = pool.filter(recipe => !isDietCompatible(strictest[0].diet, recipe.diet));
  return own.some(recipe => tasteRank(recipe) < 3) ? own : pool;
}

function fixedDishes(slot, members) {
  const dishes = slot.dishes, ids = Array.isArray(dishes) ? dishes.flatMap(dish => Array.isArray(dish?.memberIds) ? dish.memberIds : []) : [];
  if (!Array.isArray(dishes) || !dishes.length || dishes.some(dish => !Array.isArray(dish?.memberIds) || !dish.memberIds.length) || new Set(ids).size !== ids.length || ids.some(id => !members.some(member => member.id === id))) throw new Error('Plats du repas invalides.');
  return dishes;
}

// One plate per dish to fill: one shared plate, or one plate per diet group for a split meal.
function mealPlates(slot, index, context) {
  const { members, people, groups, count, pool } = context, place = { day: slot.day, slot: slot.slot };
  if (slot.dishes !== undefined) return fixedDishes(slot, members).map(dish => ({ ...place, memberIds: dish.memberIds, recipeId: dish.recipeId, pool: pool(members.filter(member => dish.memberIds.includes(member.id))) }));
  const split = groups.length > 1 && slot.recipeId === undefined && (slot.split ?? defaultSplit(index, count));
  if (!split) return [{ ...place, recipeId: slot.recipeId, pool: pool(members, people) }];
  return groups.map((group, rank) => ({ ...place, memberIds: group.map(member => member.id), pool: rank ? ownDishes(pool(group), groups[0]) : pool(group) }));
}

function scoreRecipe(recipe, date, { stocks, ingredients, used, recent }) {
  const stockFor = item => matchingStocks(stocks, item, date);
  const relevant = recipe.needs.filter(item => isAntiWasteIngredient(item.name));
  const covered = relevant.filter(item => stockFor(item).reduce((sum, stock) => sum + inUnit(stock, item.unit), 0) + 1e-8 >= item.amount);
  const soon = covered.filter(item => stockFor(item).some(stock => stock.amount > 0 && stock.useBy && stock.useBy <= addDays(date, 3))).length;
  const reused = relevant.filter(item => ingredients.has(foodName(item.name))).length;
  // Strict order: no repeat in the week, tastes, urgent anti-waste, not eaten recently; then a weighted draw.
  return { recipe, covered, key: [used.get(recipe.id) || 0, tasteRank(recipe), -soon, Number(recent.has(recipe.id))], weight: 1 + covered.length + reused };
}

function draw(ranked, random) {
  const order = (a, b) => a.key.reduce((diff, value, index) => diff || value - b.key[index], 0);
  const best = ranked.reduce((top, item) => order(item, top) < 0 ? item : top);
  const tied = ranked.filter(item => order(item, best) === 0);
  let point = random() * tied.reduce((sum, item) => sum + item.weight, 0);
  return tied.find(item => (point -= item.weight) < 0) || tied.at(-1);
}

function choosePlate(plate, start, context) {
  const date = addDays(start, plate.day);
  const ranked = plate.pool.map(recipe => scoreRecipe(recipe, date, context));
  const { recipe, covered } = plate.recipeId === undefined ? draw(ranked, context.random) : ranked.find(item => item.recipe.id === plate.recipeId);
  context.used.set(recipe.id, (context.used.get(recipe.id) || 0) + 1);
  recipe.needs.forEach(item => { context.ingredients.add(foodName(item.name)); consumeStocks(context.stocks, item, date); });
  plate.choice = { day: plate.day, slot: plate.slot, recipeId: recipe.id, ...(plate.memberIds ? { memberIds: plate.memberIds } : {}), pantryIngredients: covered.map(item => item.name) };
}

// random is injectable for tests; the HTTP routes keep Math.random.
function previewMenu(data, input, random = Math.random) {
  const { members, people } = menuCriteria(data.home, input), slots = menuSlots(data, input), pools = new Map();
  const pool = (group, portions = group.length) => {
    const key = group.map(member => member.id).join();
    if (!pools.has(key)) pools.set(key, menuPool(data, input, group, portions));
    return pools.get(key);
  };
  if (!pool(members, people).length) throw new Error('Aucune recette adaptée aux régimes et au temps choisi.');
  const plates = slots.flatMap((slot, index) => mealPlates(slot, index, { members, people, groups: dietGroups(members), count: slots.length, pool }));
  for (const plate of plates) if (plate.recipeId !== undefined && (!Number.isInteger(plate.recipeId) || !plate.pool.some(recipe => recipe.id === plate.recipeId))) throw new Error('Le plat choisi ne respecte plus les critères du menu.');
  const recent = new Set(data.meals.filter(meal => meal.date >= addDays(input.start, -21) && meal.date < input.start).flatMap(mealRecipeIds)), used = new Map();
  data.meals.filter(meal => meal.date >= input.start && meal.date <= addDays(input.start, 6)).flatMap(mealRecipeIds).forEach(id => used.set(id, (used.get(id) || 0) + 1));
  const context = { stocks: availablePantry(data, addDays(input.start, 6)), ingredients: new Set(shoppingList(data, input.start).map(item => foodName(item.name))), used, recent, random };
  // ponytail: greedy chronological choice, not a global menu optimization.
  // Reserve manual choices first, including later meals, before proposing the rest.
  [...plates.filter(plate => plate.recipeId !== undefined), ...plates.filter(plate => plate.recipeId === undefined)].forEach(plate => choosePlate(plate, input.start, context));
  return plates.map(plate => plate.choice);
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
