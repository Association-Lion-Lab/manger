# Intégration FDL, partie C : côté Manger!

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un administrateur de Manger! relie l'instance à un compte FDL (OAuth 2.0 + PKCE). Le foyer cherche et importe des recettes FDL. Manger! vérifie chaque jour les copies importées : il propose les nouvelles versions et vide les copies retirées par la modération.

**Architecture:** Un stockage `fdl` en deux variantes, comme les autres (`db/fdl-sqlite.js`, `db/fdl.js` pour PostgreSQL), avec trois tables. Un module `fdl.js` (configuration, PKCE, appels HTTP vers FDL, conversion d'une recette FDL) et un fichier de routes `fdl-http.js` sous `/api/fdl/`, branché dans les deux serveurs (SQLite `server.js`, PostgreSQL `postgres-app.js`). Une vérification quotidienne en tâche de fond. L'interface reste dans `public/index.html`.

**Tech Stack:** Node.js >= 24 (CommonJS), `node:sqlite`, PostgreSQL via `pg`, `node:test`, `fetch` et `node:crypto` intégrés. Aucune nouvelle dépendance.

**Spec:** `C:\Users\Neckr\Documents\Codex\2026-10-15\fdl\work\FDL\docs\superpowers\specs\2026-10-27-fdl-cahier-des-charges-design.md` (section 8) et `C:\Users\Neckr\Documents\Codex\2026-10-15\fdl\work\FDL\docs\CONTRATS.md` (sections « Projection compatible avec Manger! », « API Manger! (`/api/v1`) », « Liaison Manger! (OAuth 2.0 + PKCE) »). FDL est déjà livré (parties A et B, branche `development` de FDL).

Décisions prises pour ce plan (choix Claude, à écrire dans `docs/DECISIONS.md` au format du dépôt) :

- **Une liaison par instance**, faite et défaite par un administrateur dans « Mon foyer ». Tous les membres cherchent et importent avec elle. Les recettes privées du compte FDL relié deviennent visibles du foyer (la page de consentement FDL l'annonce).
- **Adresse de FDL** : variable d'environnement `MANGER_FDL_URL` (origine `http(s)` nue). Sans elle, toute la fonction est masquée et `/api/fdl/*` répond `404`.
- **`client_id` = origine de l'instance**, déduite de la requête de l'administrateur : `https` si la connexion est chiffrée (`request.socket.encrypted`), sinon `http`, plus l'en-tête `Host`. `redirect_uri` = cette origine + `/api/fdl/retour`.
- **Retour sans session.** Le cookie `manger_session` est `SameSite=Strict` : il n'accompagne pas le retour depuis FDL. `/api/fdl/retour` est donc public. Il ne s'appuie que sur le `state` (32 octets aléatoires, gardé en mémoire 10 minutes, à usage unique, créé par un administrateur connecté). Il répond par une petite page HTML qui renvoie vers `/` : cette seconde navigation, partie de Manger!, porte le cookie.
- **Conversion FDL vers Manger!** : `title`, `minutes`, `servings`, `diet`, `tags`, `ingredients` (unité vide → `pièce`), `steps`, `sourceUrl` = `url` de FDL (page de la recette). Les saisons, l'auteur et la licence ne sont pas copiés. La recette passe ensuite par `validateRecipe` comme une saisie locale.
- **Copie modifiée** : toute modification locale (`PUT /api/recipes/:id`) d'une copie la marque `modified`. Une mise à jour FDL reste proposée, avec l'avertissement que les changements locaux seront perdus.
- **Retrait par la modération (`removed`)** : la copie est supprimée si aucun repas ne l'utilise. Sinon (`meal_dishes` interdit la suppression), elle est vidée : titre « Recette retirée de FDL », une seule étape « Recette retirée par la modération de FDL. », un seul ingrédient `retiré` 1 `pièce`, sans photo, ni note, ni favori. Les repas gardent leur titre. Dans les deux cas, un avis « « {titre} » a été retirée de FDL par la modération. » s'affiche au foyer jusqu'à ce qu'un membre le ferme. `not_found`, une panne ou un état inconnu ne changent rien (spec 13).
- **Vérification** : 1 minute après le démarrage, puis toutes les 24 heures, et juste après une liaison. Elle se fait par lots de 100 sur `GET /api/v1/etat`. Une panne de FDL est ignorée jusqu'au tour suivant.
- **Sauvegardes et transfert** : la sauvegarde SQLite (fichier complet) garde tout. La sauvegarde de foyer PostgreSQL (format `manger-household` v1) et le transfert SQLite vers PostgreSQL **ignorent** les tables `fdl_*` : après une restauration ou un transfert, les recettes restent mais redeviennent des recettes ordinaires, et il faut relier FDL à nouveau. Limite connue, écrite dans la doc.
- Hors plan : bouton « Importer dans Manger! » sur le site FDL, import sans compte FDL (après la bêta), photos (spec 13), révocation du jeton côté FDL depuis Manger! (« Délier » oublie le jeton localement et rappelle de retirer l'accès dans FDL).

## Global Constraints

- Consignes du dépôt (`AGENTS.md`) : mettre à jour `docs/` dans la même modification que le code (comportement livré et limites) ; fonctions courtes et lisibles ; réutiliser l'existant ; chaque choix technique dans `docs/DECISIONS.md` (contexte, choix, raison, alternatives, conséquences, preuve de validation, reste à vérifier). Ne jamais présenter une fonction non livrée comme livrée.
- Mode ponytail : le plus petit diff qui marche. Pas de nouvelle dépendance. Pas de nouvel onglet (le produit garde ses quatre onglets).
- Les deux stockages (SQLite et PostgreSQL) reçoivent la même fonction, vérifiée par un contrat de test commun, comme les stockages existants (`test-support/*-contract.js`).
- PostgreSQL : nouvelle migration `db/migrations/004-fdl.js` ajoutée à la liste de `db/postgres-schema.js`, mêmes droits que les tables `household` existantes (copier le modèle de `001-initial.js`). L'empreinte de structure est recalculée par le mécanisme existant.
- Messages d'interface et d'erreur en français. Pas d'emoji ni de tiret cadratin.
- Le jeton FDL ne sort jamais du serveur : jamais dans une réponse HTTP, un journal ou une page.
- Tests : `npm test` (SQLite et unitaires), puis `npm run test:postgres` (voir `docs/POSTGRESQL-TEST.md` pour les outils PostgreSQL portables). Les appels vers FDL sont testés contre un faux FDL local (`test-support/fdl-fake.js`). Fichiers en LF ; écrire avec Write/Edit, jamais par heredoc ni script.

## Review Focus

1. Le retour depuis FDL avec un `state` inconnu, expiré ou déjà utilisé : page d'erreur, aucun jeton enregistré, aucune requête vers FDL.
2. Une copie retirée encore utilisée par un repas : vidée, jamais supprimée (sinon contrainte de clé étrangère et `503`), le repas garde son titre.
3. Une recette FDL que `validateRecipe` refuse (unité vide, ingrédient en double après mise en minuscules, plus de 50 étapes) : `400` avec le message de validation, rien d'enregistré.
4. FDL injoignable ou en erreur pendant une recherche, un import ou la vérification : `502` « FDL ne répond pas. Réessaie plus tard. », aucune copie touchée.
5. Le jeton FDL n'apparaît dans aucune réponse de `/api/fdl/etat` ni dans aucune page.

---

### Task 1: Stockage `fdl` (SQLite et PostgreSQL)

**Files:**
- Modify: `server.js` (`createDatabase` : tables SQLite)
- Create: `db/migrations/004-fdl.js` ; Modify: `db/postgres-schema.js` (liste des migrations)
- Create: `db/fdl-sqlite.js`, `db/fdl.js` ; Modify: `db/repositories.js` (clé `fdl`)
- Modify: `migration-source.js` (`inspect` ignore les tables `fdl_`), plus toute autre liste de tables qui refuserait les nouvelles tables (chercher `TABLES`, `household-backup.js`, `postgres-instance.js`, la liste de verrous de `003-household-restore.js`). Règle : les tables `fdl_*` sont ignorées par la sauvegarde de foyer et par le transfert, jamais une raison de refus.
- Modify: `db/recipes-sqlite.js`, `db/recipes.js` (marque `modified`)
- Create: `test-support/fdl-store-contract.js`, `fdl-store.test.js`, `test-support/postgres-fdl.integration.cjs` (ajouté au script `test:postgres` de `package.json`)

**Interfaces:**
- Consumes: les stockages de recettes `sqliteRecipes(db)` / `postgresRecipes(db)` (`save`, `remove`, `setFavorite`, `read`).
- Produces: `sqliteFdl(db, recipes)` et `postgresFdl(db, recipes)`, mêmes méthodes (synchrones en SQLite, `async` en PostgreSQL, comme les autres stockages) :
  - `link() -> { token, linkedAt } | null` ; `setLink(token)` ; `clearLink()`
  - `importCopy(recipe, { fdlId, version }) -> recette Manger! | 'already-imported'`
  - `copies() -> [{ recipeId, fdlId, version, availableVersion, modified, removed, title }]` (`removed` exclues seulement par l'appelant)
  - `offerVersion(recipeId, version)` : enregistre `availableVersion` si `version` dépasse `version` et `skippedVersion`
  - `applyUpdate(recipeId, recipe, version) -> recette | 'unknown-recipe'` : `recipes.save(recipe, recipeId)`, puis `version = version`, `modified = false`, `availableVersion = null`
  - `skipUpdate(recipeId)` : `skippedVersion = availableVersion`, `availableVersion = null`
  - `removeCopy(recipeId)` : suppression (`recipes.remove`) ou, si `'used-recipe'`, vidage (règle du haut du plan) ; marque `removed = true` et ajoute l'avis
  - `notices() -> [{ id, title, createdAt }]` ; `clearNotices()`

Schéma SQLite (dans `createDatabase`, comme les tables existantes) :

```sql
CREATE TABLE IF NOT EXISTS fdl_link (id INTEGER PRIMARY KEY CHECK (id = 1), token TEXT NOT NULL, linked_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fdl_copies (
  recipe_id INTEGER PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  fdl_id INTEGER NOT NULL UNIQUE,
  version INTEGER NOT NULL,
  available_version INTEGER,
  skipped_version INTEGER,
  modified INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fdl_notices (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL);
```

PostgreSQL : les mêmes tables dans le schéma `household` (`bigint`, `boolean`, `timestamptz`, `text COLLATE "C"` pour les titres comme les tables voisines).

Marque `modified` : dans `saveIn` des deux stockages de recettes, quand `id` n'est pas nul, ajouter `UPDATE fdl_copies SET modified = 1 WHERE recipe_id = ?` (PostgreSQL : `household.fdl_copies`, `true`). `applyUpdate` remet `modified` à faux après coup.

- [ ] **Step 1: Write the failing contract** (`test-support/fdl-store-contract.js`, lancé par `fdl-store.test.js` en SQLite et par `postgres-fdl.integration.cjs` en PostgreSQL)

```js
// recipe(title) : une recette valide minimale (voir test-support/recipe-fixture.js).
it('stores, replaces and forgets the link', async () => {
  assert.equal(await store.link(), null);
  await store.setLink('a'); await store.setLink('b');
  assert.equal((await store.link()).token, 'b');
  await store.clearLink();
  assert.equal(await store.link(), null);
});
it('imports once per FDL id', async () => {
  const saved = await store.importCopy(recipe('Soupe'), { fdlId: 12, version: 1 });
  assert.equal(saved.title, 'Soupe');
  assert.equal(await store.importCopy(recipe('Soupe 2'), { fdlId: 12, version: 1 }), 'already-imported');
  assert.deepEqual((await store.copies()).map(({ fdlId, version, modified, removed }) => ({ fdlId, version, modified, removed })),
    [{ fdlId: 12, version: 1, modified: false, removed: false }]);
});
it('marks a local edit, offers, skips and applies versions', async () => {
  const { id } = await store.importCopy(recipe('Soupe'), { fdlId: 12, version: 1 });
  await recipes.save(recipe('Soupe maison'), id);
  assert.equal((await store.copies())[0].modified, true);
  await store.offerVersion(id, 2);
  assert.equal((await store.copies())[0].availableVersion, 2);
  await store.skipUpdate(id);
  await store.offerVersion(id, 2);
  assert.equal((await store.copies())[0].availableVersion, null);
  await store.offerVersion(id, 3);
  await store.applyUpdate(id, recipe('Soupe v3'), 3);
  assert.deepEqual((({ version, availableVersion, modified, title }) => ({ version, availableVersion, modified, title }))((await store.copies())[0]),
    { version: 3, availableVersion: null, modified: false, title: 'Soupe v3' });
});
it('deletes an unused removed copy, empties a used one, and leaves a notice each time', async () => {
  const free = await store.importCopy(recipe('Libre'), { fdlId: 1, version: 1 });
  const used = await store.importCopy(recipe('Planifiée'), { fdlId: 2, version: 1 });
  await seedDish(used.id); // un repas et un plat qui utilisent la recette (modèle : recipe-http.test.js seedPlanning)
  await store.removeCopy(free.id);
  await store.removeCopy(used.id);
  const left = await recipes.read();
  assert.equal(left.some((r) => r.id === free.id), false);
  const emptied = left.find((r) => r.id === used.id);
  assert.equal(emptied.title, 'Recette retirée de FDL');
  assert.equal(emptied.steps.length, 1);
  assert.deepEqual((await store.notices()).map((n) => n.title), ['Libre', 'Planifiée']);
  await store.clearNotices();
  assert.deepEqual(await store.notices(), []);
});
```

Ajouter aussi un test de `migration-source` : une base SQLite source qui contient les tables `fdl_*` est acceptée par le transfert.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL, `db/fdl-sqlite.js` introuvable.

- [ ] **Step 3: Implement** the tables, the migration, both stores, the `modified` mark and the skip rules for `fdl_*` tables.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test` puis `npm run test:postgres`
Expected: PASS, sans aucun test existant cassé. Si les outils PostgreSQL portables manquent, le dire dans le rapport (statut DONE_WITH_CONCERNS) au lieu de passer outre.

- [ ] **Step 5: Docs and commit**

`docs/DECISIONS.md` (stockage, vidage d'une copie utilisée, tables ignorées par la sauvegarde de foyer et le transfert), `docs/POSTGRESQL-SCHEMA.md` (migration 004).

```bash
git add -A
git commit -m "feat(fdl): store FDL copies in SQLite and PostgreSQL"
```

---

### Task 2: Liaison avec FDL

**Files:**
- Create: `fdl.js`, `fdl-http.js`, `test-support/fdl-fake.js`
- Modify: `server.js` et `postgres-app.js` (brancher les routes), `accounts.js` (`/api/fdl/retour` public ; `/api/fdl/relier` et `DELETE /api/fdl/lien` réservés à l'administrateur, comme `adminRoute`)
- Test: `fdl-http.test.js`

**Interfaces:**
- Consumes: le stockage `fdl` (Task 1).
- Produces (dans `fdl.js`) :
  - `fdlUrl(env = process.env) -> string | null` : `MANGER_FDL_URL` validée (origine nue `http:` ou `https:`, comme `new URL(v).origin === v`), sinon `null` ; une valeur présente mais invalide lève une erreur au démarrage.
  - `fdlClient(base, fetchImpl = fetch) -> { token(code, clientId, redirectUri, verifier), get(path, accessToken) }` : délai de 10 secondes ; toute panne, tout délai dépassé, toute réponse non JSON ou 5xx lève une erreur de code `MANGER_FDL_UNAVAILABLE`.
  - `fdlRoutes({ store, base, client, sendJson }) -> handler` au format des autres `*Routes` (renvoie `false` si la route ne le concerne pas).
- `test-support/fdl-fake.js` : `startFakeFdl({ recipes, states }) -> { url, close(), calls }`. C'est un serveur `node:http` local qui imite `/oauth/jeton`, `/api/v1/recettes`, `/api/v1/mes-recettes`, `/api/v1/recette` et `/api/v1/etat` tels que les décrit `CONTRATS.md` de FDL. Il exige `Authorization: Bearer jeton-test`. Les tâches 3 et 4 l'étendent.

Routes :

- `GET /api/fdl/relier` (administrateur) : `verifier` (32 octets base64url), `challenge` S256, `state` (32 octets base64url) gardé en mémoire (`Map`, 10 minutes, au plus 20 entrées, la plus ancienne évincée). Redirection `303` vers `{base}/oauth/autoriser?response_type=code&client_id=…&redirect_uri=…&code_challenge=…&code_challenge_method=S256&state=…`.
- `GET /api/fdl/retour` (public) : `state` absent, inconnu ou expiré, ou `error` présent → page HTML `400` « La liaison avec FDL n'a pas abouti. Recommence depuis Mon foyer. ». Sinon : consommer le `state`, échanger le `code`, `setLink(access_token)`, lancer une vérification (Task 4, sans l'attendre), puis page HTML `200` « Compte FDL relié. » avec `<meta http-equiv="refresh" content="0;url=/">` et un lien « Revenir à Manger! ». FDL injoignable → même page `400`.
- `DELETE /api/fdl/lien` (administrateur) : `clearLink()` → `200 {}`.
- `GET /api/fdl/etat` (membre) : `200 { linked: boolean, updates: [...], notices: [...] }` ; `updates` = copies non retirées avec `availableVersion` (`{ recipeId, title, version, availableVersion, modified }`). Jamais le jeton.
- Sans `MANGER_FDL_URL`, toute route `/api/fdl/*` → `404` (le gestionnaire renvoie `false`).

- [ ] **Step 1: Write the failing tests** (`fdl-http.test.js`, serveur de test SQLite comme `recipe-http.test.js`, faux FDL de `test-support/fdl-fake.js`)

```js
it('links the instance through FDL and never shows the token', async () => {
  const start = await admin.get('/api/fdl/relier', { redirect: 'manual' });
  assert.equal(start.status, 303);
  const target = new URL(start.headers.get('location'));
  assert.equal(target.origin + target.pathname, `${fake.url}/oauth/autoriser`);
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(target.searchParams.get('redirect_uri'), `${manger.origin}/api/fdl/retour`);
  // Le faux FDL accepte tout code et vérifie le PKCE avec le challenge reçu.
  const back = await fetch(`${manger.origin}/api/fdl/retour?code=ok&state=${target.searchParams.get('state')}`);
  assert.equal(back.status, 200);
  assert.match(await back.text(), /Compte FDL relié/);
  const state = await (await member.get('/api/fdl/etat')).json();
  assert.equal(state.linked, true);
  assert.doesNotMatch(JSON.stringify(state), /jeton-test/);
});
it('refuses an unknown, reused or errored state without calling FDL', async () => {
  // state inconnu, state déjà consommé, ?error=access_denied : 400, fake.calls.token === 0 pour l'inconnu, store.link() reste nul.
});
it('keeps linking for admins and hides everything without MANGER_FDL_URL', async () => {
  // un membre sur /api/fdl/relier : 403 ; une instance sans MANGER_FDL_URL : /api/fdl/etat 404.
});
```

- [ ] **Step 2: Run to verify they fail** — `npm test`, FAIL (routes absentes).
- [ ] **Step 3: Implement** `fdl.js`, `fdl-http.js`, the fake FDL and the wiring in both servers.
- [ ] **Step 4: Run to verify they pass** — `npm test` puis `npm run test:postgres` : PASS.
- [ ] **Step 5: Docs and commit** — `docs/DECISIONS.md` (retour sans session et `SameSite=Strict`, `client_id` = origine, une liaison par instance), `docs/GUIDE.md` (relier FDL, variable `MANGER_FDL_URL`), `docs/DOCKER.md` si les variables d'environnement y sont listées.

```bash
git add -A
git commit -m "feat(fdl): link the instance to an FDL account"
```

---

### Task 3: Recherche et import

**Files:**
- Modify: `fdl.js` (conversion), `fdl-http.js` (routes), `test-support/fdl-fake.js`
- Test: `fdl-http.test.js`, `fdl.test.js`

**Interfaces:**
- Consumes: `fdlClient().get`, le stockage `fdl`, `validateRecipe` de `recipe.js`.
- Produces: `fdlRecipe(projection) -> objet prêt pour validateRecipe` dans `fdl.js` ; `fdlId(value: string|number) -> string | null` qui accepte un identifiant (`/^\d{1,19}$/`) ou un lien `{base}/recette?id=N` sur l'origine exacte de FDL.

Routes (membre, compte relié obligatoire sinon `409` « Relie d'abord un compte FDL dans Mon foyer. ») :

- `GET /api/fdl/recettes` : relaie `q`, `duree`, `regime`, `saison`, `apres`, `limite` vers `/api/v1/recettes` et renvoie la réponse FDL telle quelle. Chaque élément porte en plus `imported: recipeId | null`.
- `GET /api/fdl/mes-recettes` : idem vers `/api/v1/mes-recettes`.
- `POST /api/fdl/import` `{ "lien": "..." }` : `fdlId` nul → `400` « Lien ou identifiant FDL invalide. » ; FDL `404` → `404` « Recette introuvable sur FDL. » ; `410` → `410` « Recette retirée de FDL par la modération. » ; sinon `validateRecipe(fdlRecipe(projection))` (son erreur → `400` avec son message), puis `importCopy` → `201` recette, ou `409` « Recette déjà importée. » avec `{ recipeId }`.
- FDL en `401` (jeton retiré côté FDL) → `409` « La liaison FDL a été retirée. Relie à nouveau le compte dans Mon foyer. » et `clearLink()`.
- `MANGER_FDL_UNAVAILABLE` → `502` « FDL ne répond pas. Réessaie plus tard. ».

- [ ] **Step 1: Write the failing tests**

```js
it('converts an FDL projection for validateRecipe', () => {
  const r = fdlRecipe({ id: 12, version: 2, title: 'Soupe', minutes: 30, servings: 4, diet: 'vegan', tags: ['hiver'], seasons: ['hiver'],
    ingredients: [{ name: 'Carotte', amount: 3, unit: '', preparation: 'raw' }], steps: [{ kind: 'prep', instruction: 'Couper.', minutes: 5 }],
    url: 'https://fdl.example/recette?id=12', author: 'A', licence: 'CC-BY-SA-4.0' });
  assert.deepEqual(validateRecipe(r).ingredients, [{ name: 'carotte', unit: 'pièce', amount: 3, preparation: 'raw' }]);
  assert.equal(validateRecipe(r).sourceUrl, 'https://fdl.example/recette?id=12');
});
it('accepts an id or an FDL link only', () => {
  assert.equal(fdlId('12'), '12');
  assert.equal(fdlId(`${base}/recette?id=12`), '12');
  for (const bad of ['', 'abc', 'https://autre.example/recette?id=12', `${base}/recette?id=x`, '1'.repeat(20)]) assert.equal(fdlId(bad), null);
});
it('imports a recipe once and reports the FDL errors', async () => {
  // 201 puis 409 { recipeId } ; id inconnu du faux FDL : 404 ; id retiré : 410 ; recette du faux FDL invalide (2 ingrédients identiques) : 400.
});
it('answers 502 when FDL is down and 409 when the token was revoked', async () => {
  // fake.close() puis /api/fdl/recettes : 502 ; faux FDL qui répond 401 : 409 et store.link() nul.
});
```

- [ ] **Step 2: Run to verify they fail** — `npm test`, FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass** — `npm test` puis `npm run test:postgres` : PASS.
- [ ] **Step 5: Docs and commit** — `docs/DECISIONS.md` (conversion : unité vide → `pièce`, saisons, auteur et licence non copiés), `docs/FONCTIONNALITES.md`.

```bash
git add -A
git commit -m "feat(fdl): search and import FDL recipes"
```

---

### Task 4: Vérification, mises à jour et retraits

**Files:**
- Modify: `fdl.js` (`checkCopies`), `fdl-http.js` (routes), `server.js` et `postgres-app.js` (minuterie), `test-support/fdl-fake.js`
- Test: `fdl-http.test.js`

**Interfaces:**
- Consumes: le stockage `fdl` (`copies`, `offerVersion`, `applyUpdate`, `skipUpdate`, `removeCopy`), `fdlClient().get`, `fdlRecipe`.
- Produces: `checkCopies({ store, client }) -> Promise<void>` dans `fdl.js` ; `startFdlChecks({ store, client }) -> stop()` (1 minute après le démarrage puis toutes les 24 heures, `unref()` sur les minuteries ; erreurs avalées et journalisées sans le jeton).

Règles de `checkCopies` : sans liaison, rien. Copies non retirées, par lots de 100 sur `/api/v1/etat?ids=` : `published` ou `private` avec une version plus grande → `offerVersion` ; `removed` → `removeCopy` ; tout autre état, `not_found` compris, et toute panne → rien. Un `401` → `clearLink()` et arrêt.

Routes (membre) :

- `POST /api/fdl/mettre-a-jour` `{ "recipeId": n }` : copie inconnue ou sans version proposée → `404` « Aucune mise à jour proposée. » ; FDL `410` → `removeCopy` puis `410` ; sinon `applyUpdate` avec la recette FDL validée → `200` recette.
- `POST /api/fdl/ignorer` `{ "recipeId": n }` → `skipUpdate` → `200 {}`.
- `POST /api/fdl/avis/vu` → `clearNotices()` → `200 {}`.

- [ ] **Step 1: Write the failing tests**

```js
it('offers a newer version, removes a moderated copy and ignores not_found and outages', async () => {
  // Trois copies importées : 1 (FDL passe en version 2), 2 (FDL : removed), 3 (FDL : not_found).
  await checkCopies({ store, client });
  // etat : updates = [{ recipeId: copie1, availableVersion: 2, ... }] ; copie 2 absente de /api/recipes (ou vidée si planifiée) ;
  // notices = [titre de la copie 2] ; copie 3 intacte.
  fake.close();
  await checkCopies({ store, client }); // ne lève pas, rien ne change
});
it('applies, skips and clears from the household', async () => {
  // POST /api/fdl/mettre-a-jour : 200, titre de la version 2, plus de mise à jour proposée, modified faux.
  // POST /api/fdl/ignorer sur une autre copie : plus proposée tant que FDL ne publie pas une version encore plus récente.
  // POST /api/fdl/avis/vu : notices vide.
});
```

- [ ] **Step 2: Run to verify they fail** — `npm test`, FAIL.
- [ ] **Step 3: Implement**, minuterie branchée dans les deux serveurs (seulement si `MANGER_FDL_URL` existe, arrêtée à la fermeture du serveur).
- [ ] **Step 4: Run to verify they pass** — `npm test` puis `npm run test:postgres` : PASS.
- [ ] **Step 5: Docs and commit** — `docs/DECISIONS.md` (rythme de vérification, états ignorés, retrait), `docs/FONCTIONNALITES.md`.

```bash
git add -A
git commit -m "feat(fdl): daily checks, updates and moderation removals"
```

---

### Task 5: Interface

**Files:**
- Modify: `public/index.html`
- Test: un fichier `fdl-ui.test.js` sur le modèle des tests d'interface existants (`*-ui.test.js`)
- Modify: `docs/GUIDE.md`, `docs/FONCTIONNALITES.md`, `docs/ROADMAP.md`, `docs/README.md` (index)

Comportement (aucun nouvel onglet) :

- **Mon foyer**, administrateur, seulement si `/api/fdl/etat` répond : section « FDL ». Non relié : texte « Relie un compte FDL pour chercher et importer des recettes de la communauté. » et un lien « Relier un compte FDL » vers `/api/fdl/relier`. Relié : « Compte FDL relié. », bouton « Délier » (`DELETE /api/fdl/lien`, puis le rappel « Pense aussi à retirer l'accès dans la page Sécurité de ton compte FDL. »).
- **Onglet des recettes**, compte relié : un panneau repliable « Chercher sur FDL » avec un champ de recherche, la liste des résultats (titre, durée, « Importer » ou « Déjà importée »), « Mes recettes FDL » et un champ « Coller un lien FDL » avec « Importer ». Les erreurs de l'API s'affichent telles quelles.
- **Bandeaux** en haut de l'onglet des recettes : un par mise à jour proposée (« Nouvelle version de « {titre} » sur FDL. », avec « Mettre à jour » et « Ignorer », plus « Tes modifications locales seront perdues. » si `modified`), et les avis de retrait avec un bouton « J'ai compris » (`/api/fdl/avis/vu`).
- Sans `MANGER_FDL_URL` (`404` sur `/api/fdl/etat`), rien de tout cela n'apparaît.

- [ ] **Step 1: Write the failing UI tests** : section FDL présente pour un administrateur et absente pour un membre ; aucun élément FDL quand `/api/fdl/etat` répond `404` ; bandeau de mise à jour avec l'avertissement quand `modified`. Utiliser le même outillage que les tests `*-ui.test.js` existants.
- [ ] **Step 2: Run to verify they fail** — `npm test`, FAIL.
- [ ] **Step 3: Implement** in `public/index.html`, en réutilisant ses fonctions d'appel et de rendu existantes.
- [ ] **Step 4: Run to verify they pass** — `npm test` : PASS.
- [ ] **Step 5: Docs and commit** — guide utilisateur, fonctionnalités, feuille de route (partie C livrée ; validation réelle contre le serveur FDL encore à faire, FDL n'étant pas encore déployé).

```bash
git add -A
git commit -m "feat(fdl): add FDL linking, search, import and update UI"
```
