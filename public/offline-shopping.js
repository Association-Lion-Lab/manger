(function (root) {
  const KEY = 'manger-shopping-offline-v1';
  function read(storage) {
    const raw = storage.getItem(KEY);
    if (raw === null) return null;
    if (raw.length > 1000000) throw new Error('Copie de courses trop volumineuse.');
    const copy = JSON.parse(raw);
    if (!copy || !Array.isArray(copy.items) || copy.items.length > 2000
      || copy.items.some(item => !item || typeof item.text !== 'string' || typeof item.checked !== 'boolean')) throw new Error('Copie de courses invalide.');
    if (copy.version === 2 && (!/^\d{4}-\d{2}-\d{2}$/.test(copy.week)
      || copy.items.some(item => typeof item.name !== 'string' || !item.name || item.name.length > 80
        || typeof item.unit !== 'string' || !item.unit || item.unit.length > 24
        || !Number.isFinite(item.amount) || item.amount <= 0 || typeof item.baseChecked !== 'boolean'
        || (item.manualId != null && (!Number.isSafeInteger(item.manualId) || item.manualId < 1))))) throw new Error('Copie de courses invalide.');
    return copy;
  }
  // ponytail: additive sync only. Offline unchecks stay local, never undo another person's purchase.
  function pending(copy) {
    return copy?.version === 2 ? copy.items.flatMap((item, index) => item.checked && !item.baseChecked ? [{ index, item }] : []) : [];
  }
  function capture(storage, week, items) {
    if (pending(read(storage)).length) return false; // Preserve purchases even when browsing another week.
    const copy = { version: 2, week, savedAt: new Date().toISOString(), items: items.map(item => ({
      text: item.text, name: item.name, amount: item.amount, unit: item.unit, manualId: item.manualId ?? null,
      checked: item.checked, baseChecked: item.checked
    })) };
    storage.setItem(KEY, JSON.stringify(copy));
    return true;
  }
  function acknowledge(storage, revision, indexes) {
    if (storage.getItem(KEY) !== revision) throw new Error('La copie a changé dans un autre onglet. Vérifie les coches avant de réessayer.');
    const copy = read(storage);
    if (copy?.version !== 2 || !Array.isArray(indexes) || indexes.some(index => !Number.isInteger(index) || !copy.items[index])) throw new Error('Confirmation des courses invalide.');
    for (const index of indexes) copy.items[index].baseChecked = true;
    storage.setItem(KEY, JSON.stringify(copy));
  }
  const api = { KEY, read, pending, capture, acknowledge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.offlineShopping = api;
})(globalThis);
