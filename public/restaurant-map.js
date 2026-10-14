(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MangerRestaurantMap = api;
})(globalThis, function (root) {
  function normalized(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim(); }
  function searchRestaurants(restaurants, query) {
    const text = normalized(query);
    return restaurants.filter(place => place && typeof place.name === 'string' && place.name.trim() && normalized(place.name + ' ' + (place.cuisine || '')).includes(text));
  }
  function validPosition(place) {
    return Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90 && Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180;
  }
  function node(tag, className, text) {
    const element = root.document.createElement(tag); element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function mount(container, { restaurants, latitude, longitude, origin }, onChoose) {
    const places = searchRestaurants(restaurants, '');
    container.replaceChildren();
    if (!places.length) { container.append(node('p', 'muted', 'Aucun restaurant référencé dans un rayon de 3 km. Tu peux saisir son nom dans le champ Nom.')); return { destroy() {} }; }
    container.setAttribute('aria-live', 'off');
    const scope = node('p', 'muted', `À moins de 3 km de ${origin}`);
    const label = node('label', 'field'); label.append(node('span', '', 'Chercher dans cette zone'));
    const input = node('input', ''); input.type = 'search'; input.placeholder = 'Nom ou cuisine…'; input.maxLength = 100; label.append(input);
    const mapNode = node('div', 'restaurant-map'); mapNode.setAttribute('aria-label', 'Carte des restaurants. Une liste est disponible sous la fiche.');
    const warning = node('p', 'muted'); warning.setAttribute('role', 'status'); warning.hidden = true;
    const count = node('p', 'muted'); count.setAttribute('role', 'status');
    const card = node('div', 'restaurant-card'); card.setAttribute('aria-live', 'polite');
    const details = node('details', 'restaurant-list'); details.append(node('summary', '', 'Voir les résultats en liste'));
    const list = node('div', ''); details.append(list);
    const hint = node('p', 'muted', 'Restaurant absent ? Renseigne son nom dans le champ Nom, puis ajoute le repas au calendrier.');
    container.append(scope, label, mapNode, warning, count, card, details, hint);
    let active = true, map = null, layers = null, observer = null, selected = places[0];
    function choose(place) {
      if (!active || container.closest('fieldset')?.disabled) return;
      onChoose(place); card.querySelector('button').textContent = 'Restaurant choisi ✓';
    }
    function select(place) {
      if (container.closest('fieldset')?.disabled) return;
      selected = place; render(); card.querySelector('button')?.focus({ preventScroll: true });
    }
    function renderCard(place) {
      card.replaceChildren(); card.hidden = !place;
      if (!place) return;
      card.append(node('strong', '', place.name));
      const distance = Number.isFinite(place.distance) ? `${place.distance} m` : '';
      card.append(node('p', 'muted', [place.cuisine, distance].filter(Boolean).join(' · ')));
      if (place.address) card.append(node('p', 'muted', String(place.address)));
      const button = node('button', 'primary', 'Choisir ce restaurant'); button.type = 'button'; button.onclick = () => choose(place); card.append(button);
    }
    function render() {
      const visible = searchRestaurants(places, input.value);
      if (!visible.includes(selected)) selected = visible[0] || null;
      count.textContent = visible.length ? `${visible.length} restaurant${visible.length > 1 ? 's' : ''} dans cette zone` : 'Aucun résultat. Change le nom recherché ou saisis le restaurant manuellement.';
      renderCard(selected); list.replaceChildren(); layers?.clearLayers();
      visible.forEach(place => {
        const index = places.indexOf(place) + 1;
        const button = node('button', 'restaurant-list-item', `${index} · ${place.name}`); button.type = 'button'; button.onclick = () => select(place); list.append(button);
        if (!map || !validPosition(place)) return;
        const marker = root.L.marker([place.latitude, place.longitude], { title: place.name, keyboard: true, icon: root.L.divIcon({ className: 'restaurant-pin' + (place === selected ? ' selected' : ''), html: String(index), iconSize: [44, 44], iconAnchor: [22, 22] }) }).addTo(layers);
        const control = marker.getElement(); control.setAttribute('aria-label', place.name); control.setAttribute('aria-pressed', String(place === selected));
        control.addEventListener('keydown', event => { if (event.key === ' ') { event.preventDefault(); select(place); } });
        marker.on('click', () => select(place));
      });
    }
    function fallback(message) { if (!active) return; warning.textContent = message; warning.hidden = false; details.open = true; }
    try {
      if (!root.L || !places.some(validPosition)) throw new Error('Carte indisponible');
      map = root.L.map(mapNode, { scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, inertia: false }).setView([latitude, longitude], 14);
      map.attributionControl.setPrefix(false);
      layers = root.L.layerGroup().addTo(map);
      root.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">contributeurs OpenStreetMap</a>' }).on('tileerror', () => fallback('Le fond de carte ne se charge pas complètement. Utilise la liste ou saisis un nom.')).addTo(map);
      const points = places.filter(validPosition).map(place => [place.latitude, place.longitude]);
      map.fitBounds(points, { padding: [32, 32], maxZoom: 16, animate: false });
      mapNode.querySelector('.leaflet-control-zoom-in').setAttribute('aria-label', 'Agrandir la carte');
      mapNode.querySelector('.leaflet-control-zoom-out').setAttribute('aria-label', 'Réduire la carte');
      if (root.ResizeObserver) { observer = new root.ResizeObserver(() => { if (active) map.invalidateSize({ pan: false, animate: false }); }); observer.observe(mapNode); }
    } catch { map?.remove(); map = null; layers = null; mapNode.hidden = true; fallback('Carte indisponible. Choisis dans la liste ou renseigne le nom du restaurant.'); }
    input.addEventListener('input', render); render();
    return { destroy() { active = false; observer?.disconnect(); map?.remove(); input.removeEventListener('input', render); } };
  }
  return { searchRestaurants, validPosition, mount };
});
