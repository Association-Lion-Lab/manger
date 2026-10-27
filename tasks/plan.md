# Migration PostgreSQL — plan d'implémentation

22 octobre 2026 — **plan validé par l'utilisateur, préparation commencée**. Ce fichier est le point d'entrée de travail ; le [plan technique et opérationnel](../docs/MIGRATION-POSTGRESQL.md) précise les hypothèses, risques et critères. Les cases de réalisation sont uniquement dans [todo.md](todo.md).

## Objectif et périmètre

Conserver Node.js, l'interface et le foyer partagé ; remplacer le stockage par PostgreSQL sans perdre données, comptes, photos, protections ni sauvegarde/restauration. Le produit utilise encore SQLite ; les contrats, l'environnement PostgreSQL privé, les accès, personnes/préférences/protéines, recettes/enrichissements/imports, repas/assiettes/ICS et écritures de semaines/déplacements/restes sont testés isolément, pas le portage applicatif complet. Pas de publication ni d'accès Ubuntu autorisé par une demande de plan.

## Décisions proposées

- PostgreSQL 18 stable, pilote `pg` verrouillé, une base par instance et schémas `household`/`auth` ; pas d'ORM, de réécriture Rust ou de refonte client.
- Appels asynchrones explicites, transactions sur un client réservé et contrats API conservés. SQLite maintenu pendant la transition, sans double écriture ni repli silencieux.
- Import administratif vers cible vide, source arrêtée copiée et ouverte en lecture seule, validation des deux bases avant engagement atomique.
- Sauvegarde client limitée aux données du foyer et import ancien SQLite ; sauvegarde PostgreSQL complète de l'exploitant distincte. Pas de dump SQL arbitraire exécuté depuis le web.
- Bascule avec interruption mesurée et ancien volume intact ; retour simple seulement tant qu'aucune nouvelle donnée utile n'a été créée dans PostgreSQL.

## Dépendances et ordre

```text
01 contrats → 02 environnement → 03 schéma → 04 frontière asynchrone
                                                  |
                  05 connexion → 06 accès → 07 foyer → 08 recettes
                                                            |
                   09 enrichissements → 10 repas → 11 semaines
                                                            |
                                 12 placard/calculs → 13 courses
                                                            |
                     14 analyse reprise → 15 import et comparaison
                                                            |
                           16 sauvegarde → 17 restauration → 18 CLI
                                                            |
                          19 image → 20 CI → 21 répétition → 22 guide
                                                            |
                                23 bascule volontaire administrateur
```

Chaque tranche 05 à 13 porte un parcours complet, refus et concurrence inclus, pas uniquement des tables. Entre les points de contrôle, garder la version SQLite exploitable ; le candidat PostgreSQL ne devient pas une version déployable avant parité complète. Les tâches sur `server.js` sont séquentielles ; aucune délégation parallèle n'est nécessaire.

## Risques et points de contrôle

| Risque | Impact | Réponse et jalon |
| --- | --- | --- |
| Asynchrone ou SQL modifiant les résultats | Élevé | Contrats/types/tris figés en 01–04 ; contrôles après 07, 10 et 13. |
| Compte ou règle de concurrence affaiblie | Élevé | Connexion/invitation/révocation testées tôt en 05–06, deux connexions réelles. |
| Import incomplet ou sauvegarde inutilisable | Élevé | Cible vide, transaction, comparaison exhaustive et restauration répétée en 14–18. |
| Image incomplète ou volume mal monté | Élevé | Contrôles de packaging conservés, vraie recréation et secrets isolés en 19–20. |
| Faux retour arrière après nouvelles saisies | Élevé | Deux scénarios de retour distincts en 21–23 ; aucune promesse de réplication inverse. |

Commandes existantes vérifiées : `npm test`, `node image-check.js`, `node scripts/check-docker-context.js`, `sh scripts/test-docker.sh manger:0.1.0`. Les deux dernières exigent Docker/Linux et testent actuellement SQLite seulement. Les tâches définiront les nouvelles commandes et fixtures avant leur usage ; aucun nom de commande futur ne doit être présenté comme disponible aujourd'hui.

## État

