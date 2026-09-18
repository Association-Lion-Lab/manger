// Shared by automatic menus and server suggestions. This is not an allergy filter.
function ingredientTaste(ingredient, preference) {
  const words = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/œ/g, 'oe').split(/[^a-z0-9]+/).filter(Boolean).map(word => word.replace(/s$/, ''));
  const food = words(ingredient.name), taste = words(preference);
  const state = tokens => tokens.some(word => /^cru(e)?$/.test(word)) ? 'raw' : tokens.some(word => /^cuit(e)?$/.test(word)) ? 'cooked' : null;
  const wantedState = state(taste);
  const name = taste.filter(word => !/^(crue?|cuite?)$/.test(word));
  if (!name.length || !name.every(word => food.includes(word))) return 'clear';
  if (!wantedState) return 'avoid';
  if (!ingredient.preparation || ingredient.preparation === 'unknown') return 'check';
  return ingredient.preparation === wantedState ? 'avoid' : 'clear';
}
function avoidsIngredient(ingredient, preference) { return ingredientTaste(ingredient, preference) !== 'clear'; }
function recipeTaste(ingredients, members, common = []) {
  const reviewFor = [], avoidedFor = [];
  for (const member of [...members, { name: 'le foyer', avoidedIngredients: common }]) {
    const matches = ingredients.flatMap(item => (member.avoidedIngredients || []).map(preference => ingredientTaste(item, preference)));
    if (matches.includes('avoid')) avoidedFor.push(member.name);
    else if (matches.includes('check')) reviewFor.push(member.name);
  }
  return { avoidedFor: [...new Set(avoidedFor)], reviewFor: [...new Set(reviewFor)] };
}
function tasteRank(taste) { return taste.avoidedFor.length ? 3 : taste.reviewFor.length ? 1 : 0; }
function tasteNotice(taste) {
  return [taste.avoidedFor.length ? `Moins adapté aux goûts de ${taste.avoidedFor.join(', ')}` : '', taste.reviewFor.length ? `À vérifier pour ${taste.reviewFor.join(', ')} : cru/cuit non précisé` : ''].filter(Boolean).join(' · ');
}
if (typeof module !== 'undefined') module.exports = { ingredientTaste, avoidsIngredient, recipeTaste, tasteRank, tasteNotice };
