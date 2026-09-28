(function (root) {
  const KEY = 'manger-recipes-offline-v1';
  function valid(recipe) {
    const text = value => typeof value === 'string' && value.length <= 10000;
    return recipe && Number.isSafeInteger(recipe.id) && recipe.id > 0 && text(recipe.title)
      && Number.isInteger(recipe.portions) && recipe.portions >= 1 && recipe.portions <= 100
      && Number.isFinite(recipe.minutes) && recipe.minutes >= 0 && text(recipe.savedAt) && Number.isFinite(Date.parse(recipe.savedAt))
      && Array.isArray(recipe.ingredients) && recipe.ingredients.length <= 200 && recipe.ingredients.every(text)
      && Array.isArray(recipe.steps) && recipe.steps.length <= 200 && recipe.steps.every(step => step && text(step.label) && text(step.text)
        && (step.minutes == null || (Number.isInteger(step.minutes) && step.minutes >= 0 && step.minutes <= 1440)));
  }
  function read(storage) {
    const raw = storage.getItem(KEY);
    if (raw === null) return [];
    if (raw.length > 1000000) throw new Error('Copie de recettes trop volumineuse. Efface-la pour recommencer.');
    const recipes = JSON.parse(raw);
    if (!Array.isArray(recipes) || recipes.length > 20 || !recipes.every(valid)) throw new Error('Copie de recettes invalide. Efface-la pour recommencer.');
    return recipes;
  }
  function save(storage, recipe) {
    if (!valid(recipe)) throw new Error('Impossible de préparer cette recette hors connexion.');
    const recipes = read(storage).filter(item => item.id !== recipe.id);
    if (recipes.length >= 20) throw new Error('20 recettes sont déjà enregistrées. Retire une copie avant d’en ajouter une.');
    recipes.unshift(recipe);
    const raw = JSON.stringify(recipes);
    if (raw.length > 1000000) throw new Error('Copies trop volumineuses. Retire une recette avant de réessayer.');
    storage.setItem(KEY, raw); // One atomic write: a quota error preserves the old copy.
  }
  function remove(storage, id) { storage.setItem(KEY, JSON.stringify(read(storage).filter(recipe => recipe.id !== id))); }
  const api = { KEY, read, save, remove };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.offlineRecipes = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