Plan approuvé, tâches 01–11 réalisées au 25 octobre. [Inventaire détaillé](../docs/POSTGRESQL-CONTRATS.md), [fixture PostgreSQL portable](../docs/POSTGRESQL-TEST.md), [schéma et rôles séparés](../docs/POSTGRESQL-SCHEMA.md), [frontière asynchrone](../docs/POSTGRESQL-CONNEXION.md), [connexion/sessions](../docs/POSTGRESQL-AUTH.md), [invitations/administration](../docs/POSTGRESQL-ACCES.md), [personnes/goûts/protéines](../docs/POSTGRESQL-FOYER.md), [recettes](../docs/POSTGRESQL-RECETTES.md), [enrichissements/imports](../docs/POSTGRESQL-ENRICHISSEMENTS.md), [repas/assiettes/ICS](../docs/POSTGRESQL-REPAS.md) et [semaines/déplacements/restes](../docs/POSTGRESQL-SEMAINES.md) testés isolément. **176 tests PostgreSQL et 367 tests généraux réussis**, aucun ignoré, HTTPS inclus. Lots et liens atomiques, snapshots/quota/capacité revalidés sous verrou ; limites de préconditions/anciens clients/réutilisation SQLite documentées, pas de version optimiste complète. Pilote de production et notices livrés, mais moteur normal toujours SQLite et candidat PostgreSQL incomplet explicitement refusé avant ouverture des bases ; service CLI PostgreSQL injectable testé, raccordement au lancement complet en 19. Aucun transfert privé, service système, accès Ubuntu ou publication ; Docker/Linux/CI PostgreSQL restent à valider en 19–20. Prochaine tâche 12 : stock, suggestions et calculs, sans mélange de moteurs ni ouverture d'un candidat partiel au déploiement. Recalage/restauration et provisionnement de rôles neufs à spécifier avec 15–17/19 ; pas de droits propriétaire distribués au client. Alerte npm Nodemailer corrigée localement (10.2.1), audit sans vulnérabilité signalée. Résultats, incidents de vérification et limites dans le suivi et la checklist. Aucun délai de bascule promis avant répétition.

## Avancement du 26 octobre 2026

Étapes 01–12 réalisées, onze restantes. 378 tests généraux et 187 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus. 140 comparaisons synthétiques identiques, trois cycles de relecture réconciliés ; modules/image et audit npm sans alerte. Absence des binaires : 21 parents en échec explicite, aucun ignoré. Aucun déploiement ou donnée réelle. Prochaine tâche 13 : courses éditables/synchronisation. Le moteur normal reste SQLite, aucun candidat incomplet déployable.

Clôture étape 13 (26 octobre 2026) : 386 tests généraux et 199 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; modules/image vérifiés sans Docker. Deux cycles de relecture séparée réconciliés. Aucun déploiement, donnée réelle, publication ou validation appareil. Treize tâches closes, dix restantes, prochaine 14. La commande PostgreSQL contient 21 fichiers et 23 parents. SQLite reste actif ; reprise/sauvegarde/exploitation des étapes 14–23 encore à faire.

Avancement du 26 octobre 2026 : étapes 01–14 closes, neuf restantes ; prochaine 15 (import et comparaison), sans bascule. 393 tests généraux réussis, aucun ignoré, HTTPS inclus ; sept tests source et CLI administratif sur copies synthétiques réussis, modules/image vérifiés. Aucune base réelle, publication, migration PostgreSQL ou validation Ubuntu/appareil.

Avancement du26octobre2026 : étapes01–15 closes, huit restantes, prochaine16 (sauvegarde du foyer). 397 tests généraux et 211 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; contrôle image/modules réussi sans Docker. Trois cycles de relecture séparée réconciliés. Aucune donnée réelle, bascule, publication ou validation Ubuntu/appareil. Recalage transactionnel ALTER SEQUENCE RESTART, état ambigu contrôlé sans réimport ; prototypes001 sans empreinte refusés, nouvelle cible nécessaire.

26 octobre 2026 : étapes 01–16 closes, sept restantes ; prochaine 17, restauration du foyer. 401 tests généraux et 215 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus. Contrôle image/modules réussi sans Docker. Sauvegarde JSON cohérente des 18 tables, accès exclus, téléchargement navigateur synthétique vérifié. Aucune donnée privée, bascule, publication ou validation Ubuntu/Safari/iPhone.

26 octobre 2026 : étapes 01–17 closes, six restantes ; prochaine 18, sauvegarde de l’instance complète. 403 tests généraux et 226 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; 26 fichiers et 28 parents dans la commande PostgreSQL. Trois cycles de relecture réconciliés. Contrôle image/modules réussi sans Docker. SQLite normal conservé, aucun candidat partiel activé, aucune donnée privée, publication, bascule ou validation Ubuntu/appareil.

26 octobre 2026 : étapes 01–18 closes, cinq restantes ; prochaine 19, candidat et vérification Docker. 404 tests généraux et 231 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; 27 fichiers et 29 parents PostgreSQL. Vrais pg_dump/pg_restore sur deux clusters privés, reconnexion HTTP avec compte restauré et commande verify exécutée. Trois cycles de relecture réconciliés, dernier défaut de manifeste corrigé et testé avant connexion. Modules/image contrôlés sans Docker. Aucun serveur personnel, donnée réelle, bascule ou publication.

