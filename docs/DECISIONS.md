# Choix techniques, limites et blocages

## Regrouper les recettes dans l'ajout d'un repas — 14 octobre 2026

**Contexte :** le premier écran d'ajout affichait toutes les recettes avant les occasions. Avec le catalogue importé, date et invités étaient repoussés loin dans la liste. Le besoin est de choisir d'abord le type de repas, sans changer le modèle des repas ou ajouter un réglage.

**Choix et raison :** remplacer le catalogue initial par une entrée « Choisir une recette » au même niveau que date, invités et extérieur ; conserver l'option d'assiettes individuelles si des profils existent. Cette entrée réutilise `recipePicker` et `renderPickerRecipes`, avec recherche écrite, univers et favoris. Le bouton « Types de repas » remonte dans le même dialogue et conserve jour/créneau. Focus replacé sur un bouton, sans ouvrir automatiquement le clavier ; position de défilement remise au début. L'erreur de l'étape précédente est effacée lorsque l'utilisateur quitte ce parcours pour choisir un nouveau type. Le verrou de sauvegarde s'applique aux deux nouvelles actions.

**Design et alternative :** Apple Design guide la révélation progressive (`layout.md`, « Visual hierarchy »), le retour explicite et une seule fenêtre (`modality.md`, « Best practices »), ainsi que des boutons nommés et cibles tactiles d'au moins 44 px (`buttons.md`, « Best practices »). Réutiliser les cartes, la police et les couleurs du projet ; pas de nouvelle palette, animation, modal empilée ou catalogue copié. Écarter un simple repli « Plus d'options », qui masquerait encore la distinction entre type de repas et contenu.

**Compatibilité et limites :** aucune dépendance, API ou migration ; les données, le filtre saisonnier, les recettes, les protéines facultatives, dates/invités et l'ajout depuis Recettes restent inchangés. Sans profil, le choix d'une recette conserve l'enregistrement direct existant ; avec profils, il ouvre le choix des participants et protéines. Le retour efface uniquement la recherche de cette étape, pas les recettes enregistrées.

**Diagnostic des contrôles :** le jeu de données du nouveau contrôle navigateur attendait HTTP 200 pour créer un profil ; l'API existante retourne 201, confirmé dans le serveur, donc seul le contrôle a été corrigé. À 320 px avec texte à 200 %, la liste de recettes débordait : les mots longs occupaient jusqu'à 202 px dans une colonne de 122 px. Ajouter `min-width: 0` et `overflow-wrap: anywhere` uniquement aux textes des choix de ce dialogue. Aucun titre tronqué ni taille de texte réduite. Un ancien contrôle de sauvegarde attendait « refusé », alors que le libellé existant dit « Modification refusée » : assertion adaptée sans modifier l'application.

**Validation locale :** quatre tests de parcours échouaient avant la modification et passent après ; suite complète de 201 tests réussis, aucun ignoré, HTTPS inclus, avec deux fichiers de tests simultanés. Chromium sur base isolée : menu compact, recherche approximative/absence de résultat/univers/favoris, retour au clavier et focus, date à la maison, invités, assiettes individuelles et protéines ; 320/390/768/1024/1440 px en clair/sombre et texte à 200 %. Aucun enregistrement pendant la navigation, une écriture après confirmation du repas partagé. Captures avant/après et choix de recette inspectés. Chrome DevTools MCP n'est pas configuré : utilisation du parcours Playwright/Chromium déjà disponible, sans installer un nouvel outil. Pas de nouveau test réel sur iPhone/Safari, Android ou Ubuntu.

**Revue complémentaire :** inverser temporairement la condition du bouton « Choisir une recette » fait échouer le test de navigation ; après restauration, les quatre tests ciblés passent. Le contrôle Chromium de sauvegarde existant, adapté à l'entrée supplémentaire, passe également : repas partagé et individuel, invités/date/extérieur, foyer sans profil et ajout depuis Recettes, conservation des choix après refus, doubles appuis bloqués, Échap et absence de renvoi automatique après confirmation. Diff et liens documentaires contrôlés ; aucune fusion dans `main` ni intervention sur Ubuntu.

## Un filtre saisonnier plus distinct du catalogue — 12 octobre 2026

**Contexte :** les premiers plats restaient identiques avec « De saison », car la carotte est disponible les douze mois dans nos calendriers. Les explications et vérifications précédentes n'avaient pas modifié cette règle. Le retour utilisateur « asperges invisibles » confirme uniquement ce cas d'exclusion sur son appareil, pas le présent changement.

**Choix et raison :** modifier une seule règle commune dans `recipeSeason` : au moins un produit frais reconnu du mois avec moins de douze mois de disponibilité dans le calendrier sélectionné, et aucun produit reconnu hors saison. Préserver les tableaux `inSeason` et `outOfSeason`, les calendriers et toutes les recettes. Exiger une période limitée rend le bouton plus sélectif sans prétendre que la carotte est hors saison. En Bretagne, chou-fleur et betterave disponibles toute l'année ne suffisent pas seuls. L'interface reprend le libellé existant du mois pour ajouter un compteur accessible ; l'aide explique la règle sans nouveau réglage. Apple Design guide ce retour discret près du filtre et le maintien de l'aide repliée.

