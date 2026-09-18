// Only explicit aliases are merged: "tomate" and "tomate concassée" remain distinct.
const aliases = { oeufs: 'œuf', oeuf: 'œuf', œufs: 'œuf', tomates: 'tomate', courgettes: 'courgette', carottes: 'carotte', oignons: 'oignon', citrons: 'citron', pommes: 'pomme', 'pommes de terre': 'pomme de terre' };
function foodName(name) {
  const value = name.trim().toLocaleLowerCase('fr').replace(/\s+/g, ' ');
  return aliases[value] || value;
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
module.exports = { foodName, foodKey, unitInfo, inUnit, groupIngredients };
