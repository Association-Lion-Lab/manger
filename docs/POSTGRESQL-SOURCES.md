# Analyse des sources SQLite — étape 14

26 octobre 2026, outil administratif local en cours de vérification. SQLite demeure le stockage normal ; aucune base de l'utilisateur ouverte ou déplacée.

## Utilisation

Depuis la racine du dépôt, sur des **copies privées figées après arrêt de Manger!**, sans fichiers WAL/SHM/journal associés :

```sh
node migration-source.js /chemin/prive/copie/manger.db /chemin/prive/copie/accounts.db --source-stopped
```

La commande ne contient aucun secret et n'ouvre pas PostgreSQL. Le rapport indique versions, effectifs des 22 tables et empreintes des deux fichiers ; aucun nom, login, hachage de mot de passe, jeton ou contenu de recette. Ne pas fournir les copies à un agent ou à la CI. Le résultat interne des fonctions contient des données privées : seul `report` peut être affiché.

## Contrôles et normalisation

Fichiers réguliers distincts, sans lien symbolique direct, jusqu'à 256 Mio chacun ; lecture originale en mode readOnly, extensions désactivées, mode défensif et limites SQLite explicites. UTF-8 exigé avant tout CAST texte→BLOB : une base UTF-16 serait autrement décodée silencieusement de travers. Vérification d'intégrité physique, tables/colonnes/types autorisés, absence de vue/trigger/table virtuelle/colonne générée ou index utilisateur. Lecture brute NOT INDEXED ; entiers sûrs, nombres finis, texte sans NUL, JSON attendu, clés uniques et toutes les références vérifiés explicitement. `foreign_key_check` seul ne détecte pas une relation absente du DDL.

Les CHECK du fichier sont ignorés sur le lecteur en lecture seule pour empêcher l'évaluation d'expressions fournies par ce fichier ; les contraintes connues du produit sont vérifiées par `migration-format.js`, puis par insertion dans un schéma neuf créé par notre code. Ni DDL, ni DEFAULT, ni CHECK importé n'est exécuté pour normaliser. Les données sont copiées par paramètres ; seuls ces schémas de confiance reçoivent les anciennes migrations. Aucun amorçage de recette/protéine. Les clés du placard restent des octets, les photos aussi ; les textes sont décodés UTF-8 strictement sans troncature au NUL et en conservant tout U+FEFF initial. Le rowid historique des rayons devient sort_order. Les semaines types sont contrôlées par le validateur structurel de snapshot existant, sans exiger que leurs anciennes recettes/personnes existent encore ; leur date de création ISO est conservée. L'exclusion des objets internes utilise un préfixe littéral, pas le joker SQL `_`.

Version foyer 4 complète, versions 0–3 limitées aux tables/colonnes historiques explicitement prises en charge ; huit tables de base exigées, week_templates obligatoire dès la version 3. Une colonne/table inconnue ou une source incomplète est refusée. Comptes : schéma historique version 0, trois tables de base obligatoires, table invitations ancienne absente recréée vide sur le schéma neuf. Les valeurs existantes ne sont pas fusionnées ou renommées. Les empreintes originales doivent rester identiques après lecture ; ce contrôle ne remplace pas l'arrêt de tous les écrivains et ne promet pas de détecter un adversaire ABA dans un dossier partagé.

Les répertoires temporaires créés par l'outil sont seuls nettoyés ; la protection du répertoire de l'utilisateur fait partie des prérequis, un mode POSIX n'atteste pas d'ACL Windows. Les fabriques SQLite ferment désormais leur handle si l'initialisation échoue avant de le retourner.

Références : [Node 24.15 — SQLite, mode lecture seule, limites et défense](https://nodejs.org/download/release/v24.15.0/docs/api/sqlite.html), [contrôles et PRAGMA SQLite](https://www.sqlite.org/pragma.html), [contrat des 22 tables](POSTGRESQL-CONTRATS.md). Les anciennes sauvegardes web restent limitées à 32 Mio ; la limite administrative ci-dessus ne change pas cette limite.

## Preuves

Tests écrits avant le lecteur ; échec attendu constaté. Sources v4/v3, absence d'amorçage, octets NUL, rowid, corruption/version inconnue/champ caché/vue/texte NUL/fichier absent/sidecar et relations sans FK testés ; comparaison des octets d'origine après succès/refus. Un test UTF-16 initial ne persistait pas l'encodage sur disque : la fixture a été corrigée avec une table temporaire créée/supprimée, puis le refus vérifié. Résultats de clôture à consigner ; aucune migration réelle, Docker, Ubuntu ou validation appareil.

Clôture locale : 393 tests généraux réussis, aucun ignoré, HTTPS inclus ; sept tests source et CLI administratif sur copies synthétiques réussis, modules/image vérifiés. Aucune base réelle, publication, migration PostgreSQL ou validation Ubuntu/appareil. Trois cycles de relecture séparée réconciliés ; U+FEFF, sqliteX_view/trigger, snapshot invalide et CHECK privé également couverts.