**Alternative écartée et limite :** exclure des ingrédients à partir du titre du plat ou d'une étiquette de saison donnerait des faux résultats. Rejeter tous les ingrédients inconnus cacherait les recettes mal renseignées. Ils restent donc non évalués, de même que les produits transformés ; le filtre n'est pas une garantie exhaustive de saisonnalité, d'origine ou de disponibilité en magasin. Les plats exclus restent accessibles sans filtre ; aucune migration ni réimport n'est nécessaire.

**Blocage de vérification locale :** le premier lancement ciblé échouait sur une connexion `127.0.0.1` refusée (`EACCES`) par l'environnement restreint, après réussite des assertions métier. Relancer les contrôles réseau locaux avec les permissions appropriées, sans modifier le code pour contourner ce refus. Aucun accès au serveur Ubuntu ou aux données réelles.

**Validation :** 197 tests réussis, aucun ignoré, HTTPS inclus, après une relance complète. La première suite complète avait signalé un échec du fichier `dish-proteins.test.js` sans détail exploitable ; ce test a réussi seul puis dans la relance complète, sans modification. Cause de cet échec ponctuel non identifiée. Chromium vérifie les trois calendriers sur douze mois, le compteur, les deux plats témoins, recherche/univers/durée, retour du mois courant, fuseaux, largeurs 320/390/760 px et texte à 200 %. Capture sombre à 390 px inspectée : compteur lisible près du filtre, sans nouveau contrôle. 14 documents et 76 liens/ancres locaux vérifiés. Aucune nouvelle validation réelle sur Safari/iPhone, Android ou Ubuntu.

**Publication bloquée :** le correctif est sauvegardé dans le commit local `fe6c858` sur `development`. Les deux tentatives de `git push origin development` du 12 octobre ont retourné HTTP 503 pour le dépôt Codeberg. La cause distante n'est pas établie ; ne pas présenter ce correctif comme publié ou disponible dans Docker. Réessayer la même publication depuis ce dépôt lorsque Codeberg répond, sans modifier les identifiants ni forcer l'historique. La mise à jour Ubuntu vient seulement après une publication réussie.

## Quatre adaptations saisonnières — 12 octobre 2026

**Demande et choix :** ajouter de vraies recettes de périodes différentes pour vérifier le filtre mensuel actuel. Réutiliser le catalogue volontaire et le champ `sourceUrl`, sans migration, dépendance, nouvel écran ni mois manuel. Les 34 recettes précédentes restent inchangées ; leurs titres et personnalisations ne sont pas remplacés. Ajouter un risotto aux asperges, un tian, un velouté de potimarron et des endives au jambon avec quantités pour deux portions et annotations de préparation vérifiées contre leurs étapes.

**Sources et limites :** quatre pages Marmiton notées de 4,5 à 4,9/5, avec 43 à 298 commentaires affichés ; [références et adaptations](RECETTES-DE-SAISON.md). Textes originaux, sans copier photos, instructions ou avis. Les bonnes notes concernent les références, pas les adaptations Manger! ; celles-ci restent non testées en cuisine. Les ingrédients frais, non les noms des saisons, déterminent l'inclusion. Le gratin d'endives couvre plusieurs saisons et le calendrier breton diffère du national. Le tian est un accompagnement ; aucune promesse d'équilibre nutritionnel ou de prix.

**Contrôles :** 194 tests réussis, aucun ignoré, HTTPS inclus. Catalogue, repères janvier/avril/juillet/octobre, différences bretonnes, ingrédient ajouté hors saison, import de quatre manquantes avec conservation des personnalisations et des sources, import répété sans doublon. Le test de persistance tient compte du tri des ingrédients et de `position` sur les étapes SQLite ; les noms du catalogue restent minuscules comme ceux enregistrés par le serveur. Parcours Chromium isolé des quatre fiches, liens et trois calendriers sur douze mois simulés. Aucune intervention sur Ubuntu ou les appareils réels.

État documentaire au **10 octobre 2026**. Ce registre consolide les choix déjà consignés dans le guide, le code et l'historique. Il ne suppose pas de nouvelles validations sur le serveur utilisateur. Les corrections ponctuelles et résultats par lot sont conservés dans [ROADMAP.md](ROADMAP.md).

## Cadre de contribution

Pour chaque nouvelle décision, renseigne : **contexte → choix et raison → alternative pertinente → conséquences → validation / reste à vérifier**. Pour un blocage, ajoute : **symptôme → cause connue ou incertaine → contournement sûr → action de déblocage**. Mets à jour une décision existante quand elle évolue, sans multiplier les notes contradictoires.

## Produit mobile et identité

**Contexte :** l'usage principal est sur téléphone ; l'utilisateur veut une application belle, sobre et simple, inspirée de Jow/Romi sans accumulation d'options.

