# PostgreSQL — invitations et administration

22 octobre 2026 — tâche 06 réalisée sur bases isolées. **Le lancement normal reste SQLite et le candidat PostgreSQL incomplet est refusé** ; aucune donnée réelle ni installation Ubuntu utilisée. Contrats existants dans [l'inventaire](POSTGRESQL-CONTRATS.md) et [connexion/sessions](POSTGRESQL-AUTH.md).

## Périmètre et menaces

Invitations, inscription membre, liste/création/désactivation des accès, réservation SMTP et service de commande locale de création d'administrateur/récupération utilisent désormais les dépôts nommés SQLite/PostgreSQL. HTTP et CLI sont deux autorités distinctes : une invitation n'accorde jamais le rôle administrateur. Le hachage scrypt, jeton haché, expiration absolue de 24 heures, invitation unique courante et absence de session automatique après inscription restent inchangés. Pas de nouvelle collecte, destinataire conservé ou mécanisme de connexion.

Frontières : corps/cookies HTTP non fiables, dépôt transactionnel, adaptateur SMTP facultatif et opérateur local de confiance. Actifs : droits, hachages, sessions et lien privé. Abus à couvrir : consommation concurrente, remplacement/révocation pendant scrypt, administrateur désactivé/réinitialisé/session révoquée pendant attente, auto-désactivation, erreur SQL après mutation et contournement des cinq envois par heure entre processus.

## Interface et sérialisation

| Opérations internes | Droits et résultat |
| --- | --- |
| `invitation`, `join` | Validation préalable puis consommation atomique ; membre seulement, lien conservé si identifiant déjà occupé. |
| `listAccounts`, `addAccount`, `setActive` | Compte administrateur actif, même hachage et session encore valide ; liste sans hachage/jeton, désactivation et révocations atomiques. |
| `issueInvitation`, `revokeInvitation`, `prepareMail` | Même revalidation administrateur ; lien unique, 24 heures, quota partagé de cinq réservations SMTP par heure. |
| `createLocalAccount`, `resetLocalPassword` | Autorité locale de confiance uniquement, jamais exposée par HTTP ; création explicite ou récupération sans changer ID/rôle. |

Une méthode renvoie son résultat ou un code métier fermé (`forbidden`, `duplicate`, `duplicate-invitee`, `invitation`, `invitation-mail`, `self`, `missing`, `mail-limit`). Le middleware traduit ces seuls codes en messages/statuts attendus ; les erreurs internes restent privées. Pas de parseur global pg, ID et dates numériques explicitement convertis ; aucun repli SQLite ni retry automatique d'une écriture.

Verrou transactionnel `(1296125511,3)` pour les seules opérations rares d'accès/invitation et commandes locales, puis comptes et sessions ; les six opérations de 05 conservent leurs verrous compte/session existants. Cela évite une inversion créateur/invitation sous concurrence sans ajouter table, permission, epoch ou retry. Les expirations sont relues après attente ; aucune transaction ni verrou pendant scrypt ou SMTP. Réservation SMTP partagée, puis envoi hors transaction : une révocation après réservation ne peut rappeler un courriel déjà parti, pas de garantie de réception ni d'envoi exactement une fois.

Sources primaires consultées : [verrous PostgreSQL 18](https://www.postgresql.org/docs/18/explicit-locking.html), [visibilité READ COMMITTED](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED), [transactions sur un même client pg](https://node-postgres.com/features/transactions). Contrôle de rôle/session après pause requis, pas seulement au début HTTP.

## Historique des tranches

06a : cinq régressions PostgreSQL initiales échouent sur les méthodes absentes, puis six tests réussis (parent inclus), aucun ignoré. Liste et mutations avec revalidation transactionnelle, consommation contrôlant l'insertion avant suppression du lien, désactivation/révocation atomique. Réservation SMTP ajoutée après test rouge : même compteur limité à cinq par heure entre deux pools, verrou de tentatives existant et revalidation de session après attente. Aucune transaction pendant le SMTP ; aucun branchement HTTP modifié à ce stade.

Point de contrôle 06a : **32 tests PostgreSQL réussis, aucun ignoré**, en incluant la suite connexion/sessions de 05 et sept nouveaux tests du dépôt (parent inclus). HTTP d'administration encore fermé : son contrat commun ajouté ensuite échoue bien sur les 503 du candidat incomplet avant branchement. La relecture du contrat confirme le contrôle de `rowCount` avant consommation, le rôle actuel sous verrou, les erreurs métier et la réservation du garde SMTP local avant await ; cas de courses supplémentaires à vérifier en 06b.

06b : SQL des invitations/administration retiré du middleware au profit des deux dépôts nommés ; mêmes statuts/DTO et messages métier, erreurs SQL privées toujours 503 pour le candidat. Le garde local SMTP est réservé avant le premier await de réservation et libéré même si la réservation échoue. Seules sauvegarde/restauration du foyer restent explicitement fermées dans le middleware candidat ; son lancement normal demeure refusé.

Contrat HTTP initial : quatre cas rouges sur les 503 PostgreSQL avant branchement, puis **33 tests ciblés réussis** avec les tests d'accès/SMTP SQLite existants. Le test commun d'erreur interne de réservation a ensuite révélé le vieux catch SQLite renvoyant `error.message` en 400 : reproduction rouge, même réponse 503 privée appliquée aux deux moteurs pour les erreurs non marquées comme saisie. Messages métier connus toujours marqués et conservés ; aucune requête privée ou mot de passe dans la réponse d'erreur.

Point de contrôle 06b : **46 tests HTTP/SMTP ciblés réussis**, aucun ignoré, avec les courses du rôle perdu, lien annulé/expiré pendant le vrai scrypt, réservation SMTP suspendue et erreur interne sans envoi. Les tests PostgreSQL du dépôt passent à **12** : attente réelle de verrous observée, expiration du lien après attente du créateur, session révoquée pendant attente globale, rollback complet d'une désactivation et deux administrateurs se désactivant simultanément. La suite générale et la commande PostgreSQL agrégée ne sont pas encore repassées pour la clôture.

06c : `accountCommand(auth, command, name)` reçoit explicitement le dépôt et porte le même service de commande sur les deux moteurs ; pas une route HTTP ni un provisionnement automatique. Création d'administrateur explicite et récupération gardant ID/rôle, réactivation et suppression des sessions dans une transaction ; mot de passe généré uniquement retourné à l'opérateur après confirmation. Les commandes shell existantes restent SQLite ; choisir `MANGER_STORAGE=postgres` est désormais refusé avant ouverture de fichier, au lieu d'un repli implicite. Le futur branchement CLI PostgreSQL/configuration sera livré avec le lancement/déploiement complet en 19 ; les tests actuels l'injectent sur leur propre base. Aucun mot de passe régénéré du seul fait du portage ; seule une commande explicite de récupération en génère un.

Tests initiaux 06c rouges : service de commande absent et commande shell ignorant le moteur, créant alors une base SQLite malgré `MANGER_STORAGE=postgres` dans son propre dossier temporaire. Garde ajoutée avant ouverture ; aucun fichier réel concerné. Même contrat de commande/HTTP sur deux bases synthétiques, erreurs et rollback de récupération vérifiés. Trois suites supplémentaires sont ajoutées à la commande PostgreSQL dédiée ; la garde de cette commande doit être actualisée après son échec attendu.

## Clôture et limites

**282 tests généraux et 81 tests PostgreSQL réels réussis, aucun ignoré**, HTTPS inclus. La commande dédiée agrège sept suites ; sans binaires, code 1 et neuf tests de tête en échec, aucun ignoré, avant création de cluster. Contrôle `node image-check.js` réussi : modules/pages/licences/icônes et SQLite en mémoire, sans connexion PostgreSQL. Audit npm de production sans vulnérabilité signalée, dépendances et verrou inchangés.

Mutation uniquement en mémoire consommant une invitation sur identifiant occupé : détectée par l'assertion du contrat, aucun fichier produit altéré. Trois cycles de contre-relecture à contexte séparé : points rôle/rowCount/garde SMTP/erreurs métier pris en compte, aucun nouveau défaut concret dans les chemins relus aux deux derniers cycles. Seconde relecture externe proposée sans outil lancé ; aucun audit externe ou certificat de sécurité revendiqué.

Le même contrat HTTP et les vrais scrypt couvrent les deux moteurs ; SMTP externe simulé à sa frontière, pas de courriel envoyé. Les commandes shell SQLite existantes sont testées en sous-processus sur dossier synthétique ; leur service interne PostgreSQL et les rollbacks sont testés sur le cluster jetable, pas encore une commande de déploiement PostgreSQL utilisable. L'injection d'échec après UPDATE vérifie que mot de passe, sessions et droits restent cohérents sur les deux moteurs.

Suite : **07 — personnes et protéines**. Sauvegarde/restauration du foyer, transfert des données existantes et branchement du déploiement/CLI PostgreSQL restent hors de 06. Compose, volumes, schéma, interface et données privées inchangés ; aucune validation Docker/Linux/CI PostgreSQL, Ubuntu ou téléphone, aucune publication Codeberg.
