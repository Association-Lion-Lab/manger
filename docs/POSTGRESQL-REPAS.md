# PostgreSQL — repas, assiettes et calendrier

25 octobre 2026 — tâche 10 en cours du [plan](MIGRATION-POSTGRESQL.md). Le lancement normal reste SQLite ; aucun transfert privé, schéma, déploiement ou publication. Création de restes, déplacements/copies et semaines types restent en 11 ; cette tranche protège leurs liens existants.

## Contrat et découpage

10a : validation partagée, dépôts SQLite/PostgreSQL de lecture hebdomadaire, ajout/remplacement et retrait. Même forme JSON : IDs numériques sûrs (zéro admis), dates sans fuseau, `hasVariants` numérique, `extraPortions` incluant les restes hors semaine ; assiettes sans champ `assignments`, supplément absent omis, durée maximale des plats. Sinon tableau `assignments`, durée de recette ou null. Ordre date/créneau puis personne ; lecture PostgreSQL en un instantané.

Repas maison, restaurant et extérieur, occasions regular/date/guests conservés. Répartition et plats séparés exclusifs ; recette commune et plats séparés exclusifs ; aucun plat/supplément à l'extérieur. Portions entières 1..20, total 1..100 ; titre limité à 120 unités UTF-16 avant trim, NUL texte refusé. Références et régimes revalidés **après** le verrou foyer `(1296125511,4)` dans la transaction. Personnes et recettes gardent leurs restrictions actuelles : pas de nouvelle exclusion par goûts, pas de régime imposé aux invités non nommés. Le supplément reste facultatif par assiette, obligatoire dans une ancienne affectation.

Identité du repas conservée lors du remplacement au même créneau ; enfants remplacés atomiquement et `leftover_of` remis à null. Un repas servant de source de restes ne peut être remplacé ou retiré ; retirer un repas de restes ne retire pas sa source. Retrait d'un créneau absent idempotent, cascades des seules affectations/assiettes. Erreur après écriture ou pendant la lecture finale : rollback intégral, pas de succès avant COMMIT.

10b : contrôleur commun `POST/DELETE /api/meals` et `GET /api/calendar.ics`, sous protection des comptes et garde de restauration existantes. Corps 32 768 octets, saisie 400, panne interne 503 privée. Export ICS identique : journée entière, UID stable, CRLF, échappement, DTEND lendemain, nom de fichier et variante `download=1` Safari, contenu construit avant en-têtes.

Pour ne pas casser les appels historiques, POST sans précondition conserve l'upsert explicite existant. Extension additive `expectedId` : null signifie créer seulement si le créneau est vide ; entier sûr signifie remplacer seulement ce même ID ; écart renvoyé en 409 sans écriture. Même précondition facultative en query pour DELETE (`expectedId=null` ou entier). L'interface joint l'ID du repas connu pour ce jour/créneau ou null à ses envois ordinaires, sans écran supplémentaire. Cette précondition contrôle une valeur d'ID, pas une révision complète du contenu : deux éditions du même ID restent des remplacements explicites. SQLite peut réutiliser un ID supprimé : suppression/recréation au même ID n'est pas distinguée. Les anciens clients sans ce champ gardent leur comportement historique, limites de compatibilité documentées ; aucune garantie de version optimiste complète ni migration d'identités annoncée.

10c : tests communs réels des dépôts et HTTP sur les deux moteurs, statuts/types/ICS, rollback après enfants, lecture pendant écriture et vrais conflits après attente du verrou (régime, référence supprimée, créneau occupé, restes nouvellement liés). Garde front vérifiée dans la VM existante ; pas de prétention de validation Safari/Android. Conserver exports synchrones utilisés par les calculs et opérations de 11 non portés.

10d : agrégation aux tests PostgreSQL, suite générale et modules/audit, relecture bornée et mise à jour du suivi. Harnais candidat interne uniquement ; autres routes 503, pas de nouveau GET de liste ou branchement PostgreSQL au démarrage.

Hypothèse à éprouver : le même verrou coopératif utilisé par foyer/recettes permet de revalider et engager le repas entier sans références périmées, perte partielle ou écrasement d'une création concurrente avec précondition. Un SQL externe ignorant ce protocole n'est pas couvert. Examen externe toujours différé selon le choix utilisateur ; relecture locale du contrat et du code, pas de CLI externe.

Sources : [verrous transactionnels PostgreSQL](https://www.postgresql.org/docs/18/explicit-locking.html), [client réservé dans une transaction node-postgres](https://node-postgres.com/features/transactions), consultés pour cette tranche. Les références ne remplacent pas les tests d'exécution.