**Choix :** quatre onglets Semaine, Recettes, Courses, Compte ; foyer dans Compte plutôt qu'un raccourci redondant. Pas d'heure de repas. Les actions courantes restent visibles ; les réglages rares sont regroupés dans leur contexte. « Plus d'options » du planning a été remplacé par Réutiliser un menu et Exporter. Les boutons de gestion de fiche s'adaptent à la largeur et au texte agrandi.

**Alternatives écartées :** copie écran par écran de Jow, bannières commerciales, nouvel onglet Plus, questionnaire obligatoire ou interface PC simplement agrandie. Le logo rat cuisinier et les accents appartiennent à l'identité Manger! ; aucune photo Jow n'est utilisée. Les surfaces sombres restent gris/noir, pas vert foncé.

**Conséquences et validation :** contrôles web natifs, police système, thèmes existants et mouvement réduit préservés. Maquettes mobiles approuvées et premières intégrations livrées ; tests Chromium ne remplacent pas une revue Safari/Android. La vraie adaptation tablette/PC reste différée.

## Stack et dépendances

**Contexte :** auto-hébergement accessible et maintien d'un petit projet compréhensible.

**Choix :** Node 24+, HTTP/HTTPS natif, SQLite embarqué et interface HTML/CSS/JavaScript sans framework. Utiliser les fonctions existantes ou la bibliothèque standard avant une abstraction ou dépendance. Nodemailer est verrouillé pour le SMTP : pas de protocole mail maison.

**Compromis :** pas de chaîne de compilation client ni service cloud nécessaire au planning. `server.js` et le HTML restent volumineux : écrire les prochains changements avec des fonctions courtes n'autorise pas une réécriture générale. Le HTML est chargé au démarrage, donc nécessite un redémarrage après édition.

**Validation :** imports, configuration et lancement vérifiés par les tests du dépôt ; la publication d'une image préconstruite ne découle pas de cette stack et reste différée.

## Foyer, régimes et protéines

**Contexte :** des personnes d'un même foyer peuvent manger des plats différents ou partager une base avec des protéines différentes.

**Choix :** enregistrer personnes, régimes, recettes et suppléments séparément. Les comptes ne créent pas automatiquement une personne à table. La compatibilité est validée côté serveur ; « sans supplément » est un choix normal.

**Alternative écartée :** remplacer automatiquement tous les ingrédients ou réécrire les étapes pour chaque régime. Un supplément ne supprime pas une viande présente dans la recette ; pour une variante, choisir une recette compatible ou la dupliquer et l'éditer.

**Conséquences :** bases, assiettes individuelles et protéines contribuent aux courses et aux restes. Un seul foyer partagé par instance : plusieurs comptes ne constituent pas plusieurs foyers isolés. Tests des protéines, répartitions et restes disponibles ; isolation multi-foyer non livrée.

## Goûts souples, cru/cuit et saisie

**Contexte :** exclure une recette mal annotée empêcherait de proposer un plat pourtant acceptable, par exemple pour un goût « tomate crue ».

**Choix :** classement souple : adapté, préparation à vérifier, moins adapté ; les régimes et durées restent stricts. L'état cru/cuit/non précisé est renseigné explicitement par ingrédient, pas déduit des étapes. Les anciens goûts du foyer sont transférés manuellement aux personnes, sans attribution arbitraire.

**Alternative écartée :** exclusion automatique des préparations inconnues ou interprétation de la cuisson par une IA. Normalisation de casse, accents et pluriels connus, vocabulaire local et suggestions orthographiques volontaires suffisent à rendre la saisie plus souple sans envoyer les aliments à un service externe.

**Limites :** aucune garantie anti-allergies, vocabulaire incomplet, pas de correction automatique silencieuse. Les ingrédients distincts, par exemple tofu/tofu fumé et tomate/tomate concassée, restent distincts. Tests locaux des goûts, noms et préparations ; vérification humaine requise pour chaque recette importée.

## Anti-gaspi, courses et stocks

**Contexte :** réutiliser des ingrédients frais et éviter de compter deux fois une quantité disponible.

**Choix :** lots séparés, réservations chronologiques entre semaines, dates proches prioritaires et consommation virtuelle dans l'aperçu automatique. Exclure les basiques reconnus du score anti-gaspi, mais jamais des quantités de recette ou de courses.

**Compromis :** date du placard = repère personnel, pas garantie sanitaire. Stock estimé, pas inventaire confirmé après cuisson. Le riz et les pâtes restent utiles à la réutilisation ; les herbes fraîches sont distinctes des versions séchées. Regrouper seulement les unités compatibles ; pas de conversion masse/volume ou fusion arbitraire des préparations.

**Limites et validation :** le menu n'est pas une optimisation globale ; un petit catalogue peut répéter des plats. Articles manuels indépendants, classification de rayons indicative, noms inconnus dans Autres. Les doublons de vieux stocks ambigus demandent correction plutôt qu'addition silencieuse. Calculs et parcours isolés testés ; consommation/fraîcheur réelles non certifiées.

## Saison et catalogue

**Contexte :** montrer les recettes de saison et plusieurs univers sans transformer un tag en promesse nutritionnelle ou économique.

