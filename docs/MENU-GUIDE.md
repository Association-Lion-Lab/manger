# Création de menu guidée

Demande : partir de cinq recettes proposées, les valider visuellement puis choisir leurs jours, avant de créer les courses. L'ajout d'autres recettes, les remplacements et retraits restent possibles. Inspiration des captures Jow, identité et quatre onglets Manger! conservés, sans promotions ou réglages de magasin.

## Parcours retenu

1. **Mon menu** : cinq propositions par défaut dans la limite des repas libres, vignettes avec photo prioritaire, durée, remplacement avec recherche écrite, ajout et retrait. Préférences de personnes et temps disponibles regroupées discrètement. Portions ajustables ; aucune écriture.
2. **Les jours** : date et midi/soir par recette, retour au choix des plats sans perte du brouillon. Plusieurs recettes sur une journée ; avec des profils, plusieurs recettes sur un même repas pour des participants distincts. Les repas déjà enregistrés ne sont pas remplacés.
3. **Créer la liste de courses** : un seul enregistrement atomique des repas, puis ouverture des courses existantes de la semaine. Pas de deuxième confirmation, liste indépendante ou déduction du placard déclenchée à la place. Une confirmation perdue n'entraîne aucun renvoi automatique.

## Frontière et compatibilité

Une seule évolution de l'interface de composition : aperçu via `/api/week/preview`, écriture via `/api/week/plan`, calcul des courses existant. Pas de nouveau stockage, schéma PostgreSQL, dépendance livrée ou service externe. Les goûts, régimes, réservations du placard, choix manuels épinglés et protections des écritures sont conservés. Les suppléments de protéines et l'édition des assiettes dans le calendrier restent disponibles.

Le format existant autorise 14 repas distincts par semaine ; le compositeur utilise les créneaux libres pour l'aperçu et propose au maximum leur nombre de recettes. Le défaut de cinq est réduit quand il reste moins de cinq repas libres. Sans profil, un repas a une recette partagée ; les plats différents au même repas utilisent les profils existants. Les propositions communes respectent les régimes de tous les participants sélectionnés. Le nombre de portions d'une recette partagée augmente par multiples des participants ; leur affectation peut être affinée au choix des jours.

## Vérifications et limites

Tests du brouillon, regroupement des plats par date/créneau sans participant dupliqué, portions, conflits avec repas existants, aperçu sans écriture et sauvegarde protégée ; échecs réseau et relecture après succès sans second envoi. L'ajout d'une sixième recette et le remplacement gardent les autres plats. Les tests du nouveau contrôleur remplacent ceux de l'ancien compositeur tout en conservant les protections de double appui, refus serveur, réponse perdue et relecture échouée.

Parcours exécuté dans Chrome isolé avec foyer et base de test : cinq propositions, ajout/recherche/remplacement, portions, deux plats pour deux profils au même repas, une seule écriture puis courses visibles. Une seconde écriture volontairement privée de sa réponse est retrouvée par relecture sans renvoi. Tailles 320 × 568, 390 × 844, 820 × 1180 et 1280 × 900, clair/sombre et texte à 200 % : pas de débordement horizontal du dialogue, action principale accessible ; captures inspectées. Aucun essai réel Safari/iPhone, Android ou serveur Ubuntu déduit de ces vérifications.

Le brouillon ne survit pas à un rechargement de la page. Le plafond de recettes est le nombre de créneaux libres, même si certains plats sont ensuite regroupés par personne. Les préférences de régime s'appliquent à la sélection commune : affiner les participants lors du placement n'élargit pas rétrospectivement le catalogue. L'anti-gaspi estime les quantités des préférences au moment de la proposition ; changer ensuite portions ou jours n'effectue pas une nouvelle optimisation. Le calcul des courses suit les portions finales enregistrées. Aucun prix, avis fictif ou nouvel abonnement.

Principes Apple Design lus : `layout.md › Best practices` (espacer et hiérarchiser), `accessibility.md › Vision` (texte agrandi), `lists-and-tables.md › Best practices` (liste lisible), `pickers.md › Best practices` (choix de date en contexte). Traduction pour cette application web : contrôles tactiles d'au moins 44 px, intitulés accessibles, une seule zone de défilement, bouton principal hors du contenu défilant avec marge de sécurité basse. Ces principes guident l'implémentation ; ils ne constituent pas une certification HIG.

Les résultats des suites générales, PostgreSQL et Docker et la publication sont consignés dans [les décisions](DECISIONS.md). Le déploiement et l'acceptation sur téléphone restent à confirmer séparément.

## Mettre à jour l'instance PostgreSQL

Utiliser le bloc **1. Mettre à jour l'application** de [la procédure Linux existante](MISE-A-JOUR-CATALOGUE.md). Il construit et teste l'image, sauvegarde l'instance puis remplace uniquement l'application dans le projet PostgreSQL retenu. Aucun changement de schéma ou nouvel import de données n'est nécessaire pour le menu. L'import volontaire du catalogue reste distinct si les 178 recettes ne sont pas encore présentes.

Après mise à jour, ouvrir **Semaine → Créer mon menu → Ajouter une recette** pour vérifier l'ajout au-delà des cinq propositions sur l'appareil habituel.
