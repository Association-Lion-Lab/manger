# Choix techniques, limites et blocages

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