**Choix :** calendrier local partiel de fruits/légumes de France métropolitaine ; filtre facultatif par mois combinable avec recherche, durée et univers. Produits transformés/ambigus non assimilés aux produits frais. Catalogue original de 34 recettes importable sans remplacer les titres déjà présents.

**Compromis :** aucune région ou origine agricole connue, aucune certification de tout le plat. Budget/Côté chef sont des univers éditoriaux, pas prix calculés ou attribution à un chef. Les recettes originales sont CC0 ; les imports gardent leurs sources et droits.

**Validation :** calendrier et tests saisonniers dans `public/seasons.js` et `seasons.test.js` ; descriptions et ingrédients vérifiés en développement, mais aucun essai culinaire complet garanti. Extension du vocabulaire, prix et couverture des autres régions restent des chantiers distincts ; premiers compléments régionaux ajoutés le 12 octobre.

## Écritures réseau et concurrence

**Contexte :** doubles appuis, réponses tardives, perte de connexion et rechargement raté après une sauvegarde déjà effectuée.

**Choix :** verrou local approprié à l'objet/formulaire, attente bornée, brouillon conservé dans la page en erreur, capture de l'identité concernée et ignorance des réponses obsolètes. Séparer confirmation d'écriture et relecture. Ne jamais renvoyer automatiquement une mutation incertaine.

**Alternatives écartées :** afficher un échec de sauvegarde quand seule la relecture a échoué, ou rejouer une création sur simple coupure. Les coches sont suivies par article et semaine ; plusieurs articles peuvent être traités en parallèle. La modification d'un article manuel refuse une version devenue obsolète.

**Limites :** un délai expiré côté navigateur n'annule pas une opération serveur. La protection d'une page ne fournit pas une idempotence globale entre appareils. Avis et certaines modifications concurrentes restent à dernière écriture reçue. Les brouillons non sauvegardés ne survivent pas au rechargement. Résultats et tests par parcours dans `ROADMAP.md` ; ne pas prétendre que tous les contrôles suivent une abstraction unique.

## Recherches de communes et restaurants

**Contexte :** localisation et commune écrivaient dans la même zone sans verrou commun ; une réponse tardive pouvait afficher les résultats d'un repas précédent ou réactiver les contrôles d'une nouvelle recherche. Les attentes HTTP côté navigateur n'étaient pas bornées.

**Choix (10 octobre) :** conserver les deux boutons et les résultats existants, avec une seule recherche active. Un contrôleur d'annulation et un nettoyage idempotent capturent la zone et les états des contrôles ; seuls les résultats encore actuels, connectés et visibles peuvent être affichés. Fermer, changer de lieu, ouvrir une configuration ou enregistrer le repas annule cette lecture. Délai de 15 secondes pour commune/centre ; localisation limitée à 20 secondes par le navigateur, parcours complet limité à 35 secondes. Les refus sans JSON et résultats illisibles ont un message avec repli manuel. Aucune requête de coordonnées ne part après une localisation annulée.

**Alternatives et conséquences :** pas de gestionnaire réseau général, dépendance, nouvelle carte, service ou changement de données selon Ponytail. Verrouiller seulement la recherche permet de fermer ou de saisir/planifier le repas pendant l'attente, plutôt que bloquer toute la fenêtre. Les états précédents sont restaurés une seule fois ; une ancienne réponse ne peut pas déverrouiller une demande suivante. L'annulation n'arrête pas nécessairement la localisation système ni les appels externes déjà partis ; les délais serveur de 10 secondes restent inchangés. Aucun essai automatique ni réservation.

**Lisibilité :** la capture à 320 px avec texte doublé montrait un nom coupé malgré l'absence de débordement du dialogue. Une règle CSS limitée aux résultats permet le retour à la ligne sans réduire la police ni modifier les cartes ailleurs. Apple Design a guidé ce correctif d'accessibilité : `typography.md › Supporting Dynamic Type`, « Keep text truncation to a minimum as font size increases. » Police, couleurs sémantiques, contrôles et navigation approuvés conservés ; les principes de lisibilité sont appliqués au web, sans prétendre utiliser un composant natif iOS.

**Validation et limite :** sept tests logiques et Chromium sur une base isolée, avec services de communes/Overpass locaux simulés et position simulée. Les anciens harnais de planning ont reçu la fonction d'annulation dans leur contexte, sans retirer leurs assertions. Recherche jusqu'à la planification, fermeture/localisation tardive, concurrence, erreurs, délai réel de 15 secondes et noms agrandis vérifiés. Aucun service public interrogé, coordonnées réelles récupérées ou serveur utilisateur modifié ; disponibilité publique, Safari/iPhone et géolocalisation réelle restent à tester.

## Hors connexion et partage

**Contexte :** consulter courses et recettes sans réseau sans exposer automatiquement des données privées dans un cache.

**Choix :** copie volontaire locale, page de secours seule en service worker, aucune interception des API/écritures. Envoi volontaire des nouveaux achats : cocher seulement les articles encore compatibles, jamais décocher le foyer ou recréer un article disparu. Favoriser le partage natif, puis copie et téléchargement texte de secours ; annulation sans effet secondaire.

