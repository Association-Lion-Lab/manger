function inputError(message) {
  return Object.assign(new Error(message), {code:'MANGER_HOUSEHOLD_INPUT'});
}

const invalidNames = names => !Array.isArray(names) || names.length > 50 || names.some(name => typeof name !== 'string' || !name.trim() || name.length > 80);
const normalizeNames = names => [...new Set(names.map(name => name.trim().toLocaleLowerCase('fr')))];

function validatePreferences(input) {
  const names = input?.avoidedIngredients;
  if (invalidNames(names) || names.some(name => name.includes('\0'))) throw inputError('Préférences invalides : 50 mots ou expressions maximum');
  return normalizeNames(names);
}

function validateMember(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60 || input.name.includes('\0')) throw inputError('Nom invalide');
  if (!['vegan', 'vegetarian', 'pescetarian', 'omnivore'].includes(input.diet)) throw inputError('Régime invalide');
  if (input.avoidedIngredients !== undefined && invalidNames(input.avoidedIngredients)) throw inputError('Préférences invalides : 50 ingrédients maximum');
  return { name: input.name.trim(), diet: input.diet, ...(input.avoidedIngredients !== undefined ? { avoidedIngredients: normalizeNames(input.avoidedIngredients) } : {}) };
}

function validateProtein(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60 || input.name.includes('\0')) throw inputError('Protéine invalide');
  if (!['plant', 'egg', 'fish', 'meat'].includes(input.category)) throw inputError('Catégorie invalide');
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10_000) throw inputError('Quantité invalide');
  if (typeof input.unit !== 'string' || !input.unit.trim() || input.unit.length > 24 || input.unit.includes('\0')) throw inputError('Unité invalide');
  return { name: input.name.trim().toLocaleLowerCase('fr'), category: input.category, amount: input.amount, unit: input.unit.trim() };
}

function isCompatible(diet, category) {
  const allowed = {
    vegan: ['plant'],
    vegetarian: ['plant', 'egg'],
    pescetarian: ['plant', 'egg', 'fish'],
    omnivore: ['plant', 'egg', 'fish', 'meat']
  };
  return allowed[diet]?.includes(category) === true;
}

module.exports = { isCompatible, validateMember, validateProtein, validatePreferences, inputError };
