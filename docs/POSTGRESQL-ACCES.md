# PostgreSQL — invitations et administration

22 octobre 2026 — tâche 06 en cours. Le lancement normal reste SQLite et le candidat PostgreSQL incomplet est refusé ; aucune donnée réelle ni installation Ubuntu utilisée. Contrats existants dans [l'inventaire](POSTGRESQL-CONTRATS.md) et [connexion/sessions](POSTGRESQL-AUTH.md).

## Périmètre et menaces

Porter les invitations, inscription membre, liste/création/désactivation des accès, réservation SMTP et commandes locales de création d'administrateur/récupération. HTTP et CLI sont deux autorités distinctes : une invitation n'accorde jamais le rôle administrateur. Le hachage scrypt, jeton haché, expiration absolue de 24 heures, invitation unique courante et absence de session automatique après inscription restent inchangés. Pas de nouvelle collecte, destinataire conservé ou mécanisme de connexion.

Frontières : corps/cookies HTTP non fiables, dépôt transactionnel, adaptateur SMTP facultatif et opérateur local de confiance. Actifs : droits, hachages, sessions et lien privé. Abus à couvrir : consommation concurrente, remplacement/révocation pendant scrypt, administrateur désactivé/réinitialisé/session révoquée pendant attente, auto-désactivation, erreur SQL après mutation et contournement des cinq envois par heure entre processus.

## Sérialisation prévue

Verrou transactionnel `(1296125511,3)` pour les seules opérations rares d'accès/invitation et commandes locales, puis comptes et sessions ; les six opérations de 05 conservent leurs verrous compte/session existants. Cela évite une inversion créateur/invitation sous concurrence sans ajouter table, permission, epoch ou retry. Les expirations sont relues après attente ; aucune transaction ni verrou pendant scrypt ou SMTP. Réservation SMTP partagée, puis envoi hors transaction : une révocation après réservation ne peut rappeler un courriel déjà parti, pas de garantie de réception ni d'envoi exactement une fois.

Sources primaires consultées : [verrous PostgreSQL 18](https://www.postgresql.org/docs/18/explicit-locking.html), [visibilité READ COMMITTED](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED), [transactions sur un même client pg](https://node-postgres.com/features/transactions). Contrôle de rôle/session après pause requis, pas seulement au début HTTP.

## Preuves à obtenir

06a : cinq régressions PostgreSQL initiales échouent sur les méthodes absentes, puis six tests réussis (parent inclus), aucun ignoré. Liste et mutations avec revalidation transactionnelle, consommation contrôlant l'insertion avant suppression du lien, désactivation/révocation atomique. Réservation SMTP ajoutée après test rouge : même compteur limité à cinq par heure entre deux pools, verrou de tentatives existant et revalidation de session après attente. Aucune transaction pendant le SMTP ; aucun branchement HTTP modifié à ce stade.

Point de contrôle 06a : **32 tests PostgreSQL réussis, aucun ignoré**, en incluant la suite connexion/sessions de 05 et sept nouveaux tests du dépôt (parent inclus). HTTP d'administration encore fermé : son contrat commun ajouté ensuite échoue bien sur les 503 du candidat incomplet avant branchement. La relecture du contrat confirme le contrôle de `rowCount` avant consommation, le rôle actuel sous verrou, les erreurs métier et la réservation du garde SMTP local avant await ; cas de courses supplémentaires à vérifier en 06b.

Tests rouges avant portage, vraie consommation et administration concurrentes entre deux pools ; parité HTTP/SMTP avec SQLite et vrais hachages ; récupération sur fixture synthétique uniquement. Les échecs, résultats et limites seront ajoutés après exécution, sans reprendre les nombres de 05 comme preuve nouvelle. Sauvegarde/restauration du foyer, transfert de données existantes et déploiement PostgreSQL restent hors de 06.