**Alternatives écartées :** synchronisation bidirectionnelle silencieuse, mise en attente générale des mutations, import automatique dans Rappels iOS/Android et notification de minuteur garantie en arrière-plan.

**Limites :** quota et stockage gérés par le navigateur, copies de recettes non actualisées automatiquement ; origine HTTP/HTTPS et mode installé pouvant séparer le stockage. Désactiver un compte ne peut pas effacer un téléphone hors réseau. Les minuteurs locaux nécessitent la page ouverte et ne garantissent ni son ni notifications. Tests Chromium et API simulées ne valident pas les politiques réelles de Safari/Android.

## Comptes, HTTPS et invitations

**Contexte :** accès privé au foyer sur LAN/VPN, sans domaine ni reverse proxy.

**Choix :** comptes/sessions dans une base distincte, scrypt, cookies protégés, contrôle d'origine, expiration et limitation des tentatives. Premier administrateur créé par commande, sans inscription publique ni mot de passe fixe. HTTPS natif facultatif avec autorité locale explicitement approuvée sur les appareils, sans repli silencieux en HTTP.

**Invitations :** un lien privé, 24 heures, une seule inscription membre ; secret dans le fragment et haché en base, révocation possible. SMTP désactivé par défaut, TLS/STARTTLS et certificat vérifiés, destinataire non conservé par Manger!, un envoi simultané et cinq tentatives/heure. Une acceptation SMTP n'est pas une preuve de livraison.

**Limites :** ni compte ni VPN ne chiffre une URL HTTP ; une adresse d'écoute n'est pas une liste de clients autorisés. Filtrage des ports Docker à vérifier sur le réseau ; aucune exposition Internet directe recommandée. L'autorité locale et les clés doivent être protégées ; certificat serveur à renouveler, pas de renouvellement automatique. Fournisseur SMTP réel et réception non vérifiés ; ne pas assouplir les sessions pour contourner un bug de partage.

## Certificat pour les appareils invités — 11 octobre 2026

**Contexte / blocage :** un invité rapporte que Safari refuse le site sans proposer d’exception. Le refus précis n’a pas été reproduit : certificat non approuvé, adresse/SAN, expiration et réseau/VPN restent des causes possibles. Quand TLS bloque avant le chargement HTML, proposer un téléchargement uniquement dans la page invitée serait inutilisable.

**Choix et raison :** l’administrateur déjà connecté récupère le certificat public et l’envoie par un canal de confiance **avant** l’invitation. Aide repliée dans le volet existant, contrôles et couleurs conservés ; boutons explicites, empreinte qui revient à la ligne, guide copiable avec sélection manuelle de secours. Les principes Apple Design (`onboarding.md › Best practices`, `privacy.md › Protecting data`, `buttons.md › Content`) ont guidé la présentation : aide contextuelle, trust expliqué sans consentement simulé, pas de nouvel écran. Ponytail : bibliothèque standard `X509Certificate`, options TLS et protection administrateur existantes, aucune dépendance ni migration.

**Frontière de sécurité :** `MANGER_TLS_CA` est lu au démarrage HTTPS. L’aide exige une autorité racine auto-signée valide qui a signé le certificat serveur valide au démarrage ; une autorité absente, invalide ou sans correspondance n’est pas proposée. `GET /api/accounts/certificate` exige une session administrateur, ne renvoie que `X509Certificate.raw` en DER, en pièce jointe `manger-ca.cer`, sans cache et avec `nosniff`. Même un PEM contenant une clé ne l’exporte pas. La clé d’autorité reste hors du montage Docker. La lecture ne modifie ni sessions ni invitations ; les fichiers ne sont pas mis dans le cache hors connexion.

**Alternatives écartées :** serveur HTTP public supplémentaire pour contourner Safari, désactivation TLS, confiance silencieuse, assouplissement de `SameSite`, pièce jointe SMTP automatique et nouveau parcours obligatoire. Le partage natif n’apparaît qu’après lecture réussie du fichier et acceptation par `canShare`, avant le geste utilisateur pour préserver l’activation du navigateur. Préparation limitée à 10 secondes, doubles demandes bloquées, partage annulé sans autre action ; téléchargement classique et guide restent disponibles.

**Conséquences / limites :** installer une autorité permet d’approuver ses certificats pour d’autres sites, pas seulement Manger! L’invité doit connaître l’administrateur et vérifier l’empreinte par un autre canal de confiance ; il peut retirer le profil ensuite. Aucun fichier n’est accessible via ce HTTPS avant que l’appareil puisse y accéder : partage par AirDrop/courriel externe nécessaire. La confiance n’est pas une réparation de réseau/VPN ni d’un SAN erroné ou d’un certificat expiré. SMTP rappelle la condition sans pièce jointe. Le comportement de partage/d’installation reste géré par iOS ; pas de garantie depuis un navigateur local.

