(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MangerIcons = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    left: '<path d="m14 6-6 6 6 6"/>',
    right: '<path d="m10 6 6 6-6 6"/>',
    back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
    share: '<path d="M12 15V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/>',
    heart: '<path d="M20.5 5.5a5 5 0 0 0-7.1 0L12 7l-1.4-1.5a5 5 0 0 0-7.1 7.1L12 21l8.5-8.4a5 5 0 0 0 0-7.1Z"/>',
    pot: '<path d="M5 11h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Zm-3 2h3m14 0h3M4 8h16M9 5V3m6 2V3"/>',
    location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
    plates: '<circle cx="7" cy="12" r="4"/><circle cx="17" cy="12" r="4"/>',
    book: '<path d="M12 6v15M3 4c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2Z"/>',
    leftovers: '<rect x="4" y="9" width="16" height="12" rx="3"/><path d="M3 9h18M8 5h8m-4-3v5"/>',
    move: '<path d="M3 8h16m-4-4 4 4-4 4M21 16H5m4-4-4 4 4 4"/>',
    refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
    bag: '<path d="M5 8h14l1 13H4ZM9 8V6a3 3 0 0 1 6 0v2"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    template: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    leaf: '<path d="M20 3C8 3 3 8 5 15s15 6 15-12ZM4 21 15 10"/>',
    sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
    coins: '<circle cx="9" cy="9" r="6"/><path d="M15 9a6 6 0 1 1-6 6M9 6v6m-2-4h4"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',
    box: '<path d="m3 7 9-4 9 4-9 4ZM3 7v10l9 4 9-4V7M12 11v10"/>',
    bread: '<path d="M5 20V9a7 7 0 0 1 14 0v11ZM9 7l2 3m2-4 2 3"/>',
    chef: '<path d="M7 15a5 5 0 0 1-2-9 5 5 0 0 1 9-2 4 4 0 1 1 3 8v9H7ZM7 17h10"/>',
    cup: '<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Zm13 1h2a3 3 0 0 1 0 6h-2M7 5V3m5 2V3M3 22h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    bowl: '<path d="M3 13h18a9 9 0 0 1-18 0ZM7 22h10M5 6l13-3M5 9l13-3"/>',
    palette: '<path d="M21 12a9 9 0 1 0-9 9h2a2 2 0 0 0 1-4c-1-1 0-3 2-3h2a2 2 0 0 0 2-2Z"/><circle cx="7" cy="10" r=".8"/><circle cx="10" cy="6" r=".8"/><circle cx="15" cy="7" r=".8"/>',
    moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const aliases = { '♨': 'pot', '⌖': 'location', '♥': 'heart', '♡': 'heart', '★': 'heart', '×': 'trash', '⋈': 'plates', '◉': 'book', '♻': 'leftovers', '↔': 'move', '↻': 'refresh', '⌁': 'bag', '○': 'circle', '▤': 'template' };
  const categories = { __favorites: 'heart', rat: 'coins', date: 'heart', mijote: 'pot', japon: 'bowl', chine: 'bowl', terroir: 'bread', chef: 'chef', express: 'bolt', batch: 'box', emporter: 'bag', comfort: 'cup', mediterranee: 'sun', italie: 'bowl', inde: 'pot', mexique: 'bowl' };
  function icon(name) {
    const resolved = Object.hasOwn(aliases, name) ? aliases[name] : name;
    const key = Object.hasOwn(paths, resolved) ? resolved : 'circle';
    return `<svg class="ui-icon" data-ui-name="${key}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[key]}</svg>`;
  }
  function categoryIcon(key) { return icon(Object.hasOwn(categories, key) ? categories[key] : 'book'); }
  return { icon, categoryIcon };
});