26 octobre 2026 : étapes 01–18 closes ; 19a (raccordement natif du candidat) réalisée, 19b Docker/Linux encore ouverte. 404 tests généraux et 238 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; 28 fichiers et 30 parents PostgreSQL. Commande sans binaires : 30 échecs explicites, zéro succès/ignoré, code 1 attendu. Modules/image et 36 documents/321 liens locaux vérifiés. Trois cycles de relecture réconciliés et parcours navigateur sur vrai PostgreSQL synthétique passé. Aucune donnée réelle déplacée ni publication.

## Point de reprise 19b — 26 octobre 2026

Le scénario Docker candidat est préparé et documenté dans [POSTGRESQL-DOCKER.md](../docs/POSTGRESQL-DOCKER.md). 405 tests généraux réussis sans ignoré ; syntaxe shell/JavaScript et sondes HTTP sur PostgreSQL natif temporaire vérifiées. Aucune exécution Docker acquise. L’utilisateur a désigné son Linux comme hôte de test ; commandes à exécuter par lui, SSH automatique non authentifié. Conserver 19 ouverte puis poursuivre 20–23 dans l’ordre après le résultat Linux ; aucun ancien volume/service ou donnée réelle modifié, aucune publication automatique.

## Clôture 19 — résultat Linux du 26 octobre 2026