**Validation :** tests TLS réels avec OpenSSL sur données temporaires, contrôle des rôles, DER, empreinte et absence de clés ; tests logiques du partage et de la copie. Rendu et téléchargement navigateur contrôlés séparément après implémentation ; résultats exacts consignés dans la feuille de route. Installation de profil, confiance complète, partage natif Safari et installation Ubuntu restent à valider sur les appareils utilisateur.

## Import, export et récupération

**Contexte :** récupérer des recettes externes et sauvegarder les données sans exposer le serveur ou écraser le foyer par erreur.

**Choix :** import HTTPS public IPv4 uniquement avec contrôles SSRF, redirections/DNS revérifiés et limites de durée/taille. Prévisualisation et relecture avant sauvegarde ; pas d'exécution JavaScript, traduction ou photo récupérée automatiquement. Fermer l'aperçu annule l'attente client, pas nécessairement le téléchargement déjà commencé côté serveur.

**Formats :** JSON recettes distinct de la sauvegarde SQLite du foyer ; calendrier ICS sans heure. L'export ICS utilise une pièce jointe classique pour éviter le refus Safari rapporté. La sauvegarde du foyer n'inclut ni `accounts.db`, ni TLS, ni configuration SMTP.

**Restauration :** aperçu et confirmation, compatibilité de schéma, copie de récupération avant remplacement et transaction. L'outil en ligne de commande restaure vers un nouveau fichier et refuse une destination existante. Sauvegardes privées non chiffrées ; seul un fichier de confiance doit être utilisé.

**Protection du formulaire (10 octobre) :** le parcours et la confirmation native sont conservés selon Ponytail. Un verrou commun empêche vérification/remplacement simultanés, bloque fermeture et édition du foyer, puis restaure les états désactivés précédents. Le bouton de vérification est identifié directement, sans dépendance à `submitter`. Délai navigateur de 30 secondes, choisi plus généreux que les petites écritures en raison du fichier pouvant atteindre 32 Mo. Aucun nouvel écran, dépendance, changement de schéma ou assouplissement serveur.

**Téléchargement concurrent :** une sauvegarde déjà en préparation empêche de commencer l'aperçu ou le remplacement. Son verrou existant est réutilisé plutôt qu'ajouter un gestionnaire d'opérations ; cela évite que la fin du téléchargement déverrouille un contrôle pendant la restauration ou que la restauration remette un ancien état d'attente après la fin du téléchargement.

**Téléchargement borné (10 octobre) :** une connexion silencieuse pouvait laisser le bouton désactivé indéfiniment. Le téléchargement Blob existant est conservé selon Ponytail, avec attente de 30 secondes couvrant en-têtes et corps, libellé de préparation et `aria-busy`. Le même verrou reste actif jusqu'au fichier complet et empêche le démarrage pendant une restauration. Les refus sans JSON reçoivent un message lisible, un fichier vide est refusé et le lien temporaire est retiré même si son clic échoue. L'URL Blob est libérée après 60 secondes, comme auparavant, pour laisser le navigateur prendre le fichier. Aucun nouvel écran, gestionnaire partagé, changement serveur, dépendance ou migration.

**Conséquences :** cette lecture ne change pas le foyer et ne retente rien automatiquement. Le délai peut interrompre une grosse copie ou un réseau lent ; un nouvel appui est possible après vérification de la connexion. Le serveur peut encore préparer la copie après l'abandon navigateur et refuser momentanément une nouvelle demande. Une confirmation de lancement n'est pas une preuve d'enregistrement sur l'appareil ; le client ne valide pas toute l'intégrité SQLite. Alternative écartée : conserver une attente illimitée ou annoncer une sauvegarde enregistrée sans confirmation du navigateur.

**Contrôle du téléchargement :** cinq tests logiques couvrent verrou, durée, erreurs, corps vide et nettoyage. Chromium a réellement téléchargé une copie SQLite d'une base isolée, contrôlée en lecture seule par son en-tête, son intégrité et son contenu ; délai réel de 30 secondes, reprise volontaire et rendu vérifiés. Les comptes/protections serveur existants ne sont pas assouplis. Safari/iPhone, enregistrement réel sur téléphone et serveur Ubuntu non vérifiés pour ce lot ; résultats dans la feuille de route.

**Résultat incertain :** succès HTTP du remplacement = restauration confirmée, sans exiger de relire le JSON pour déclencher le rechargement. Un échec de ce rechargement ne permet pas de rejouer la restauration. Après perte réseau/délai, jeton retiré et message demandant de recharger puis vérifier les données avant toute nouvelle tentative ; un nouveau remplacement exige un nouvel aperçu et une nouvelle confirmation. Pas de renvoi automatique ni garantie d'annulation serveur. Un refus reste distinct d'une réponse perdue ; l'aperçu valide le jeton et les compteurs avant affichage. Alternative écartée : réessayer automatiquement une opération qui remplace le foyer.

**Vérification :** tests logiques du formulaire et protections des profils/protéines, restauration serveur sur bases isolées et parcours Chromium. Un premier contrôle HTTP isolé a rencontré `EACCES` sur `127.0.0.1:2163` ; la suite avec connexions locales autorisées a passé. Les anciens harnais profils/protéines ont été actualisés pour inclure le verrou de restauration, sans retirer leurs assertions. Résultats complets et limites dans la feuille de route ; aucun remplacement du foyer réel, accès Ubuntu ou essai Safari/iPhone.

