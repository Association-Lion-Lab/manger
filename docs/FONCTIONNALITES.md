# Fonctionnalités réalisées

État du code au **15 octobre 2026**, incluant l'ajout de repas allégé, les repères saisonniers, les sauvegardes protégées et les restaurants uniquement manuels. Cette liste distingue les fonctions livrées des idées ; les parcours détaillés et leurs limites sont dans [le guide](GUIDE.md). Les preuves historiques sont dans [la feuille de route](ROADMAP.md), les validations manquantes dans [les décisions](DECISIONS.md).

## 1. Semaine et repas

Repas au restaurant et dates au restaurant : saisie libre « Nom du restaurant », nombre de personnes puis confirmation. Pas de recherche externe, carte, localisation, compte fournisseur ou clé d'API. Les noms déjà enregistrés et les protections de sauvegarde sont conservés ; aucune réservation.

Dans le sélecteur de recettes du planning et des invités, les lignes compactes montrent la photo du plat en priorité, sinon son émoji de catalogue. Recherche, univers, favoris et indication « Favori » restent disponibles ; les commandes de types de repas conservent leurs SVG.

Les commandes, le compte et les menus utilisent une famille SVG locale harmonisée, sans service externe. Les univers de recettes et les régimes gardent leurs émojis avec un libellé explicite. Une photo personnelle disponible passe avant toute illustration dans les cartes et dans le calendrier des repas à la maison, y compris dates, invités et restes ; les assiettes séparées suivent la même règle. Sans photo, le substitut existant reste affiché. Textes, cibles tactiles et états des favoris sont conservés ; le logo de l'application reste distinct des plats.

- Planning hebdomadaire avec midi et soir, jour courant, navigation entre semaines, retour Aujourd'hui et choix direct d'une date ; aucun horaire de repas.
- Ajout compact : les types de repas sont visibles d'abord ; le catalogue, sa recherche, ses univers et favoris sont regroupés derrière « Choisir une recette ». Retour « Types de repas » dans la même fenêtre et sur le même créneau, sans écriture. Assiettes individuelles et choix date/invités/extérieur conservés.
- Maison, extérieur ou restaurant ; occasion ordinaire, date ou invités. Une sortie peut être enregistrée sans recette ; les invités peuvent avoir une recette ou un repas nommé, par exemple une commande.
- Date à la maison avec choix de recette ; à l'extérieur avec saisie manuelle. Modification d'une sortie/date/invitation avec reprise de ses champs quand le parcours le permet ; nom conservé lors d'un changement de lieu. « Nom du repas » reste utilisé pour Maison et Autre lieu.
- Consultation ou remplacement d'un repas, déplacement et copie vers un créneau libre, export de la semaine en calendrier ICS ; protection des créneaux occupés et des liens de restes.
- Composition automatique d'un menu pour les créneaux libres, aperçu modifiable avant confirmation ; copie d'une semaine et jusqu'à 30 semaines types nommées, sans écraser les repas déjà prévus.

## 2. Foyer mixte et assiettes

