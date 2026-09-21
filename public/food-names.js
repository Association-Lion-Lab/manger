(function (root) {
  const clean = value => value.normalize('NFC').trim().toLocaleLowerCase('fr').replace(/\s+/g, ' ');
  const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').replace(/’/g, "'");
  // A food vocabulary, not a rule that strips the last letter from every word.
  const singulars = 'abricot|amande|ananas|artichaut|asperge|aubergine|avocat|banane|betterave|brocoli|carotte|cerise|champignon|citron|clémentine|concombre|courgette|échalote|épinard|fraise|framboise|haricot|kiwi|lentille|mandarine|mangue|melon|navet|noisette|noix|oignon|olive|orange|patate douce|pêche|poire|poireau|poivron|pomme|pomme de terre|potiron|radis|raisin|tomate|œuf'.split('|');
  const plurals = { 'patate douce': 'patates douces', 'pomme de terre': 'pommes de terre', poireau: 'poireaux' };
  const names = new Map();
  for (const name of singulars) {
    names.set(fold(name), name);
    names.set(fold(plurals[name] || (/[sx]$/.test(name) ? name : name + 's')), name);
  }
  for (const name of ['riz', 'maïs', 'pois', 'pois chiches', 'petits pois', 'lait', 'farine', 'beurre', 'huile d’olive', 'tofu', 'tofu fumé', 'poulet', 'saumon', 'bœuf', 'porc', 'sel', 'sucre', 'pâtes', 'tomate concassée', 'oignon rouge']) names.set(fold(name), name);
  for (const [variant, name] of [['pois chiche', 'pois chiches'], ['petit pois', 'petits pois'], ['tomates concassées', 'tomate concassée'], ['oignons rouges', 'oignon rouge']]) names.set(fold(variant), name);
  function foodName(value) { return names.get(fold(value)) || clean(value); }
  function distance(a, b) {
    const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    rows[0] = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
    return rows[a.length][b.length];
  }
  function foodSuggestions(value, known = []) {
    const input = fold(foodName(value));
    if (input.length < 4 || input.length > 80) return [];
    const candidates = new Map([...names, ...known.filter(name => typeof name === 'string' && name.length <= 80).map(name => [fold(name), foodName(name)])]);
    if (candidates.has(input)) return [];
    const limit = input.length >= 7 ? 2 : 1;
    return [...new Set([...candidates].filter(([form]) => Math.abs(form.length - input.length) <= limit && form.split(' ').length === input.split(' ').length)
      .map(([form, name]) => ({ name, score: distance(input, form) })).filter(item => item.score <= limit)
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'fr')).map(item => item.name))].slice(0, 3);
  }
  function searchRecipes(recipes, query) {
    const normalized = fold(foodName(query));
    if (!normalized) return recipes;
    const searchable = recipe => [fold(recipe.title), ...recipe.ingredients.map(item => fold(foodName(item.name)))];
    const exact = recipes.filter(recipe => searchable(recipe).some(value => value.includes(normalized)));
    // Keep exact results predictable; spelling tolerance is only a fallback.
    if (exact.length) return exact;
    const alternatives = foodSuggestions(query, recipes.flatMap(recipe => [recipe.title, ...recipe.ingredients.map(item => item.name)])).map(fold);
    return recipes.filter(recipe => searchable(recipe).some(value => alternatives.some(name => value.includes(name))));
  }
  const api = { foodName, foodSuggestions, searchRecipes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MangerFoodNames = api;
})(globalThis);