**Validation :** restauration testée sur données isolées, jamais sur le foyer réel. Export calendrier rapporté fonctionnel sur Safari iPhone ; autres systèmes non validés. Les sites sans Recipe structuré, avec connexion ou blocage ne sont pas contournés.

## Validations et blocages restants

### Appareils et serveur

**Établi :** l'utilisateur a rapporté Docker healthy, accès téléphone, persistance après redémarrage, sauvegarde/aperçu, HTTPS et logo iPhone après confiance totale du certificat, ainsi que l'export calendrier Safari. Ces observations restent historiques ; elles ne valident pas les derniers lots.

**Reste à vérifier :** derniers parcours sur Safari iPhone après mise à jour ; Android/autres OS non disponibles pour les essais utilisateur ; géolocalisation, maintien de l'écran, audio et hors connexion réels. Le test HTTPS de la dernière suite est ignoré faute d'OpenSSL disponible dans l'environnement local. Action : lancer ce test dans un environnement équipé, sans en déduire la confiance d'un téléphone.

### Déconnexion Safari au retour du partage

Signalement du 1er octobre : déconnexion au retour du partage d'invitation, sans utilisation du lien. Le **12 octobre, l'utilisateur indique que ce n'est plus le cas** : retiré des problèmes actifs. La cause et une éventuelle correction technique ne sont pas établies ; ce retour ne constitue pas une reproduction locale. En cas de réapparition, relever les statuts de session au retour sans publier cookies ou secrets ; « Copier le lien » reste disponible.

### Image Docker publiée

Compose construit `manger:0.1.0` localement ; aucune image préconstruite n'est publiée. Publication explicitement reportée, pas un service bloqué. Déblocage futur : choisir un registre et un environnement de construction autorisé, vérifier l'image puis publier une version. **Ne pas utiliser le serveur Ubuntu de l'utilisateur pour construire ou publier.**

### Courriels et recettes

SMTP testé avec messagerie simulée et refus STARTTLS réel local, sans envoyer de vrai courriel. Réception et configuration fournisseur restent à vérifier volontairement. Les recettes du catalogue n'ont pas été toutes cuisinées ; les durées sont indicatives. Des promesses nutritionnelles, de conservation, de coût ou d'allergies ne doivent pas être ajoutées sans données adaptées.

### Évolutions différées

Vraie adaptation tablette/PC, prix indicatifs, extension des calendriers régionaux, carte restaurants et foyers isolés nécessitent des décisions séparées. Aucun travail automatique ne doit reprendre après une demande d'arrêt. Les captures/inspirations ne suffisent pas à autoriser une nouvelle refonte : maquette approuvée avant gros changement visuel.

## Regroupement documentaire du 10 octobre 2026

### Résumé d'architecture

**Choix :** compléter `ARCHITECTURE.md`, déjà présent dans `docs/`, par un résumé et une vue d'ensemble plutôt que créer une seconde description. Les imports, le lancement de `createApp()`, les fichiers de persistance et Compose sont les sources de vérification ; aucun changement applicatif n'est nécessaire.

**Limite de l'outil d'analyse :** Graphify affiche sa version, mais signale un chemin Python introuvable ; l'interpréteur `python` accessible par défaut ne peut pas démarrer dans cet environnement. Aucun graphe n'est généré et aucune relation n'est attribuée à un graphe. Vérification directe du code en repli ; résoudre l'interpréteur installé avant une future extraction Graphify, sans réinstaller ni ajouter de dépendance au projet pour cette demande documentaire.

**Choix :** mettre les documents complets dans `docs/`, conserver des liens d'entrée à la racine pour les anciennes instructions et les outils, ajouter des vues fonctionnalités/architecture/décisions. Cela évite de maintenir deux copies du guide et de perdre les détails des lots passés.

**Corrections :** retirer les affirmations périmées « pas de restauration dans l'interface » et « aucun achat hors connexion envoyé plus tard ». Documenter séparément ce qui est automatique et volontaire, ainsi que les validations historiques et actuelles. Aucune nouvelle fonction applicative ni règle métier introduite.

**Vérification effectuée :** 13 documents et leurs liens/ancres locaux contrôlés ; tous les blocs de commandes transférés à l'identique, passages historiques préservés hors corrections explicitement listées. Contrôle du nombre de recettes et des points d'entrée de l'architecture dans le code. Aucun code applicatif ni donnée personnelle modifié. La suite applicative n'est pas relancée pour ce changement Markdown ; aucun nouveau test téléphone ou serveur effectué. Tout ancien résultat cité reste daté et attribué à son lot.

## Premiers calendriers régionaux — 12 octobre 2026