- Profils alimentaires par personne : prénom, régime et goûts. Parcours en trois étapes depuis Compte, retour sans perte et enregistrement final explicite.
- Quatre régimes : végétal (« J'aime les graines »), végétarien (« Veggie cool »), pescétarien (« Team océan ») et omnivore (« Je mange de tout »). Les libellés ludiques ne changent pas les règles serveur.
- Base commune avec un supplément de protéine compatible pour chaque participant, ou une recette différente par personne au même repas ; option recette seule, sans supplément.
- Bar à protéines personnalisable : végétal, œuf/végétarien, poisson et viande (« Viandard·e »). Les quantités suivent les personnes et les courses ; un supplément s'ajoute aux ingrédients, sans remplacer automatiquement une viande déjà présente dans la recette.
- Restes planifiés après la préparation : personnes et portions choisies, recettes et protéines conservées, ingrédients achetés au jour où l'on cuisine et jamais comptés deux fois.

## 3. Recettes et découverte

- Création, modification et duplication avec ingrédients quantifiés, portions, durée, régime, étiquettes et étapes structurées de préparation, cuisson, repos ou dressage. Une copie n'existe qu'après enregistrement.
- Fiche avec photo personnelle si disponible, représentation de remplacement sinon, durée, quantités, étapes numérotées et actions Planifier/Cuisiner. Modification des portions sans changer le planning ni recalculer les instructions ou durées.
- Catalogue interne de **100 recettes importables volontairement**, dont **62 nouvelles fiches** du 15 octobre : quatre régimes et 15 univers, ingrédients quantifiés, états cru/cuit explicites et étapes détaillées ; [répartition et import](CATALOGUE.md). Les quatre adaptations saisonnières antérieures gardent leurs [références et comparaison mensuelle](RECETTES-DE-SAISON.md). Titres déjà présents ignorés pour préserver les recettes personnalisées ; l'import répété ne crée pas de doublon de titre. Aucun avis, note ou photo inventé ; les nouvelles recettes ne sont pas validées par des essais en cuisine.
- Recherche par écrit visible aussi dans les univers, favoris, filtre de durée et filtre saisonnier sur le mois courant automatique de l'appareil. Au moins un fruit ou légume du mois non disponible toute l'année est nécessaire ; les produits reconnus hors saison excluent le plat. Nombre de résultats visible près du filtre, aide repliée et statut accessible. France métropolitaine, Bretagne et repères partiels Hauts-de-France ; calendrier mémorisé sur l'appareil, sources consultables, mois actualisé au retour et sans réglage manuel. Casse et accents ignorés, pluriels connus reconnus, rapprochement orthographique en l'absence de résultat exact.
- Favoris et avis du foyer : note de 1 à 5 facultative et commentaire ; illustration du même plat dans le catalogue et le planning lorsque ses données le permettent.

### Univers disponibles

Budget et occasions : **Recettes du rat**, **Recettes de date**, **Côté chef**. Ces étiquettes ne promettent ni prix calculé ni recette attribuée à un chef reconnu.

Organisation et confort : **Plats mijotés**, **Express · 30 min max**, **Batch cooking**, **À emporter**, **Doudou food**.

Cuisines : **Japon**, **Chine**, **Terroir français**, **Méditerranée**, **Italie**, **Inde**, **Mexique**. Plusieurs univers peuvent être associés à une recette. Les étiquettes de transport ou conservation ne donnent aucune garantie sanitaire.

## 4. Préparer et importer

- Mode cuisine guidé, portions ajustables et minuteur indépendant par étape chronométrée ; pause, reprise et réinitialisation. Quitter ce mode annule ses minuteurs.
- Son et maintien de l'écran optionnels, selon le navigateur et les autorisations ; pas de notification système garantie en arrière-plan.
- Import par lien public HTTPS avec lecture de données structurées Schema.org Recipe et prévisualisation obligatoire ; aucune exécution du JavaScript du site ni import automatique de ses photos.
- Export/import JSON des recettes, sélection et relecture d'une recette du fichier avant création ; impression ou PDF via le navigateur. L'export recettes ne remplace pas la sauvegarde du foyer.
- Sauvegarde volontaire d'une recette hors connexion avec portions, étapes, source et petite photo personnelle facultative ; minuteurs locaux, retrait individuel et limite de 20 copies.

## 5. Anti-gaspi, goûts et saison

- Placard en lots distincts, quantité/unité et date personnelle facultative ; édition et suppression de chaque lot, jusqu'à 500 lots.
- Déduction estimée des stocks dans les courses, réservations chronologiques entre semaines et priorité aux dates proches ; les repas antérieurs à la saisie d'un stock ne l'utilisent pas.
- Suggestions favorisant les stocks utiles et les ingrédients réutilisés, avec variété et goûts des participants ; dans le menu automatique, réservation virtuelle pour ne pas promettre deux fois le même stock.
- Basiques reconnus exclus du score anti-gaspi : sel, poivre, huiles, beurre, eau, épices et certains condiments. Ils restent dans les recettes et les courses ; leur présence au domicile n'est pas supposée.
- Goûts par personne, cru/cuit/non précisé : classement souple plutôt qu'exclusion des données inconnues. Saison locale pour une sélection de fruits et légumes en France métropolitaine, sans déduction depuis les seules étapes et sans certification de tout le plat.

## 6. Courses et appareils

- Liste calculée depuis les recettes, suppléments, portions et restes ; unités compatibles regroupées, sans conversion masse/volume ni fusion de préparations distinctes.
- Articles manuels par semaine : ajout, modification, retrait confirmé et coche conservée. Une modification concurrente d'un article manuel est refusée plutôt que d'écraser l'autre appareil.
- Rayons automatiques indicatifs, correction manuelle prioritaire, déplacement par poignée à la souris ou au toucher, avec animation et respect du mouvement réduit ; alternative par clavier ou sélection du rayon.
- Articles cochés regroupés dans une section repliée, actualisation de l'onglet visible toutes les 15 secondes et partage des articles non cochés ; repli vers copie ou fichier texte si nécessaire.
- Copie hors connexion volontaire et coches locales persistantes. Envoi manuel des nouveaux achats encore compatibles avec la liste d'origine, sans décocher le foyer ni recréer un article disparu ; copie préservée tant que des achats restent en attente.

## 7. Comptes, hébergement et identité

- Un foyer partagé par instance, accès individuel avec mot de passe, administrateur et membres ; profils à table distincts des comptes de connexion.
- Création/désactivation d'accès, modification et récupération du mot de passe, déconnexion courante ou de tous ses appareils. Pas d'inscription publique ni mot de passe par défaut.
- Invitation privée valable 24 heures pour une inscription membre, révocable ; partage, copie, courriel prérempli et envoi SMTP serveur facultatif, désactivé par défaut.
- Accès d’un nouvel iPhone en HTTPS local : téléchargement du certificat public réservé à l’administrateur, partage du fichier si le navigateur le permet, empreinte SHA-256 et instructions copiables. Envoi du fichier avant l’invitation ; aucune clé privée exposée, nouveau port ou installation de confiance automatique.
- Docker Compose, volume persistant, état de santé, HTTPS local optionnel sans domaine ni reverse proxy ; sauvegarde du foyer et restauration avec aperçu, confirmation, copie de récupération et transaction.
- Téléchargement de sauvegarde protégé contre les doubles appuis, réception limitée à 30 secondes, fichier vide refusé et bouton libéré en erreur ; aucune donnée du foyer modifiée, enregistrement du fichier à vérifier sur l'appareil.
- Restauration protégée contre les doubles envois, attente navigateur limitée à 30 secondes, fichier conservé en erreur ; résultat perdu signalé sans rejouer le remplacement.
- Quatre onglets et identité Manger!, logo rat cuisinier bicolore décliné en SVG et icônes PNG, manifeste et icône d'accueil iPhone ; modes clair/sombre neutre et accents Potager, Ardoise, Prune. Inspiration Romi/Jow, sans réutiliser leurs contenus.

## 8. Fiabilité déjà renforcée

Les écritures de recettes, notes, protéines, profils, planning, menus, semaines types, placard et courses protègent les doubles appuis et préservent la saisie dans la page quand une erreur le permet. Les principales écritures bornent l'attente à 15 secondes. Les protections exactes restent propres à chaque parcours : une annulation côté navigateur ne signifie pas annulation serveur.

Confirmation d'écriture et rechargement sont séparés. Une réponse perdue est signalée comme incertaine ; « Réessayer » après une lecture échouée ne rejoue pas une création ou suppression. Les réponses obsolètes ne doivent pas modifier une autre semaine, fiche ou personne.

Les protections locales ne constituent pas une garantie universelle d'idempotence entre appareils. Brouillons non sauvegardés, copies hors connexion et données serveur ont des durées de vie différentes ; voir [les décisions](DECISIONS.md).

## Ce qui n'est pas livré

Les vraies interfaces tablette/PC, l'image Docker préconstruite publiée, l'isolation de plusieurs foyers, les coûts calculés et l'extension des calendriers régionaux restent différés. Il n'y a pas de commande d'enseigne, réservation de restaurant, application native, réseau social, générateur de recettes par IA ni calcul nutritionnel avancé. La recherche de restaurants a été abandonnée à la demande de l'utilisateur, pas simplement masquée ou différée. Un tag budget ou une adaptation de largeur ne vaut pas livraison de ces fonctions.
