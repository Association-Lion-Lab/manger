(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./food-names.js'));
  else root.MangerSeasons = factory(root.MangerFoodNames);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (foodNames) {
  'use strict';
  const { foodName } = foodNames;
  // Repères indicatifs : listes mensuelles Manger Bouger, consultées le 07/10/2026.
  // Couverture volontairement partielle : ni origine, ni mode de culture ne sont connus.
  const calendar = {
    carotte: [1,2,3,4,5,6,7,8,9,10,11,12], betterave: [1,2,3,4,10,11,12],
    poireau: [1,2,3,4,9,10,11,12], epinard: [1,2,3,4,5,9,10,11,12],
    endive: [1,2,3,4,10,11,12], navet: [1,2,3,4,5,10,11,12],
    panais: [1,2,3,10,11,12], celeri: [1,2,3,10,11,12],
    chou: [1,2,3,10,11,12], 'chou-fleur': [1,2,3,9,10,11,12],
    'chou de bruxelles': [1,2,3,10,11,12], 'chou rouge': [4,5,6,7,8,9],
    brocoli: [9,10,11], blette: [6,7,8,9,10,11],
    courge: [1,9,10,11,12], potiron: [1,9,10,11,12], potimarron: [10,11,12],
    topinambour: [1,2,11,12], asperge: [4,5,6], artichaut: [5,6,7,8,9],
    radis: [3,4,5,6,7], concombre: [5,6,7,8,9,10], courgette: [5,6,7,8,9,10],
    aubergine: [6,7,8,9], poivron: [6,7,8,9], tomate: [6,7,8,9],
    'haricot vert': [6,7,8,9,10], 'petit pois': [5,6,7], fenouil: [4,5,6,7,8,9,10,11],
    pomme: [1,2,3,4,8,9,10,11,12], poire: [1,2,3,8,9,10,11,12],
    fraise: [5,6,7], framboise: [6,7,8], cerise: [6,7], abricot: [6,7,8],
    peche: [6,7,8,9], prune: [7,8,9], raisin: [9,10], melon: [6,7,8,9],
    rhubarbe: [4,5,6], kiwi: [1,2,3,11,12], clementine: [1,2,11,12],
  };
  const aliases = {
    'epinards frais': 'epinard', 'epinard frais': 'epinard',
    'haricots verts': 'haricot vert', 'petits pois': 'petit pois',
    'tomates cerises': 'tomate', 'tomate cerise': 'tomate',
    'poivron rouge': 'poivron', 'poivron vert': 'poivron', 'poivron jaune': 'poivron',
    'choux de bruxelles': 'chou de bruxelles', 'choux-fleurs': 'chou-fleur',
    'chou fleur': 'chou-fleur', 'celeri rave': 'celeri', 'celeri branche': 'celeri',
    'blettes': 'blette', 'potimarrons': 'potimarron', 'courges': 'courge',
    'topinambours': 'topinambour', 'panais': 'panais', 'prunes': 'prune',
    'rhubarbes': 'rhubarbe',
  };
  function freshProduce(name) {
    const normalized = foodName(String(name || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Pas d'inférence à partir du titre ou d'un produit transformé (sauce, jus, etc.).
    return aliases[normalized] || (Object.hasOwn(calendar, normalized) ? normalized : null);
  }
  function recipeSeason(recipe, month) {
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('Mois attendu entre 1 et 12');
    const names = [...new Set((recipe.ingredients || []).map(item => freshProduce(item.name)).filter(Boolean))];
    const inSeason = names.filter(name => calendar[name].includes(month));
    const outOfSeason = names.filter(name => !calendar[name].includes(month));
    return { matches: inSeason.length > 0 && outOfSeason.length === 0, inSeason, outOfSeason };
  }
  return { recipeSeason, freshProduce };
});