**Contexte et choix :** conserver le filtre facultatif et le calendrier national existants. Ajouter un sélecteur natif « Calendrier », uniquement visible avec « De saison », sur sa propre ligne. Apple Design guide les commandes natives, libellés explicites et cibles tactiles ; Ponytail guide la réutilisation du module existant, sans nouvelle dépendance, écran ou migration. Le calendrier choisi se mémorise dans `manger-season-region-v1` sur l'appareil, comme l'apparence ; un stockage refusé ou une valeur inconnue ne bloque pas l'ouverture. Le mois, les ingrédients, le planning, les goûts et le menu automatique ne sont pas modifiés. Aucun GPS, appel externe ou écriture SQLite lors du filtrage.

**Sources et couverture :** [Manger Bouger](https://www.mangerbouger.fr/manger-mieux/bien-manger-sans-se-ruiner/calendrier-de-saison) reste la base nationale partielle (consultée le 7 octobre). [Région Bretagne](https://www.bretagne.bzh/actualites/de-janvier-a-decembre-mangez-breton-sans-vous-tromper/), publication du 22 janvier 2026 consultée le 12 octobre, fournit des listes mensuelles : seuls les produits déjà reconnus et non ambigus sont repris ; « chou, tous types » inclut les choux reconnus, et mars pour l'asperge signifie fin mars. Le céleri-rave n'est pas étendu au céleri-branche ; les céleris, panais et potimarrons gardent le repère national. [Où acheter local, Hauts-de-France](https://ouacheterlocal.fr/produits-de-saison/janvier/), consulté le 12 octobre, donne explicitement septembre–mai pour la pomme et octobre–mars pour la betterave : seuls ces deux repères sont repris. Les longues listes « on déguste aussi » ne sont pas retenues car leur extraction contient des produits estivaux en janvier. Les autres produits restent nationaux ; l'aide expose ce complément et la source sélectionnée.

**Alternatives écartées et limites :** pas de décalage climatique arbitraire nord/sud, pas de région déduite de l'adresse ou du profil et pas de faux calendrier exhaustif pour les treize régions. Un ancien PDF redirigé vers une page d'accueil ne fait pas office de donnée vérifiée. La saison ne prouve ni l'origine des achats, ni le mode de culture ou de conservation ; les sources mensuelles peuvent inclure des produits stockés. Ingrédients inconnus et transformés ne créent toujours pas de repère positif. Désactiver le filtre retrouve toutes les recettes. Les autres régions et l'extension Hauts-de-France restent à documenter avant ajout.

**Validation locale :** 189 tests Node réussis, aucun ignoré, HTTPS réel inclus. Parcours Chromium sur base isolée : trois calendriers et douze mois, références et couverture, sélection mémorisée puis rechargement, valeur périmée/invalide, recherche/univers/durée/réinitialisation sans perdre le mois ou le calendrier, aucune écriture du foyer. Contrôle 320/390/760 px clair/sombre, absence de chevauchement des sélecteurs, texte à 200 % et inspection des captures. Échec de lecture/écriture du stockage simulé dans les tests. Pas d'essai Safari réel ni de changement sur Ubuntu ; saison sans test culinaire ni preuve de provenance des produits.

### Mois courant de l'appareil — précision du 12 octobre

**Contexte et choix :** à la demande de l'utilisateur, la saison doit suivre le mois en cours, sans mois fixe. Le précédent sélecteur prenait déjà le mois local à l'ouverture, mais permettait de le changer et ne le réactualisait pas. Remplacer ce sélecteur par « En ce moment · mois » ; `new Date()` et `getMonth()` dans le navigateur utilisent l'horloge et le fuseau local de l'appareil. Aucun mois enregistré, aucune permission, dépendance ou date récupérée du serveur. L'année 2026 utilisée uniquement pour les anciennes étiquettes de mois disparaît de ce parcours.

**Actualisation et limites :** recalcul lors du rendu et reprise des événements visibilité/focus/ouverture de Recettes. Contrôle local toutes les 60 secondes, sans réseau et sans rendu si le mois n'a pas changé ou si l'écran est caché. La limite de délai est de 60 secondes au premier plan, sous réserve de l'exécution des timers par le navigateur ; au retour d'arrière-plan le mois est revérifié. Une date ou un fuseau système mal réglé produit un mois incorrect. La semaine du planning n'influence pas le filtre. Conserver le choix de région, les données et les autres filtres ; pas de nouveau réglage « automatique/manuel » superflu. Apple Design guide le libellé non interactif ; Ponytail guide la suppression du contrôle et la réutilisation du filtre.

**Validation locale :** 190 tests Node réussis, aucun ignoré, HTTPS inclus. Actualisation au changement de mois et absence de rendu inutile/caché testées en isolation. Chromium avec horloge simulée : trois calendriers et douze mois système successifs, retour visibilité/focus/onglet, décembre–janvier, fonction du contrôle périodique, deux fuseaux (Auckland et Los Angeles) donnant des mois différents au même instant UTC. Région conservée, filtres/reset/rechargement, 320/390/760 px clair/sombre et texte à 200 % contrôlés ; captures inspectées, aucune écriture des données du foyer. Timers mobiles et horloge réelle iOS/Android non testés sur appareil, Ubuntu inchangé.
