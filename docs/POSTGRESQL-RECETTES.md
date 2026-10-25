# PostgreSQL — création, lecture, édition et retrait des recettes

25 octobre 2026 — tâche 08 en cours du [plan](MIGRATION-POSTGRESQL.md), après le [foyer](POSTGRESQL-FOYER.md). Manger! reste lancé sur SQLite ; aucune reprise de données privées, nouvelle interface, ouverture du candidat incomplet ou publication.

## Contrat à conserver

Les routes existantes sont `POST /api/recipes` (201), `PUT /api/recipes/:id` (200) et `DELETE /api/recipes/:id` (200, objet vide). La liste est lue par `recipes(db)` et le planning SQLite ; pas de nouveau GET public inventé pour ce lot. Le harnais PostgreSQL interne ne sert que les routes portées, derrière le middleware des comptes, et refuse les autres parcours. IDs HTTP chiffres et entiers sûrs, zéro historique conservé, négatifs non reconnus comme avant.

DTO : ID numérique, titre, durée, portions, tags, régime, URL source, booléens `hasPhoto`/`favorite`, notes seulement si présentes, ingrédients triés par nom avec quantité/unité/état, étapes triées par position. Un titre n'est pas unique. Même normalisation en minuscules françaises, cru/cuit/inconnu sans inférence ; réédition remplace la liste des ingrédients et des étapes, jamais leurs références globales inutilement. ID de recette et IDs des ingrédients partagés conservés ; les IDs techniques des étapes sont recréés comme avant. La validation renumérote les positions de 1 à N dans l'ordre du tableau envoyé, y compris après lecture d'une ancienne recette aux positions espacées ; elle ignore `step.position`. Les tags restent sérialisés par virgules puis redécoupés : `['a,b','a']` revient historiquement en `['a','b','a']`. Ce lot conserve ce comportement au lieu de changer le format.

Une édition met à jour le titre des seuls repas liés par `meals.recipe_id`, conserve l'ID et le planning, et remet le champ historique `instructions` à vide comme le code actuel. Le retrait reste interdit pour une recette référencée directement dans un repas **ou** dans une assiette. Sinon cascades ingrédients liés/étapes/photos/favoris/notes, sans supprimer le dictionnaire global des ingrédients ou le foyer. L'absence d'une recette reste un refus en 400, une panne SQL un 503 privé ; aucun succès avant COMMIT.

Le chemin d'enregistrement existant accepte déjà photo JPEG, retrait explicite `null` et copie de photo ; ces opérations doivent rester atomiques avec l'enregistrement, y compris conservation d'une photo omise. Leur branchement minimal est indissociable du contrat de POST/PUT. Cela ne réalise pas la tâche 09 : téléchargement photo, modification des favoris/avis, catalogue, aperçu d'import et export PostgreSQL restent non portés. Pas de nouveau traitement de photo ou conversion de format.

Priorité photo : une photo explicite ou `null` prime sur `photoCopyId`. Une source inconnue ou sans photo ne modifie pas la photo cible et ne refuse pas l'enregistrement. Le comportement est identique quand source et cible sont la même recette. Ces cas doivent être testés en plus du succès d'une copie.

PostgreSQL refuse NUL dans les champs SQL texte : refus explicite commun aux champs concernés (titre, tags, noms/unités des ingrédients et instructions des étapes), sans le retirer silencieusement. URL source toujours validée HTTP(S), sans identifiants ; le parseur URL conserve son comportement. Pas de nouvelle restriction arbitraire sur les autres caractères.

## Découpage et décisions à vérifier

08a : dépôt PostgreSQL ciblé, lecture en une requête pour un instantané unique, sauvegarde/retrait sur le même client transactionnel. Reprendre le verrou du foyer `(1296125511,4)` avant les lectures/écritures sensibles ; futurs écrivains des repas et enrichissements devront suivre ce protocole. Pas de protection prétendue contre du SQL externe qui contourne le protocole applicatif. Pas de recalage de séquence, DDL, ORM, cache ou reprise automatique.

Les ingrédients et étapes (100 et 50 au plus) sont insérés avec tableaux paramétrés et `unnest`, plutôt que plusieurs centaines d'allers-retours. `ON CONFLICT` ne concerne que la clé nom/unité des ingrédients ; aucun écrasement silencieux d'une recette. Lecture du DTO dans la transaction **avant** COMMIT : une erreur de lecture ne doit pas annoncer un échec après une sauvegarde déjà engagée. Les valeurs de séquence consommées par une transaction échouée ne sont pas promises sans trous.

08b : validation pure partagée avec les exports historiques, petit dépôt SQLite synchrone, trois routes communes à l'intérieur de la garde de restauration. Calculs/planning synchrones existants inchangés, pas de mélange PostgreSQL/SQLite ni de modification des autres routes. Même limite de corps JSON (600 000 octets).

08c : contrat HTTP protégé commun aux moteurs, annulation après mise à jour/effacement/enfants/lecture du DTO, conflit ingrédient et deux éditions simultanées sans mélange, protection des deux références de planning, IDs zéro/grands, quantités/Unicode/positions. Les anciennes suites de recettes, préparation, photos, imports et suppression restent actives. Vérifications réelles PostgreSQL, suite générale HTTPS, intégrité modules et notices, audit npm ; limites navigateur/appareil et déploiement explicites.

Hypothèse à mettre à l'épreuve : sauvegarde/lecture/retrait gardent un état complet et cohérent sous les écrivains applicatifs coopérants et aucune erreur interne n'est divulguée. Une relecture séparée porte sur le contrat puis sur le code, pas une validation exhaustive d'une instance déjà déployée. Gemini/examen externe reste différé à la demande antérieure de l'utilisateur ; aucune invocation ou transmission de code autorisée par cette reprise.

Sources : [paramètres et tableaux du pilote](https://node-postgres.com/features/queries), [unnest PostgreSQL](https://www.postgresql.org/docs/18/functions-array.html), [instantanés et séquences](https://www.postgresql.org/docs/18/transaction-iso.html), [transactions sur un client réservé](https://node-postgres.com/features/transactions). Les résultats d'exécution seront consignés après les tranches ; ces sources seules ne constituent pas une preuve.
