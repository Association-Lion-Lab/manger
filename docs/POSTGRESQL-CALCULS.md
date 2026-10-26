# Placard, suggestions et calculs — étape 12

Étape terminée et testée localement le 26 octobre 2026. SQLite reste actif ; aucun déploiement ou transfert de données réelles.

## Contrat

Les règles actuelles sont extraites de `server.js` vers `calculations.js` et alimentées par une photographie cohérente. Les besoins SQL restent non arrondis par ligne : les courses arrondissent après agrégation de toute la période, la réservation du placard par date. La somme compensée avant l'arrondi conserve notamment `.01 + .02 + .005 → .04`, là où une addition naïve donnerait `.03` ; deux journées de `.0044` donnent `.01` sur la semaine mais zéro chaque jour. Ces frontières sont vérifiées sur SQLite et PostgreSQL réels, sans tolérance relâchée sur les sorties à deux décimales. Les lots sont consommés dans l'ordre date limite, date d'enregistrement, ID ; les stocks historiques ambigus sont signalés et ignorés. Chaque réservation copie les objets de stock. Restes hors semaine, assiettes et suppléments sont comptés depuis la source.

Les suggestions conservent leur DTO limité, leurs trois résultats et leurs classements goûts, déjà planifié, péremption, stock, réutilisation, dernier repas, titre français. L'aperçu demeure sans écriture et réserve les choix manuels avant les propositions. Aucune modification des saisons, des catégories ou de l'interface.

Les écritures du placard utilisent la transaction SQLite immédiate ou le verrou coopératif du foyer PostgreSQL avant les contrôles de correspondance/quota de 500 lots. Les clés contenant NUL sont conservées en BLOB lu et CAST texte écrit côté SQLite, bytea côté PostgreSQL ; une lecture SQLite texte tronquerait une ancienne clé. NUL dans un nom/unité est refusé à la frontière commune.

## Lecture et limites

La lecture PostgreSQL emploie une transaction REPEATABLE READ READ ONLY sur le même client ; les requêtes ne peuvent mélanger deux versions validées du foyer. SQLite utilise une transaction synchrone, réutilisée lorsqu'une opération de courses l'a déjà ouverte. Une photographie charge l'historique des repas et les recettes du foyer, sans octets des photos. Ce choix conserve les réservations anciennes, les derniers repas et les liens hors semaine ; pour un historique massif, une optimisation mesurée des bornes sera nécessaire sans changer les résultats.

Références vérifiées : [isolation PostgreSQL 18](https://www.postgresql.org/docs/18/transaction-iso.html), [bytea et octets NUL](https://www.postgresql.org/docs/18/datatype-binary.html), [transactions pg sur un seul client](https://node-postgres.com/features/transactions).

## Vérification

Contrat commun écrit avant les modules ; échec attendu MODULE_NOT_FOUND constaté. 378 tests généraux et 187 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus. 140 comparaisons synthétiques identiques, trois cycles de relecture réconciliés ; modules/image et audit npm sans alerte. Absence des binaires : 21 parents en échec explicite, aucun ignoré. Aucun déploiement ou donnée réelle. Ubuntu, Docker, CI et appareils non validés ici.
