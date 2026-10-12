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
  const seasonCalendars = {
    france: {
      label: 'France métropolitaine',
      source: 'Manger Bouger',
      url: 'https://www.mangerbouger.fr/manger-mieux/bien-manger-sans-se-ruiner/calendrier-de-saison',
      coverage: 'Repères nationaux pour une sélection de fruits et légumes.',
    },
    'hauts-de-france': {
      label: 'Hauts-de-France',
      source: 'Où acheter local · Hauts-de-France',
      url: 'https://ouacheterlocal.fr/produits-de-saison/janvier/',
      coverage: 'Pommes et betteraves : repères régionaux. Autres produits : calendrier national.',
    },
    bretagne: {
      label: 'Bretagne',
      source: 'Région Bretagne',
      url: 'https://www.bretagne.bzh/actualites/de-janvier-a-decembre-mangez-breton-sans-vous-tromper/',
      coverage: 'Repères régionaux complétés par le calendrier national pour les produits non couverts. Asperges : à partir de fin mars.',
    },
  };
  // shortcut: seuls les repères régionaux vérifiés remplacent le national ; étendre avec des sources mensuelles fiables.
  const regionalCalendars = {
    'hauts-de-france': { ...calendar, betterave: [1,2,3,10,11,12], pomme: [1,2,3,4,5,9,10,11,12] },
    bretagne: {
      ...calendar,
      betterave: [1,2,3,4,5,6,7,8,9,10,11,12], poireau: [1,2,3,4,9,10,11,12],
      epinard: [4,5,6,7,8,9,10], endive: [1,2,3,11,12], navet: [1,2,3,4,5,6,9,10,11,12],
      chou: [1,2,9,10,11,12], 'chou-fleur': [1,2,3,4,5,6,7,8,9,10,11,12],
      'chou de bruxelles': [1,2,9,10,11,12], 'chou rouge': [1,2,9,10,11,12],
      brocoli: [9,10,11], blette: [4,5,6,7,8,9], courge: [10,11,12], potiron: [1,9,10,11,12],
      topinambour: [1,2,11,12], asperge: [3,4,5,6], artichaut: [6,7,8,9],
      radis: [4,5,6,7,8,9,10], concombre: [5,6,7,8,9], courgette: [6,7,8,9],
      aubergine: [6,7,8,9], poivron: [6,7,8,9], tomate: [6,7,8,9],
      'haricot vert': [7,8,9,10], 'petit pois': [4,5,6,7], fenouil: [9,10],
      pomme: [1,2,3,4,8,9,10,11,12], poire: [1,2,3,8,9,10,11,12],
      fraise: [5,6,7,8], framboise: [6,7,8,9,10], cerise: [5,6,7], abricot: [6,7,8],
      peche: [7,8,9,10], prune: [7,8,9,10], raisin: [8,9,10,11], melon: [6,7,8,9],
      rhubarbe: [4,5,6], kiwi: [1,2,3,11,12], clementine: [1,11,12],
    },
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
  function recipeSeason(recipe, month, region = 'france') {
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('Mois attendu entre 1 et 12');
    if (!Object.hasOwn(seasonCalendars, region)) throw new RangeError('Calendrier de saison inconnu');
    const months = regionalCalendars[region] || calendar;
    const names = [...new Set((recipe.ingredients || []).map(item => freshProduce(item.name)).filter(Boolean))];
    const inSeason = names.filter(name => months[name].includes(month));
    const outOfSeason = names.filter(name => !months[name].includes(month));
    return { matches: inSeason.length > 0 && outOfSeason.length === 0, inSeason, outOfSeason };
  }
  return { recipeSeason, freshProduce, seasonCalendars };
});
