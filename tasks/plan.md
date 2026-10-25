# Migration PostgreSQL — plan d'implémentation

22 octobre 2026 — **plan validé par l'utilisateur, préparation commencée**. Ce fichier est le point d'entrée de travail ; le [plan technique et opérationnel](../docs/MIGRATION-POSTGRESQL.md) précise les hypothèses, risques et critères. Les cases de réalisation sont uniquement dans [todo.md](todo.md).

## Objectif et périmètre

Conserver Node.js, l'interface et le foyer partagé ; remplacer le stockage par PostgreSQL sans perdre données, comptes, photos, protections ni sauvegarde/restauration. Le produit utilise encore SQLite ; les contrats, l'environnement PostgreSQL privé, les accès, personnes/préférences/protéines, recettes/enrichissements/imports et repas/assiettes/ICS sont testés isolément, pas le portage applicatif complet. Pas de publication ni d'accès Ubuntu autorisé par une demande de plan.

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

Plan approuvé, tâches 01–10 réalisées au 25 octobre. [Inventaire détaillé](../docs/POSTGRESQL-CONTRATS.md), [fixture PostgreSQL portable](../docs/POSTGRESQL-TEST.md), [schéma et rôles séparés](../docs/POSTGRESQL-SCHEMA.md), [frontière asynchrone](../docs/POSTGRESQL-CONNEXION.md), [connexion/sessions](../docs/POSTGRESQL-AUTH.md), [invitations/administration](../docs/POSTGRESQL-ACCES.md), [personnes/goûts/protéines](../docs/POSTGRESQL-FOYER.md), [recettes](../docs/POSTGRESQL-RECETTES.md), [enrichissements/imports](../docs/POSTGRESQL-ENRICHISSEMENTS.md) et [repas/assiettes/ICS](../docs/POSTGRESQL-REPAS.md) testés isolément. **155 tests PostgreSQL et 347 tests généraux réussis**, aucun ignoré, HTTPS inclus. Préconditions additives de valeur d'ID testées ; limites anciens clients et réutilisation SQLite documentées, pas de version optimiste complète. Pilote de production et notices livrés, mais moteur normal toujours SQLite et candidat PostgreSQL incomplet explicitement refusé avant ouverture des bases ; service CLI PostgreSQL injectable testé, raccordement au lancement complet en 19. Aucun transfert privé, service système, accès Ubuntu ou publication ; Docker/Linux/CI PostgreSQL restent à valider en 19–20. Prochaine tâche 11 : semaines, déplacements et restes, sans mélange de moteurs ni ouverture d'un candidat partiel au déploiement. Recalage/restauration et provisionnement de rôles neufs à spécifier avec 15–17/19 ; pas de droits propriétaire distribués au client. Alerte npm Nodemailer corrigée localement (10.2.1), audit sans vulnérabilité signalée. Résultats, incidents de vérification et limites dans le suivi et la checklist. Aucun délai de bascule promis avant répétition.