Scénario `b9a3ba4` sur image `31ed51d` réellement terminé par l’administrateur : transfert, TLS, accès, recréation/persistance, reprise sans redémarrage web et défaut de migration passés, ressources synthétiques nettoyées. [Détails](../docs/POSTGRESQL-DOCKER.md#résultat-final-linux--étape-19-close). Étapes 01–19 closes, quatre restantes ; prochaine 20 (préparation puis activation CI), aucune bascule réelle ou validation appareil.

## Préparation CI 20a — 26 octobre 2026

Matrice et scénarios d’image déclarés avec dépendance bloquante, pas de déploiement ou artefact privé. 407 tests généraux réussis, aucun ignoré, HTTPS inclus ; refus des doubles de commande, outils absents et moteur inconnu vérifiés, relecture indépendante sans constat. [Contrat et activation](../docs/POSTGRESQL-CI.md). L’utilisateur n’a pas configuré de runner : conserver 20b/20 ouverte avant l’acceptation 21–23. Pas d’installation permanente sur son serveur via l’autorisation d’un test ponctuel.

## Préparation native 21a — 26 octobre 2026

À la demande de poursuivre, [répétition sur copies synthétiques](../docs/POSTGRESQL-REPETITION.md) : pannes, copies SQLite inchangées et réellement utilisables, archive complète, refus d’ancienne référence après nouvelle écriture, archive récente restaurée sur secours. Mesures locales distinctes d’une maintenance privée. Préparation uniquement : CI 20b, répétition par volume et guide Linux final non déclarés réussis ; pas de bascule ou accès au serveur personnel. Résultats finaux consignés dans les décisions après la suite native.

Point d’arrêt du soir : 21a native vérifiée, 407 tests généraux et 243 PostgreSQL réussis, aucun ignoré ; premier incident initdb consigné puis relance complète verte sans changer les seuils. CI 20b et acceptation 21 non closes ; reprendre ensuite le guide 22 et la bascule volontaire 23 selon les preuves disponibles. Aucune tâche de fond ou reprise automatique.

## Reprise du 27 octobre 2026

Extension du scénario Docker : arrêt du candidat et de PostgreSQL avant toute nouvelle écriture, serveur SQLite sur copies privées de la source synthétique, session et sauvegarde complète du foyer vérifiées, empreintes des deux sources inchangées. [Commande et contrat](../docs/POSTGRESQL-REPETITION.md#reprise-du-27-octobre--contrôle-docker-du-retour-aux-copies-sqlite). Ne ferme pas la CI20b ou l’acceptation finale21 ; exécution Linux de l’extension encore requise, puis guide22 et bascule23 suivant les preuves. Aucun accès distant ou changement de l’installation habituelle.

Validation de cette reprise : 411 tests généraux réussis sans ignoré, HTTPS inclus ; sondes historiques sur PostgreSQL natif, refus bloquant du shell simulé, modules/image et syntaxe contrôlés. Deux cycles de relecture réconciliés. Prochaine preuve attendue : exécution par l’administrateur du scénario Docker étendu ; ne pas transformer le test natif en résultat Linux ou CI.

Résultat Linux reçu le 27 octobre : scénario étendu `de077a7` sur image `31ed51d` réussi, retour SQLite puis reprise PostgreSQL et nettoyage final confirmés. [Détail](../docs/POSTGRESQL-REPETITION.md#résultat-linux-du-27-octobre--retour-aux-copies-confirmé). Prochain travail distinct : préparer/vérifier la restauration administrative complète sur Linux avant finalisation du guide ; CI20b reste sans runner et acceptation21 non close. Aucun nouvel essai de ce retour aux copies demandé, aucune bascule réelle effectuée.

Préparation de ce travail : image cliente PostgreSQL18 distincte dérivée du candidat, profil de secours aux volumes propres et commandes d’archive existantes, ancien mode Docker conservé. Sonde native intégrée à la suite PostgreSQL ; rendu réel Compose5.6.0 sans moteur confirme l’isolation prévue. [Commande Linux et contrat](../docs/POSTGRESQL-REPETITION.md#restauration-docker-complète--préparation-du-27-octobre). CI préparée inclut le second tag sans activation ; attente du résultat de construction/exécution Linux avant toute clôture21, guide22 ou bascule23.

Résultat local final :413 tests généraux et244 PostgreSQL réussis, aucun ignoré, HTTPS inclus ;32 refus explicites/code1 sans outils. Sonde source/secours, refus bloquants du shell, syntaxe, modules et configuration Compose vérifiés ; deux cycles de relecture sans constat. Aucun accès au serveur personnel ou donnée réelle. Prochaine action administrateur : construire l’image d’outils puis lancer le scénario avec les deux tags, selon la commande de répétition ; aucun redémarrage de l’installation habituelle requis.

Résultat administrateur reçu le27octobre : image-outils `pg-tools-31530b0` construite, [restauration complète Linux réussie](../docs/POSTGRESQL-REPETITION.md#résultat-docker-complet-du-27-octobre--restauration-confirmée), source conservée après écriture de secours et nettoyage observé. Aucune nouvelle commande à exécuter pour ce sous-parcours. Prochain travail : préparer le guide administrateur et les contrôles privés manquants, sans fermer20b/21/22/23 avant leurs preuves, ni basculer l’installation implicitement.

Préparation22a : [guide opérateur](../docs/POSTGRESQL-ADMIN.md), profil HTTPS permanent distinct et maintenance par image séparée. Commandes de préparation, source figée/import, nouvelle installation, sauvegarde/runtime, restauration fermée, ouverture et limites du retour ; source HTTPS native et vrai rendu Compose vérifiés. Scénario Linux `--admin-https` à exécuter sur ressources synthétiques/port local temporaire avant acceptation de cet overlay ; pas de conversion des bases de l’utilisateur ou d’activation CI.

Résultat final22a :415 tests généraux et244 PostgreSQL réussis sans ignoré, HTTPS inclus ; le premier incident de sous-processus Windows est conservé, fichier isolé puis relance complète verte sans assertion/délai modifié. Rendu Compose réel,16 blocs shell, CA/secrets exclusifs et refus opérateur simulés vérifiés ; trois cycles de relecture réconciliés. Prochaine action : test Linux avec images `pg-test-31ed51d` et `pg-tools-31530b0`, troisième argument `--admin-https`. Pas besoin de reconstruire ces images pour ce lot de configuration/sondes/doc exclues de l’image ; étapes20b/21/22/23 restent ouvertes selon leurs critères.

Résultat reçu le27octobre : [profil HTTPS réussi sur Linux](../docs/POSTGRESQL-ADMIN.md#résultat-linux-du-profil-https--27-octobre-2026), scénario `36c5c8f`, restauration et nettoyage complets observés. Ce test n’est plus à demander ; prochaine tranche opérateur : répétition privée guidée, copies figées et ancien volume conservé, sans exposition des données à l’agent, puis décision de bascule et Safari. CI20b reste sans runner ; acceptations21/22/23 non confondues avec cette preuve synthétique.

Résultat privé reçu le27octobre : [import `c150934` réussi sur le Linux de l’administrateur](../docs/POSTGRESQL-ADMIN.md#résultat-privé-reçu-le-27-octobre-2026),22tables comparées, archive vérifiée, web privé sain et source SQLite reprise. Mesures2s copie/reprise,1s import ; aucune donnée privée transmise à l’agent. Ce point ne se rejoue pas. Prochains contrôles : inspection de la copie, restauration privée récente et mesures restantes, puis bascule volontaire/Safari ; CI20b reste distincte.
