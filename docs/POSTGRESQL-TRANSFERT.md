# Import vers une cible vide — étape 15

26 octobre 2026, travail local en cours. Aucun serveur de l'utilisateur, volume, mot de passe réel ou bascule manipulé.

## Contrat et séquence

Le lecteur de l'étape 14 produit les 22 tables normalisées. Le transfert administratif exige un schéma reconnu et une cible sans donnée ni marqueur d'import. Une migration additive 002 conserve l'état pending/ready et un identifiant d'opération dans manger_meta, inaccessible en lecture/écriture directe au rôle applicatif. Seule storage_status(), fonction SQL stable à droits propriétaires et search_path fixé, retourne version/empreinte structurelle/état prêt ; EXECUTE public révoqué et accordé au seul rôle applicatif choisi.

Un client administratif garde les verrous de session schéma, import puis foyer pendant les deux transactions READ COMMITTED ; les verrous transactionnels seuls ne survivraient pas au premier engagement. Après audit/vacuité sous verrou exclusif de toutes les tables, la première réserve pending durablement. La seconde recontrôle structure, marqueur et vacuité, insère par paramètres en ordre des références, relit chaque valeur des 22 tables et compare aussi tous les octets des photos/clés. Elle recale les séquences, recontrôle la structure et engage ready atomiquement. Les tableaux et octets source sont figés par copie avant la première attente. Aucun écrasement ou fusion. Une nouvelle tentative sur une cible réservée ou déjà migrée est refusée. Une écriture SQL extérieure ignorant le protocole dans l'intervalle est conservée et provoque un refus, pas une fusion ; l'arrêt de tous les écrivains reste un prérequis opérateur. Le client administratif est détruit après usage pour ne recycler ni paramètres de session ni verrou résiduel.

Le recalage utilise ALTER SEQUENCE RESTART, transactionnel, plutôt que setval non transactionnel envisagé dans le plan. Le départ est au moins 1 ; une identité épuisée est refusée avant réservation. Une panne certaine avant le COMMIT des données laisse pending et annule données/recalage ; la cible ne doit pas servir et une cible neuve est exigée. Une perte de réponse au COMMIT est **incertaine** : ready et les données peuvent être déjà engagés. L'outil ne rejoue pas l'import ; une commande de contrôle avec le nonce vérifie sur une nouvelle connexion le marqueur et toutes les valeurs. Une erreur de fermeture après engagement ne doit pas annoncer une annulation.

L'empreinte des définitions d'objets est enregistrée après migrations/permissions puis vérifiée avant une réutilisation et sous verrou avant import : relations, colonnes/defaults/identités, contraintes, index, fonctions/ACL, triggers/règles/RLS, séquences et dépendances ; aucun compteur de séquence ou contenu de table. Les namespaces hors système, public compris, et les objets dépendant de ces namespaces sont également inventoriés : table annexe publique, collation/type/opérateur ajouté sont détectés. Cela détecte une dérive locale après initialisation. Ce n'est pas un audit exhaustif d'un cluster tiers, des ACL globales ou une défense contre un propriétaire qui falsifierait ensemble code, historique et empreinte ; bootstrap avec rôles neufs toujours requis.

Les anciens prototypes PostgreSQL au seul schéma 001 ne possèdent pas cette empreinte de référence : leur montée vers 002 est refusée sans mutation, même si leur historique 001 est correct. Il faut provisionner une nouvelle cible. Accepter et sceller leur état courant pourrait officialiser une dérive antérieure indétectable. Aucune instance PostgreSQL n'était activée en production dans ces lots ; cette restriction concerne les anciens candidats de test et ne convertit ni n'efface SQLite. Les évolutions ultérieures depuis un socle déjà empreint vérifient l'ancienne empreinte avant tout nouveau DDL.

## Commandes administratives

La configuration utilise MANGER_PG_HOST, MANGER_PG_PORT, MANGER_PG_DATABASE, MANGER_PG_USER (rôle applicatif), MANGER_PG_MIGRATION_USER et MANGER_PG_MIGRATION_PASSWORD_FILE (fichier privé, pas le mot de passe en ligne de commande). TLS vérifié par défaut, CA facultative MANGER_PG_CA_FILE. MANGER_PG_TLS=disable-local est limité aux adresses littérales de boucle locale. Aucun PGHOST/PGPASSWORD ou URL implicite. Les outils d'exploitation ne sont pas des commandes client web.

```sh
node migrate-postgres.js import /copie/privee/manger.db /copie/privee/accounts.db --source-stopped --target-empty
node migrate-postgres.js verify /copie/privee/manger.db /copie/privee/accounts.db --source-stopped IDENTIFIANT-DE-CONTROLE
```

Les deux commandes lisent les sources sans mutation. L'import prépare les migrations avec le rôle administratif distinct ; verify n'initialise rien et ne réimporte rien. Une installation serveur candidate et les secrets de déploiement restent à préparer en 19–22 ; ces commandes ne sont pas une consigne de bascule actuelle. Rapport limité aux états/effectifs/empreintes. Les copies, fichiers secrets et rapports ne vont jamais au dépôt.

Les clients administratifs réutilisent la surveillance de client réservée déjà éprouvée à la frontière asynchrone : listener error posé dans le callback de remise, annulation des requêtes si la connexion disparaît, destruction de la connexion privée à la fin. Un listener du pool seul ne protégerait pas un client réservé. Une vraie coupure du serveur temporaire après COMMIT est testée ; l'état ready est vérifié après redémarrage sans nouvel import. L'identifiant de contrôle est un nonce d'opération administrative, sans pouvoir de connexion ou d'invitation.

Source officielle : [ALTER SEQUENCE — RESTART transactionnel et verrouillage](https://www.postgresql.org/docs/18/sql-altersequence.html), [setval et limites transactionnelles](https://www.postgresql.org/docs/18/functions-sequence.html). Vérifications réelles et limites à consigner à la clôture.

## Clôture locale

397 tests généraux et 211 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; contrôle image/modules réussi sans Docker. Trois cycles de relecture séparée réconciliés. Aucune donnée réelle, bascule, publication ou validation Ubuntu/appareil. La commande standard contient24fichiers et26parents. Les prototypes001 sont refusés ; le moteur actif reste SQLite, aucune bascule préparée comme acquise.
