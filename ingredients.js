const { foodName } = require('./public/food-names');
// Ranking only: these staples still count in recipes, stock reservations and shopping.
function isAntiWasteIngredient(name) {
  const value = foodName(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/’/g, "'");
  if (/^(?:sels?|poivres?|huiles?|beurres?|vinaigres?|sucres?|farines?)(?:\s|$)/.test(value)) return false;
  if (/^(?:eau|eau du robinet|moutarde|ketchup|mayonnaise|sauce soja|sauce de soja|sauce soya|sauce nuoc mam|herbes de provence|bouillon en cube|cube de bouillon|cubes de bouillon)$/.test(value)) return false;
  if (/^(?:epices?|cumin|paprika|curry|curcuma|cannelle|muscade|noix de muscade|garam masala|ras el hanout|quatre epices|quatre-epices|piment doux|piment d'espelette|safran|clous? de girofle)(?:\s+(?:moulu[es]*|en poudre|fume[es]*|en grains?|en poudre fumee))*$/.test(value)) return false;
  if (/^(?:ail|oignons?|gingembre|piments?|persil|basilic|coriandre|thym|origan|romarin|aneth|ciboulette|menthe|laurier)(?:\s+(?:en poudre|seche?s?|deshydrate[es]*|lyophilise[es]*|en flocons))+$/.test(value)) return false;
  return true;
}
function unitInfo(unit) {
  const value = unit.trim().toLocaleLowerCase('fr');
  const units = { g: ['g', 1], gramme: ['g', 1], grammes: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], cl: ['ml', 10], dl: ['ml', 100], l: ['ml', 1000], litre: ['ml', 1000], litres: ['ml', 1000], pièce: ['pièce', 1], pièces: ['pièce', 1] };
  return units[value] || [value, 1];
}
function foodKey(item) { return `${foodName(item.name)}\0${unitInfo(item.unit)[0]}`; }
function inUnit(item, unit) { return unitInfo(item.unit)[0] === unitInfo(unit)[0] ? item.amount * unitInfo(item.unit)[1] / unitInfo(unit)[1] : 0; }
function groupIngredients(items) {
  const groups = new Map();
  for (const item of items) {
    const key = foodKey(item); const existing = groups.get(key);
    if (!existing) groups.set(key, { ...item, name: foodName(item.name) });
    else {
      const unit = existing.unit === item.unit ? existing.unit : unitInfo(item.unit)[0];
      existing.amount = inUnit(existing, unit) + inUnit(item, unit); existing.unit = unit;
    }
  }
  return [...groups.values()].map(item => ({ ...item, amount: Math.round(item.amount * 100) / 100 }));
}
module.exports = { foodName, foodKey, unitInfo, inUnit, groupIngredients, isAntiWasteIngredient };
