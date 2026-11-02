(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MangerMenu = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function dayKey(start, day) {
    const date = new Date(start + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + day);
    return date.toISOString().slice(0, 10);
  }
  function availableSlots(start, meals) {
    return ['soir', 'midi'].flatMap(slot => Array.from({ length: 7 }, (_, day) => ({ day, slot })))
      .filter(item => !meals.some(meal => meal.date === dayKey(start, item.day) && meal.slot === item.slot));
  }
  function planPayload({ start, rows, recipes, members, meals }) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 14) throw new Error('Choisis entre une et quatorze recettes.');
    const groups = new Map(), rank = { vegan: 0, vegetarian: 1, pescetarian: 2, omnivore: 3 };
    for (const row of rows) {
      if (!Number.isInteger(row.day) || row.day < 0 || row.day > 6 || !['midi', 'soir'].includes(row.slot)) throw new Error('Choisis un jour et un créneau valides.');
      const date = dayKey(start, row.day), recipe = recipes.find(item => item.id === row.recipeId);
      if (!recipe) throw new Error('Une recette manque. Recharge le catalogue.');
      if (meals.some(meal => meal.date === date && meal.slot === row.slot)) throw new Error('Ce repas est déjà prévu. Choisis un autre créneau.');
      const ids = row.memberIds;
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => !members.some(member => member.id === id))) throw new Error('Participants inconnus.');
      if (members.length && !ids.length) throw new Error('Choisis au moins un participant par recette.');
      if (ids.some(id => rank[recipe.diet] > rank[members.find(member => member.id === id).diet])) throw new Error('Cette recette ne convient pas au régime des participants.');
      if (!Number.isInteger(row.people) || row.people < (ids.length || 1) || row.people > 100 || (ids.length && (row.people % ids.length || row.people / ids.length > 20))) throw new Error('Ajuste les portions pour les participants.');
      const key = date + '/' + row.slot;
      if (!groups.has(key)) groups.set(key, { date, slot: row.slot, location: 'home', occasion: 'regular', title: recipe.title, people: 0, recipeId: ids.length ? null : recipe.id, assignments: [], dishes: [] });
      const meal = groups.get(key);
      if (meal.people && (!ids.length || meal.recipeId !== null)) throw new Error('Utilise des profils pour plusieurs plats ou choisis un autre repas.');
      if (ids.some(id => meal.dishes.some(dish => dish.memberId === id))) throw new Error('Une personne a deux plats au même repas. Ajuste les participants ou le jour.');
      if (meal.people) meal.title = 'Un plat par personne';
      meal.people += row.people;
      if (meal.people > 100) throw new Error('Limite de 100 portions par repas.');
      meal.dishes.push(...ids.map(memberId => ({ memberId, recipeId: recipe.id, portions: row.people / ids.length })));
    }
    return { start, meals: [...groups.values()] };
  }
  function create(config) {
    const dialog = config.dialog, e = config.escape, icon = config.icon;
    let start, criteria, rows = [], phase = 'menu', pickerIndex = null, busy = false, saved = false, uncertain = false, pendingPlan = null, version = 0, error = '';
    const data = () => config.state();
    const free = () => availableSlots(start, data().meals);
    const candidates = () => config.candidates(criteria);
    const recipeFor = row => data().recipes.find(recipe => recipe.id === row.recipeId);
    const button = (action, label, style = 'secondary', extra = '') => `<button type="button" class="${style}" data-menu-action="${action}" ${extra}>${label}</button>`;
    const dateLabel = day => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(dayKey(start, day) + 'T12:00:00Z'));

    function controls() {
      const group = data().members.length ? data().members.map(member => `<label><input type="checkbox" data-menu-member="${member.id}"${criteria.memberIds.includes(member.id) ? ' checked' : ''}><span>${e(member.name)}</span></label>`).join('') : `<label class="field"><span>Personnes</span><input data-menu-people type="number" min="1" max="100" value="${criteria.people}"></label>`;
      const duration = criteria.maxMinutes === 1440 ? 'Toutes les durées' : `${criteria.maxMinutes} min max`;
      return `<details class="menu-preferences"><summary>${icon('people')} ${criteria.memberIds.length || criteria.people} personnes <span>· ${duration}</span></summary><div class="menu-preferences-body"><div class="category-options">${group}</div><label class="field"><span>Temps par recette</span><select data-menu-minutes>${[15, 30, 45, 60, 1440].map(n => `<option value="${n}"${n === criteria.maxMinutes ? ' selected' : ''}>${n === 1440 ? 'Toutes les durées' : n + ' min'}</option>`).join('')}</select></label>${button('criteria', 'Actualiser les propositions')}</div></details>`;
    }
    function portions(row, index) {
      const step = row.memberIds.length || 1, maximum = row.memberIds.length ? Math.min(100, 20 * step) : 100;
      return `<label class="menu-portions"><span class="menu-portions-caption" aria-hidden="true">Portions</span><input type="number" data-menu-portions="${index}" min="${step}" max="${maximum}" step="${step}" value="${row.people}" aria-label="Portions pour ${e(recipeFor(row)?.title || 'ce plat')}"></label>`;
    }
    function menuRows() {
      return rows.map((row, index) => {
        const recipe = recipeFor(row);
        if (!recipe) return `<article class="menu-recipe"><p class="error">Une recette manque.</p>${button('remove', 'Retirer ce plat', 'secondary', `data-menu-index="${index}"`)}</article>`;
        const notice = config.notice(recipe, criteria);
        return `<article class="menu-recipe"><div class="menu-recipe-top"><div class="menu-cover">${config.cover(recipe)}</div><div class="menu-recipe-copy"><h3>${e(recipe.title)}</h3><span class="menu-duration">${icon('clock')} ${recipe.minutes} min</span>${notice ? `<p class="muted menu-taste">${e(notice)}</p>` : ''}</div></div><div class="menu-row-actions">${button('replace', 'Remplacer', 'secondary', `data-menu-index="${index}"`)}${portions(row, index)}${button('remove', icon('trash'), 'icon-button', `data-menu-index="${index}" aria-label="Retirer ${e(recipe.title)}"`)}</div></article>`;
      }).join('');
    }
    function placements() {
      return rows.map((row, index) => {
        const recipe = recipeFor(row);
        if (!recipe) return '<p class="error">Une recette manque. Reviens au menu pour la retirer.</p>';
        const participants = data().members.length ? `<details class="menu-participants"><summary>Pour ${row.memberIds.map(id => e(data().members.find(member => member.id === id)?.name || '')).join(', ') || 'qui ?'}</summary><div class="category-options">${data().members.filter(member => criteria.memberIds.includes(member.id)).map(member => `<label><input type="checkbox" data-menu-person="${index}" value="${member.id}"${row.memberIds.includes(member.id) ? ' checked' : ''}><span>${e(member.name)}</span></label>`).join('')}</div></details>` : '';
        return `<article class="menu-placement"><div class="menu-placement-title"><div class="menu-cover">${config.cover(recipe)}</div><h3>${e(recipe.title)}</h3></div><div class="menu-placement-fields"><label class="field"><span>Jour</span><select data-menu-day="${index}" aria-label="Jour pour ${e(recipe.title)}">${Array.from({ length: 7 }, (_, day) => `<option value="${day}"${row.day === day ? ' selected' : ''}>${e(dateLabel(day))}</option>`).join('')}</select></label><label class="field"><span>Repas</span><select data-menu-slot="${index}" aria-label="Repas pour ${e(recipe.title)}"><option value="midi"${row.slot === 'midi' ? ' selected' : ''}>Midi</option><option value="soir"${row.slot === 'soir' ? ' selected' : ''}>Soir</option></select></label></div>${participants}<div class="menu-placement-portions">${portions(row, index)}<span class="muted">${row.memberIds.length > 1 ? row.people / row.memberIds.length + ' par personne' : ''}</span></div></article>`;
      }).join('');
    }
    function render(focusHeading = false) {
      const picking = phase === 'picker', placing = phase === 'days';
      const title = picking ? pickerIndex === rows.length ? 'Ajouter une recette' : 'Remplacer ce plat' : placing ? 'Les jours de ton menu' : 'Mon menu';
      const subtitle = saved ? 'Ton menu est enregistré.' : picking ? 'Un plat, un ingrédient…' : placing ? 'Plusieurs plats par jour, à ton rythme.' : 'Choisis les plats qui te font envie.';
      const body = picking ? '<label class="recipe-search-field"><span class="sr-only">Chercher une recette</span><input id="menu-search" type="search" placeholder="Un plat, un ingrédient…" autocomplete="off"></label><div id="menu-search-results" class="menu-search-results"></div>'
        : placing ? `<p class="muted menu-intro">Choisis midi ou soir. Pour des plats différents au même repas, ajuste les participants.</p>${placements()}`
          : `${controls()}<div class="menu-count"><strong>${rows.length} recette${rows.length === 1 ? '' : 's'}</strong><span class="muted">Ton menu, à ajuster</span></div>${menuRows()}${rows.length < free().length ? button('add', icon('plus') + ' Ajouter une recette', 'menu-add') : '<p class="muted">Le menu atteint le nombre de repas libres de cette semaine.</p>'}`;
      const action = saved ? 'refresh' : uncertain ? 'check' : placing ? 'save' : 'days';
      const label = saved ? 'Afficher les courses' : uncertain ? 'Vérifier le planning' : placing ? 'Créer la liste de courses' : 'Choisir les jours';
      dialog.innerHTML = `<div class="menu-shell"><header class="menu-header">${button('back', icon('back'), 'icon-button', 'aria-label="Retour"')}<div><h2 id="menu-title" tabindex="-1">${title}</h2><p id="menu-subtitle" class="muted" role="status">${subtitle}</p></div>${button('close', icon('close'), 'icon-button', 'aria-label="Fermer le menu"')}</header><fieldset class="menu-body" id="menu-body" aria-label="Contenu du menu"${saved || uncertain ? ' disabled' : ''}>${body}</fieldset><footer class="menu-footer"><p id="menu-error" class="error" role="alert"${error ? '' : ' hidden'}>${e(error)}</p>${picking ? '' : button(action, label, 'primary', rows.length ? '' : 'disabled')}<span class="menu-save-status muted" role="status">${busy ? 'Préparation du menu…' : !saved && !uncertain && !picking ? 'Aucun changement avant la création des courses.' : ''}</span></footer></div>`;
      lock(busy);
      if (picking) { search(''); dialog.querySelector('#menu-search').focus(); }
      else if (focusHeading) dialog.querySelector('#menu-title').focus({ preventScroll: true });
    }
    function lock(value) {
      dialog.querySelectorAll('button, input, select').forEach(node => { if (value) { node.dataset.menuDisabled = String(node.disabled); node.disabled = true; } else if (node.dataset.menuDisabled !== undefined) { node.disabled = node.dataset.menuDisabled === 'true'; delete node.dataset.menuDisabled; } });
      dialog.setAttribute('aria-busy', String(value));
    }
    function showError(message) {
      error = message;
      const node = dialog.querySelector('#menu-error');
      if (node) { node.textContent = message; node.hidden = !message; }
    }
    function search(query) {
      const list = config.search(candidates(), query);
      dialog.querySelector('#menu-search-results').innerHTML = `<p class="muted" role="status">${list.length} recette${list.length === 1 ? '' : 's'}</p>` + list.slice(0, 80).map(recipe => `<button type="button" class="menu-search-recipe" data-menu-action="pick" data-menu-recipe="${recipe.id}"><span class="menu-cover">${config.cover(recipe)}</span><span><strong>${e(recipe.title)}</strong><small class="muted">${recipe.minutes} min</small></span>${icon('plus')}</button>`).join('') + (!list.length ? '<p class="empty-state">Aucun résultat avec ces critères. Tu peux changer le temps disponible dans ton menu.</p>' : list.length > 80 ? '<p class="muted">Précise ta recherche pour voir les autres recettes.</p>' : '');
    }
    async function propose(count, override = null, nextCriteria = criteria) {
      if (busy) return;
      const slots = free().slice(0, count), request = ++version, previousPhase = phase;
      if (!slots.length) { showError('Cette semaine est complète. Choisis une autre semaine dans le calendrier.'); return; }
      if (data().members.length && !nextCriteria.memberIds.length) { showError('Choisis au moins une personne.'); return; }
      if (!Number.isInteger(nextCriteria.people) || nextCriteria.people < 1 || nextCriteria.people > 100) { showError('Choisis un nombre de personnes valide.'); return; }
      const reset = nextCriteria !== criteria;
      const payload = { start, ...nextCriteria, slots: slots.map((item, index) => ({ ...item, ...(!reset && rows[index] && (override || rows[index].pinned) ? { recipeId: rows[index].recipeId } : {}), ...(override?.index === index ? { recipeId: override.recipeId } : {}) })) };
      busy = true; showError(''); lock(true);
      dialog.querySelector('.menu-save-status').textContent = 'Composition du menu…';
      try {
        const choices = await config.api('/api/week/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
        if (request !== version || !dialog.open) return;
        const allowed = config.candidates(nextCriteria);
        if (!Array.isArray(choices) || choices.length !== slots.length) throw new Error('Proposition incomplète. Réessaie.');
        const next = slots.map((slot, index) => {
          const choice = choices.find(item => item.day === slot.day && item.slot === slot.slot);
          if (!choice || !allowed.some(recipe => recipe.id === choice.recipeId)) throw new Error('Le catalogue a changé. Recharge la page avant de poursuivre.');
          const old = !reset && rows[index];
          return { ...(old || { ...slot, people: nextCriteria.people, memberIds: [...nextCriteria.memberIds] }), recipeId: choice.recipeId, pinned: Boolean(old?.pinned || override?.index === index) };
        });
        rows = next; criteria = nextCriteria; phase = 'menu';
      } catch (failure) {
        if (request !== version || !dialog.open) return;
        phase = previousPhase;
        error = failure.name === 'TimeoutError' ? 'La proposition prend trop de temps. Ton menu est conservé, aucun repas enregistré.' : failure.name === 'TypeError' ? 'Connexion indisponible. Ton menu est conservé, aucun repas enregistré.' : failure.message;
      } finally {
        busy = false;
        if (request === version && dialog.open) render();
      }
    }
    function currentPlan() {
      const { recipes, members, meals } = data();
      return planPayload({ start, rows, recipes, members, meals });
    }
    async function refreshCourses() {
      if (busy) return;
      busy = true; lock(true);
      try {
        const loaded = await config.reload();
        if (loaded === false) throw new Error('Les données ne sont pas accessibles. Réessaie : le menu ne sera pas renvoyé.');
        if (uncertain) {
          const expected = pendingPlan;
          const found = expected.meals.every(meal => data().meals.some(item => item.date === meal.date && item.slot === meal.slot && item.people === meal.people && item.recipeId === meal.recipeId && JSON.stringify((item.dishes || []).map(({ memberId, recipeId, portions }) => ({ memberId, recipeId, portions })).sort((a, b) => a.memberId - b.memberId)) === JSON.stringify([...meal.dishes].sort((a, b) => a.memberId - b.memberId))));
          uncertain = false;
          if (!found) { showError('Le menu n’est pas retrouvé tel quel. Vérifie les jours avant de créer les courses.'); return; }
          saved = true;
        }
        dialog.close(); config.courses();
        rows = []; saved = false; pendingPlan = null; phase = 'menu'; error = '';
      } catch (failure) { error = failure.message; }
      finally { busy = false; if (dialog.open) render(); }
    }
    async function save() {
      if (busy || saved || uncertain) return;
      let payload;
      try { payload = currentPlan(); } catch (failure) { showError(failure.message); return; }
      pendingPlan = payload;
      busy = true; showError(''); lock(true);
      dialog.querySelector('.menu-save-status').textContent = 'Création des courses…';
      try {
        let response;
        try { response = await config.fetch('/api/week/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) }); }
        catch { uncertain = true; throw new Error('Confirmation perdue. Ton menu est conservé ; vérifie le planning avant tout nouvel envoi.'); }
        if (!response.ok) {
          if (response.status >= 500) uncertain = true;
          throw new Error((await response.json().catch(() => ({}))).error || 'Création refusée. Ton menu est conservé.');
        }
        saved = true;
      } catch (failure) { error = failure.message; }
      finally { busy = false; if (dialog.open) render(); }
      if (saved) await refreshCourses();
    }
    function change(event) {
      if (busy || saved || uncertain) return;
      const node = event.target, d = node.dataset;
      if (d.menuPortions !== undefined) {
        const row = rows[Number(d.menuPortions)]; row.people = Number(node.value);
        const note = node.closest('.menu-placement-portions')?.querySelector('.muted');
        if (note) note.textContent = row.memberIds.length > 1 && Number.isInteger(row.people / row.memberIds.length) ? row.people / row.memberIds.length + ' par personne' : '';
      }
      if (d.menuDay !== undefined) rows[Number(d.menuDay)].day = Number(node.value);
      if (d.menuSlot !== undefined) rows[Number(d.menuSlot)].slot = node.value;
      if (d.menuPerson !== undefined) {
        const row = rows[Number(d.menuPerson)], perPerson = row.people / (row.memberIds.length || 1);
        row.memberIds = [...dialog.querySelectorAll(`[data-menu-person="${d.menuPerson}"]:checked`)].map(input => Number(input.value));
        row.people = Math.max(1, row.memberIds.length) * perPerson;
      }
      showError('');
      if (d.menuPerson !== undefined) render();
    }
    async function click(event) {
      const node = event.target.closest('[data-menu-action]');
      if (!node || node.disabled || busy) return;
      const action = node.dataset.menuAction, index = Number(node.dataset.menuIndex);
      if (saved || uncertain) { if (action === 'refresh' || action === 'check') await refreshCourses(); else if (action === 'close' || action === 'back') dialog.close(); return; }
      if (action === 'close') dialog.close();
      if (action === 'back') { if (phase === 'menu') dialog.close(); else { phase = 'menu'; error = ''; render(true); } }
      if (action === 'remove') { rows.splice(index, 1); render(); }
      if (action === 'replace' || action === 'add') { pickerIndex = action === 'add' ? rows.length : index; phase = 'picker'; error = ''; render(); }
      if (action === 'pick') await propose(Math.max(rows.length, pickerIndex + 1), { index: pickerIndex, recipeId: Number(node.dataset.menuRecipe) });
      if (action === 'days') { if (!rows.length) return; phase = 'days'; error = ''; render(true); }
      if (action === 'criteria') {
        const ids = [...dialog.querySelectorAll('[data-menu-member]:checked')].map(input => Number(input.dataset.menuMember));
        await propose(rows.length || Math.min(5, free().length), null, { memberIds: ids, people: ids.length || Number(dialog.querySelector('[data-menu-people]')?.value), maxMinutes: Number(dialog.querySelector('[data-menu-minutes]').value) });
      }
      if (action === 'save') await save();
    }
    dialog.addEventListener('click', click);
    dialog.addEventListener('change', change);
    dialog.addEventListener('input', event => { if (event.target.id === 'menu-search' && !busy) search(event.target.value); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { version++; });
    async function open(weekStart) {
      if (busy) return;
      if (start !== weekStart) {
        start = weekStart; rows = []; saved = false; uncertain = false; pendingPlan = null; phase = 'menu'; error = '';
        criteria = { memberIds: data().members.map(member => member.id), people: data().members.length || 2, maxMinutes: 30 };
      }
      render(); if (!dialog.open) dialog.showModal();
      if (!rows.length) await propose(Math.min(5, free().length));
    }
    return { open };
  }
  return { availableSlots, planPayload, create };
});
