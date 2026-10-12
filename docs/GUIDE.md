# Guide complet de Manger!

Documentation de référence regroupée le 10 octobre 2026. Les commandes ci-dessous s'exécutent depuis la **racine du dépôt**, pas depuis `docs/`. Les comptes et données personnels ne sont pas inclus dans Git.

Voir aussi [l'index de la documentation](README.md), [les fonctionnalités réalisées](FONCTIONNALITES.md), [l'architecture](ARCHITECTURE.md) et [les choix et blocages](DECISIONS.md).

> On mange quoi cette semaine ?

**Manger!** est un planificateur de repas libre et auto-hébergeable. Il rassemble les recettes, les repas à la maison, les sorties, les rendez-vous et la liste de courses dans un même calendrier.

## État du projet

La version en développement permet de planifier des recettes, des sorties et des dates, puis de générer la liste de courses correspondante. Les foyers mixtes peuvent enregistrer les régimes de leurs membres, attribuer une protéine compatible à chacun autour d'une base commune ou coordonner plusieurs recettes différentes. Le catalogue, le placard, les restes, les comptes, les copies hors connexion et les protections contre les erreurs réseau sont implémentés. Les validations locales et les essais sur appareils réels sont distingués dans [le suivi](ROADMAP.md) ; une maquette approuvée ne valide pas à elle seule le déploiement.

## Lancer localement

Depuis une fiche recette, **Cuisiner cette recette** ouvre les étapes guidées et les ingrédients. Chaque étape chronométrée dispose d'un minuteur indépendant : démarrer, mettre en pause, reprendre et réinitialiser. Passer à une autre étape ne l'arrête pas. Quitter le mode cuisine annule les minuteurs. « Confort de cuisine » propose un son optionnel en fin de minuteur et le maintien de l'écran allumé, selon les autorisations du navigateur. Ces options utilisent les API natives [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) et [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext), sans dépendance. Les alertes peuvent être retardées en arrière-plan ; aucune notification système n'est envoyée. Les durées servent de repères, pas de garantie de cuisson.

Le nombre de portions est ajustable de 1 à 100 dans la fiche et le mode cuisine : les ingrédients sont recalculés sans modifier la recette, le planning ou les courses. Les instructions rédigées et les durées ne sont pas recalculées automatiquement ; adaptez la cuisson si nécessaire. Changer les portions ne réinitialise pas les minuteurs.

La fiche présente les favoris et la fermeture dans une barre qui reste accessible pendant le défilement. « Planifier ce repas » et « Cuisiner cette recette » se trouvent après les portions, avant les ingrédients et les étapes. « Le menu reste inchangé » rappelle la limite du recalcul et permet d'en lire le détail ; « Gérer cette recette » regroupe modification, duplication, impression et suppression. Aucun changement de données ou de calcul n'est lié à cette présentation.

La suppression demande confirmation et bloque la fiche pendant l'envoi (15 secondes maximum), sans doublon ni renvoi automatique. Une recette utilisée dans le planning ne peut pas être supprimée. Un refus conserve la fiche et les notes non enregistrées ; une réponse perdue invite à recharger les recettes avant de réessayer, car le serveur a peut-être reçu la demande. Après confirmation, la recette disparaît du catalogue affiché même si la relecture échoue ; « Réessayer » recharge seulement les données. Les copies personnelles hors connexion restent indépendantes. Les boutons de gestion s'empilent si la largeur ou le texte agrandi l'exige.

Prérequis : Node.js 24 ou plus récent. `npm ci --ignore-scripts` installe la dépendance de messagerie Nodemailer à la version verrouillée. Docker le fait pendant la construction de l'image.
Depuis la fiche recette, « Imprimer / PDF » ouvre l'impression du navigateur : sélectionnez votre imprimante ou l'enregistrement en PDF. La fiche contient les ingrédients pour les portions choisies, les étapes et le lien source éventuel. Les durées et instructions restent celles de la recette d'origine.

```shell
npm ci --ignore-scripts
npm start
```

Ouvrez ensuite <http://localhost:3000>. Les données sont conservées dans `data/manger.db`.

```shell
npm test
```

## Docker

```shell
docker compose up -d --build
```

L'application est ensuite disponible sur <http://localhost:3000>. Le volume Docker `manger-data` conserve la base SQLite entre les mises à jour.

Cette commande construit localement l'image `manger:0.1.0` ; aucune image préconstruite n'est encore publiée. Docker Engine et le module Compose sont nécessaires. L'utilisateur a rapporté une construction Ubuntu fonctionnelle et un service healthy ; aucune nouvelle construction de cette révision documentaire n'a été effectuée sur son serveur. Voir les limites actuelles dans [le suivi](ROADMAP.md).

Pour le téléphone, connecté au même réseau de confiance, ouvrez `http://ADRESSE_IP_DU_SERVEUR:3000`. Autorisez ce port uniquement sur votre réseau privé. `MANGER_HTTP_PORT` permet de choisir un autre port hôte si nécessaire. La géolocalisation et le maintien de l'écran nécessitent HTTPS sur téléphone : Docker seul ne les active pas. La recherche par ville reste disponible en HTTP.

Contrôle d'une installation neuve :

1. Dans une copie du dépôt sur une machine Docker, lancez `docker compose -p manger-validation up -d --build` (port 3000 libre).
2. Vérifiez `docker compose -p manger-validation ps` : le service doit devenir `healthy`. `GET /api/health` répond avec le statut et la version, sans donnée privée.
3. Depuis le téléphone, créez une recette et un repas, puis vérifiez les courses.
4. Lancez `docker compose -p manger-validation restart` et vérifiez que les données sont conservées.
5. Téléchargez une sauvegarde, vérifiez son aperçu et testez sa restauration uniquement sur cette instance de validation. Arrêtez-la avec `docker compose -p manger-validation down` ; le volume reste conservé. N'ajoutez pas `-v` si vous souhaitez garder ses données.

### Ubuntu : accès LAN et VPN

Dans le dossier du dépôt, créez un fichier `.env` (ou modifiez celui qui existe) :

```dotenv
MANGER_BIND_ADDRESS=192.168.1.31
MANGER_HTTP_PORT=3000
```

Remplacez cette adresse d'exemple par l'IPv4 réellement présente sur votre serveur. Réservez-la dans le DHCP du routeur pour qu'elle reste stable. `.env` est local : il n'est envoyé ni dans Git ni dans le contexte Docker. Sans configuration, le port reste publié sur `0.0.0.0`.

Appliquez et contrôlez la configuration :

```shell
docker compose config
docker compose up -d --build
docker compose ps
curl --fail http://192.168.1.31:3000/api/health
```

Le navigateur du téléphone utilise cette même adresse si le Wi-Fi ou le VPN permet de joindre le réseau local. Si le VPN arrive sur le routeur, le serveur n'a pas nécessairement sa propre interface VPN. Après liaison à cette IPv4, `localhost:3000` n'est plus l'adresse de contrôle du port publié ; le contrôle de santé interne au conteneur reste inchangé.

Le choix de l'adresse d'écoute n'est pas une liste d'adresses clientes autorisées : toute machine pouvant atteindre cette adresse peut potentiellement accéder au service. Le filtrage LAN/VPN reste à appliquer sur votre réseau et avec des règles compatibles Docker. Une règle UFW seule ne garantit pas le filtrage des ports publiés. Voir la documentation Docker sur la [publication des ports](https://docs.docker.com/engine/network/port-publishing/) et les [pare-feu](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

### Mettre à jour l'installation

Téléchargez d'abord une sauvegarde depuis « Mon foyer », puis, dans le même dossier et avec le même nom de projet Compose :

```shell
git pull --ff-only origin development
docker compose up -d --build
docker compose ps
```

Le volume et le fichier `.env` sont conservés. Changer le dossier ou le nom du projet Compose peut sélectionner un autre volume et donner l'impression d'un foyer vide. En cas d'échec du démarrage, consultez `docker compose logs --tail=80 manger`.

## Principes

### Naviguer dans le planning

Le planning s'ouvre sur le jour courant de l'appareil. Les flèches changent de semaine ; touchez la période affichée entre les flèches pour choisir directement une date (de 1900 à 2100) avec le sélecteur natif du navigateur. « Aujourd’hui » apparaît quand un autre jour est sélectionné et permet de revenir en un toucher. Les semaines à cheval sur deux mois ou deux années affichent les deux bornes.

Sous les deux actions principales, « Réutiliser un menu » donne accès à « Reprendre une semaine » et « Mes semaines types » dans la fenêtre existante. « Retour aux menus » permet de changer de choix ; le retour est bloqué pendant une copie ou une modification des semaines types. « Exporter » télécharge la semaine affichée sous forme de fichier `.ics` à importer dans un calendrier. Ces accès remplacent « Plus d’options » dans Semaine, sans ajouter d'onglet. La fiche recette conserve ses actions secondaires séparées.

Le bouton utilise `/api/calendar.ics?start=AAAA-MM-JJ&download=1` : pièce jointe `application/octet-stream`, pour éviter l'ouverture directe du calendrier qui a été refusée par Safari sur l'iPhone de test utilisateur. Sans `download=1`, l'API garde le type `text/calendar`. Les deux modes nécessitent une session ; aucun lien public ni abonnement automatique n'est créé. Le contenu reste un calendrier standard avec des repas sur la journée, sans heure. Le téléchargement et l'import sont deux opérations distinctes. L'utilisateur confirme le fonctionnement de l'export sur Safari iPhone le 7 octobre ; Android et les autres systèmes ne sont pas validés sur appareils réels.

Le planning affiché reste conservé pendant le chargement : les actions sur ses repas sont temporairement désactivées, mais les flèches restent utilisables. Seule la dernière demande peut actualiser le planning et sa copie de courses. En cas d'échec, le jour et les données précédents restent affichés. Un message propose « Réessayer » : après rétablissement de la connexion, ce bouton recharge la semaine et le jour demandés, sans recharger toute la page. Il est temporairement désactivé pendant la demande ; le message disparaît après réussite. Cela fonctionne aussi après un premier chargement échoué. Le bouton ne rejoue aucune création, modification ou suppression : il effectue uniquement des lectures. Il ne synchronise pas les coches hors connexion. Naviguer ne crée ni ne modifie de repas.

### Enregistrer une recette

La création, la modification, la copie et la validation d'une recette importée utilisent le même formulaire. Pendant l'envoi, « Enregistrement… » remplace le libellé du bouton ; les champs et la fermeture sont temporairement bloqués pour empêcher les doubles appuis et les modifications concurrentes. La demande expire après 15 secondes. En cas de refus ou de coupure réseau, le formulaire est réactivé et la saisie reste disponible tant que la page reste ouverte ; aucun brouillon n'est conservé après rechargement. Si la connexion coupe, l'enregistrement a peut-être abouti : vérifiez le catalogue avant de réessayer. Aucune écriture n'est relancée automatiquement. Une sauvegarde confirmée ferme le formulaire ; si la lecture du catalogue échoue ensuite, le message « Réessayer » recharge les données sans enregistrer à nouveau la recette.

### Enregistrer un repas

Pour reprendre une sortie, un date ou un repas avec invités, touchez le repas → « Changer ce repas », puis le même type d'occasion. Le formulaire retrouve le nom, le lieu et le nombre de personnes ; un date à la maison retrouve aussi sa recette. Pour les invités, choisir la même recette conserve le nom personnalisé ; choisir une autre recette reprend son titre tout en gardant le nombre de personnes. Passer à « Commander » ou « Sans recette » retire la recette. Ces deux choix sans recette ont la même représentation enregistrée : le nom existant est conservé, sans deviner le mode depuis le texte. Un autre type d'occasion et un nouveau créneau gardent leurs valeurs par défaut. Les repas de restes et les répartitions individuelles ne sont pas repris par ce préremplissage. Rien ne change avant « Enregistrer les modifications » ; les courses sont recalculées après validation. Pour un date, passer à un lieu extérieur retire sa recette à l'enregistrement.

Les repas partagés, les plats individuels, les invités, les dates et les ajouts depuis une fiche recette utilisent la même protection. Pendant l'envoi, les choix et la fermeture sont bloqués et « Enregistrement… » apparaît sous le titre, sans ajouter de bouton. La demande expire après 15 secondes. En cas d'échec, les choix restent disponibles dans la page ouverte ; ils ne sont pas conservés après rechargement. Une coupure peut survenir après l'enregistrement : vérifiez le planning avant de réessayer. Aucune écriture n'est renvoyée automatiquement. Après confirmation du serveur, le dialogue ferme ; si le rechargement échoue ensuite, « Réessayer » effectue uniquement des lectures.

### Courses, recettes hors connexion et écran d'accueil

Dans Courses, « Partager la liste » transmet uniquement les articles non cochés au partage natif du téléphone. Annuler ne copie ni ne télécharge rien. Si le partage est indisponible ou refusé, Manger! essaie de copier la liste ; si le presse-papiers est également indisponible ou refusé, il lance le téléchargement d'un fichier texte nommé d'après la semaine affichée. Un message discret précise le résultat. Une liste vide ou entièrement cochée n'est pas exportée. Ces actions ne modifient ni les courses partagées ni les copies hors connexion. Le fichier et le texte ne sont pas synchronisés après export ; une destination de partage peut proposer d'importer le texte, sans garantie d'intégration automatique aux Rappels iOS ou aux applications Android.

Depuis une adresse HTTPS reconnue par le téléphone, ouvrez Courses → Courses hors connexion → « Garder une copie sur cet appareil ». L'activation est volontaire. La dernière semaine chargée est conservée avec ses quantités, les cases déjà cochées et l'heure de mise à jour. Elle reste consultable quand le serveur ou le réseau est inaccessible, même après rechargement. Touchez une ligne pour cocher ou décocher un article : le compteur se met à jour, les lignes restent en place et les coches persistent sur cet appareil. Une erreur de stockage préserve la dernière copie ; une copie remplacée dans un autre onglet est rechargée avant une nouvelle tentative.

**Les nouveaux achats hors connexion sont conservés au retour du réseau**, même si vous consultez une autre semaine. Dans Courses, « Envoyer mes achats au foyer » apparaît uniquement lorsqu'il reste des achats locaux à envoyer. Cette action volontaire coche uniquement les articles toujours présents dans la semaine d'origine, avec le même aliment, la même unité et la même quantité. Les articles déjà cochés restent cochés ; ceux supprimés ou modifiés restent locaux et sont signalés. Aucun article n'est créé et aucune case du foyer n'est décochée. Les décoches hors connexion restent locales. L'envoi se fait par groupes de 50 ; s'il reste des achats, utilisez à nouveau le bouton. Un échec conserve les achats, sans renvoi automatique : vérifiez les courses avant de réessayer, car le serveur a pu recevoir la demande. Une réponse confirmée suivie d'un rechargement échoué ne rejoue pas l'envoi. Il ne s'agit pas d'une synchronisation bidirectionnelle ni d'un historique des changements effectués sur d'autres appareils.

Sans achat en attente, les lectures réussies actualisent la copie et consulter une autre semaine la remplace. « Abandonner les achats locaux », dans Courses hors connexion, demande confirmation puis reprend la liste du foyer sans modifier le serveur ni les recettes enregistrées. Les anciennes copies restent lisibles et cochables localement ; réenregistrez une liste en ligne pour bénéficier de l'envoi. Profils et sauvegardes ne sont pas mis en cache. « Effacer toutes les copies sur cet appareil », sur la page hors connexion, supprime les copies de courses et de recettes et désactive l'actualisation des courses, sans toucher au serveur.

Dans une fiche recette, ouvrez **« Cette recette hors connexion » → « Garder cette recette sur cet appareil »**. La copie conserve le titre, les ingrédients recalculés pour les portions affichées, les étapes avec leurs durées d'origine et le lien source éventuel. Si la recette possède une photo, cochez **« Inclure une petite photo sur cet appareil »** pour l'ajouter à cette copie ; elle est réduite et stockée localement dans le même navigateur. Ce choix est désactivé par défaut et une photo trop lourde peut être refusée. La copie n'ajoute pas les suppléments de protéines d'un repas. Jusqu'à 20 recettes peuvent être conservées (1 million de caractères au total, sous réserve du quota du navigateur) ; enregistrer à nouveau la même recette remplace sa copie. Les recettes ne s'actualisent **pas automatiquement** : refaites une copie après modification. Les notes privées et modifications hors ligne ne font pas partie de cette consultation.

Les étapes avec une durée renseignée proposent un **minuteur hors connexion** : démarrer, pause, reprise et réinitialisation. Les minuteurs utilisent une échéance pour retrouver le temps restant après une suspension du navigateur, mais ne produisent ni son ni notification système. Gardez la page ouverte : recharger, quitter la page ou modifier/effacer les copies réinitialise les minuteurs. Les anciennes copies restent lisibles ; réenregistrez-les depuis la fiche en ligne pour ajouter les durées structurées. Une durée manquante n'est pas déduite du texte. Les essais automatisés Chromium couvrent la coupure réseau ; le comportement réel de Safari en arrière-plan reste à vérifier.

Le lien « Voir mes recettes enregistrées » ouvre la page hors connexion commune aux recettes et aux courses. Chaque recette porte sa date de copie et peut être retirée indépendamment. Une erreur de stockage préserve les copies déjà présentes. Le serveur reste la source de référence : une copie peut rester ancienne même après suppression ou restauration d'une recette en ligne.

La copie est accessible aux personnes utilisant ce navigateur ; elle peut être ancienne et le navigateur peut supprimer son stockage. Vérifiez qu'elle est disponible avant de partir. Aucune modification hors connexion n'est envoyée automatiquement. Seuls les nouveaux achats peuvent être envoyés volontairement avec l'action décrite ci-dessus ; les décoches restent locales. Revenez à Manger une fois connecté pour modifier la liste partagée du foyer.

Le manifeste et les icônes permettent l'ajout à l'écran d'accueil depuis le menu du navigateur compatible (sur iPhone, le menu de partage de Safari). Activez la copie depuis le mode installé si son stockage est distinct de celui du navigateur. L'installation et le stockage restent gérés par le navigateur. HTTPS est requis pour le service worker, sauf en développement sur localhost : `http://192.168.1.31:3000` et un VPN seuls ne suffisent pas. Voir [le fonctionnement des service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers). HTTPS et l'affichage du logo sur iPhone ont été confirmés par l'utilisateur après activation de la confiance totale pour le certificat local ; le cochage hors connexion sur iPhone et Android reste à valider.

Le service worker ne conserve que la page de secours `/offline.html` ; les données de courses sont enregistrées séparément dans le stockage local après consentement. Les API et les écritures ne sont jamais interceptées. Lors d'une modification de la page de secours, incrémentez la version du cache dans `public/sw.js`.

L'interface conserve quatre onglets : Semaine, Recettes, Courses et Compte. Les actions secondaires des recettes sont regroupées dans « Gérer cette recette » ; les notes et les options de cuisine sont repliées par défaut. Les contrastes des boutons principaux sont corrigés en clair et en sombre.

Une photo personnelle peut être ajoutée depuis l'éditeur, dans « Photo du plat ». JPEG, PNG ou WebP jusqu'à 10 Mo : le navigateur redimensionne à 960 pixels maximum puis convertit en JPEG avant envoi (400 000 caractères maximum pour la donnée encodée). Les photos sont conservées dans SQLite, chargées séparément et copiées avec les variantes. La suppression de la photo prend effet à l'enregistrement. Aucune photographie n'est importée automatiquement depuis un site tiers.

« Mon avis et mes notes » enregistre une appréciation de 1 à 5 (ou aucune note) et un commentaire de 2 000 caractères maximum, communs au foyer. Modifier une recette conserve cet avis ; dupliquer une recette ne le copie pas.

Pendant cet enregistrement, la saisie et les actions qui quittent la fiche sont temporairement bloquées ; les doubles envois sont ignorés. Après 15 secondes au maximum, les contrôles sont rendus disponibles. Un refus ou une connexion interrompue conserve le brouillon dans la fiche ouverte, sans renvoi automatique. Si la confirmation est perdue ou illisible, vérifiez les notes enregistrées avant de réessayer : le serveur peut avoir reçu la modification. Le brouillon n'est pas conservé après fermeture ou rechargement de la page. Entre plusieurs appareils, la dernière écriture reçue reste prioritaire ; il n'y a pas encore de détection des modifications simultanées pour les avis.

Une fiche recette permet d'ajouter ou retirer un favori. « Mes favoris » dans le filtre Univers du catalogue et du choix des plats affiche uniquement ces recettes. Les favoris sont communs au foyer et persistants, sans changer les règles de régime ni les ingrédients des courses.

Un seul changement de favori est envoyé à la fois pour une même recette, même depuis plusieurs cartes ou une fiche ouverte pendant l'envoi. L'attente est limitée à 15 secondes. Changer de fiche reste possible : une réponse ancienne ne modifie ni le bouton ni le message de la nouvelle recette. Une réponse perdue est signalée sans renvoi automatique ; rechargez les recettes avant de recommencer pour vérifier l'état reçu par le serveur.

Le bar à protéines dans Mon foyer protège l'ajout, la modification et le retrait contre les doubles appuis. Pendant l'envoi, le formulaire et les changements de personne/protéine sont bloqués, ainsi que la fermeture du foyer ; l'attente réseau est limitée à 15 secondes. Une erreur conserve les champs. Une modification confirmée ne sera pas renvoyée si le rechargement échoue : utilisez Réessayer dans la semaine. Une réponse perdue peut correspondre à un ajout déjà reçu ; vérifiez le bar avant de recommencer. Les règles de régime et la protection des protéines utilisées dans le planning restent contrôlées par le serveur.

Déplacer, copier, prévoir des restes et retirer un repas utilisent la même protection que l'ajout au planning : choix et fermeture bloqués pendant l'envoi, délai de 15 secondes, choix conservés dans la fenêtre en cas d'erreur et aucun renvoi automatique. Les créneaux occupés, les liens de restes et leur chronologie restent protégés par le serveur. Un retrait refusé affiche maintenant la raison dans la fenêtre. Après une modification confirmée, un échec de rechargement se reprend avec Réessayer dans la semaine, sans refaire l'action.

Copier une semaine passée et appliquer une semaine type utilisent cette même protection. Créer ou supprimer une semaine type bloque aussi les autres actions et la fermeture pendant l'envoi ; un refus garde le nom saisi. Le délai d'écriture est de 15 secondes et celui de relecture de la liste de 10 secondes. Une création ou suppression confirmée reste annoncée si la liste ne se recharge pas : fermez puis rouvrez les semaines types sans refaire la modification. Les repas et les courses ne sont pas supprimés quand une semaine type est retirée.

Dans « Mon foyer », chaque personne possède son champ « N’aime pas » (50 aliments ou expressions maximum). Les goûts **classent, sans exclure** : recettes adaptées d’abord, préparation inconnue ensuite, goûts incompatibles en dernier. Les régimes et le temps disponible restent des filtres stricts. Les suggestions communes tiennent compte du foyer entier ; le menu automatique utilise les participants cochés et équilibre préférences et variété. Une recette inconnue peut être proposée plutôt qu’un plat déjà répété. L’aperçu indique « À vérifier pour [personne] » ou « Moins adapté aux goûts de [personne] » pour les plats sélectionnés ; ces indications suivent les changements de plats. Aucune confirmation supplémentaire n’est exigée.

Pour « tomate crue », l’état vient du champ facultatif **Servi : cru / cuit / non précisé** de chaque ingrédient, pas d’une déduction à partir des étapes. Le champ reste replié dans l’éditeur et est conservé par duplication et export/import JSON. Les imports internet non renseignés restent disponibles. Les originaux du catalogue sont annotés selon leurs instructions ; les anciennes copies ne sont mises à jour que si leurs ingrédients, quantités et étapes correspondent exactement. Les recettes personnalisées et les états déjà renseignés sont préservés. Ce n’est pas une protection contre les allergies : ingrédients cachés, synonymes, traces et contaminations croisées ne sont pas détectés. Les anciens goûts communs restent dans un volet replié pour être transférés manuellement aux bonnes personnes puis effacés, sans attribution arbitraire.

## Importer et exporter des recettes

Dans l'onglet Recettes, le bouton ⇩ ouvre l'import par lien ou fichier. « Exporter mes recettes (JSON) » télécharge les recettes, leurs ingrédients, étapes et liens source au format `manger-recipes` version 1. Ce fichier ne sauvegarde pas le foyer, les favoris, les protéines, le calendrier ou les courses.

L'import d'un fichier (1 Mo, 1 à 200 recettes) valide les données puis permet de choisir une recette à relire dans l'éditeur. Il crée une nouvelle recette : aucun remplacement ni import en masse. Les anciennes recettes sans étapes restent des brouillons à compléter avant enregistrement. Il est possible de renommer le brouillon pour éviter des titres identiques.

Pendant la préparation de l'import, le lien et le choix du fichier sont temporairement bloqués, mais la fenêtre reste fermable. La fermeture annule l'attente côté navigateur et permet de recommencer immédiatement ; les anciennes réponses sont ignorées. Le serveur peut terminer un téléchargement internet déjà commencé, dans sa limite de 15 secondes, et refuser temporairement un second lien. L'attente du navigateur est limitée à 20 secondes pour laisser arriver la réponse du serveur ; le lien saisi est conservé en cas d'erreur. La lecture d'un fichier abandonné n'envoie aucune nouvelle demande, et aucun aperçu ne crée de recette sans relecture puis enregistrement explicite.

L'import internet consulte la page depuis votre serveur et lit les blocs JSON-LD Schema.org `Recipe`. Il n'exécute pas JavaScript et ne télécharge pas les photographies. HTTPS public sur le port 443 et IPv4 uniquement : les adresses locales, privées et réservées sont refusées, chaque redirection est revérifiée et l'adresse DNS validée est épinglée à la connexion. Limites : 15 secondes, 3 redirections, 1,5 Mo par page, un téléchargement à la fois. Les sites sans données structurées, bloqués ou nécessitant une connexion peuvent être incompatibles ; aucun contournement n'est effectué.

La relecture est obligatoire dans l'interface. Les fractions et unités courantes sont reconnues partiellement ; les unités non reconnues sont laissées à remplir. Portions et durée absentes ou ambiguës sont signalées, avec valeurs provisoires de 2 portions et 30 min. Le régime proposé reste omnivore à vérifier, les étapes sont classées en préparation sans minuteurs automatiques, et les instructions ne sont ni traduites ni recalculées. Le lien de la source est conservé et visible dans la fiche : les recettes importées ne deviennent pas des contenus CC0 de Manger!.

La connexion est obligatoire depuis l'ajout des comptes. Restez sur un réseau de confiance ou votre VPN : sans HTTPS, identifiants et sessions circulent sans chiffrement HTTP. Le [mode HTTPS local optionnel](HTTPS.md) fonctionne sans domaine ni reverse proxy, avec une autorité locale à installer sur les appareils. Une mise à jour seule ne l'active pas. Les comptes ne constituent pas une autorisation d'exposer cette version directement sur Internet. L'export de recettes JSON n'inclut pas les photos ni les avis du foyer ; utilisez la sauvegarde ci-dessous.

### Comptes du foyer

Dans **Compte → Personnes du foyer**, ajoute ou sélectionne une personne pour ouvrir son profil alimentaire. Le parcours validé se fait en trois étapes : prénom et cartes de régime, goûts facultatifs avec recherche et choix cru/cuit, puis récapitulatif. « Passer cette étape » conserve les goûts existants ; pour en retirer un, touche sa carte. Les aliments absents des propositions peuvent être ajoutés librement. Retour arrière conserve la saisie, annuler ne modifie rien, et seul « Enregistrer ce profil » envoie les changements. Les profils sont distincts des comptes de connexion. Aucune migration de données ni nouveau régime ; les goûts ne constituent pas une protection anti-allergies.

L'enregistrement et le retrait d'un profil bloquent les doubles appuis, la fermeture et le changement de personne pendant la requête et son rechargement. La saisie reste affichée en cas de refus. Si la réponse est perdue, vérifiez les personnes du foyer avant un nouvel essai ; aucune écriture n'est renvoyée automatiquement. Après une modification confirmée dont la relecture échoue, utilisez Réessayer dans la semaine sans refaire l'action.

Dans « Mon compte → Connexion sur d’autres appareils », **Déconnecter tous mes appareils** révoque toutes les sessions de votre compte, y compris celle utilisée, après confirmation. Le mot de passe reste inchangé et les autres membres restent connectés. Les anciennes sessions sont refusées dès leur prochaine requête au serveur ; cette action ne peut pas effacer une copie hors connexion sur un appareil déconnecté.

Une instance héberge **un seul foyer partagé**. Chaque accès possède un identifiant et un mot de passe ; les recettes, goûts des personnes, repas et courses existants sont conservés. Un accès n'ajoute pas automatiquement une personne à table. Plusieurs foyers isolés ne sont pas encore disponibles.

Dans **Mon compte → Accès au foyer → Inviter par lien privé**, un administrateur peut créer un lien valable **24 heures pour une seule inscription**. La personne invitée choisit son identifiant et son mot de passe, puis se connecte : son compte est toujours membre, jamais administrateur. Elle accède aux données partagées du foyer. Un nouveau lien remplace le précédent ; « Annuler le lien en cours » révoque l'invitation sans désactiver les comptes déjà créés. Désactiver l'administrateur qui l'a créée annule aussi son invitation.

Après création, **Partager l’invitation** ouvre le partage natif du téléphone lorsque le navigateur le permet ; **Copier le lien** reste disponible. **Préparer un courriel** ouvre l'application de courriel avec le lien et les consignes d'accès, sans destinataire prédéfini : choisissez la personne et confirmez vous-même l'envoi. Ce bouton n'envoie rien depuis le serveur. Une annulation du partage ne déclenche pas de copie ni de courriel. Un lien expiré doit être recréé ; la validation serveur reste déterminante si le lien a déjà été utilisé ou annulé depuis un autre appareil.

Transmettez ce lien uniquement au destinataire : toute personne qui le possède peut l'utiliser tant qu'il est valide. Le destinataire doit accéder au serveur par le réseau local ou le VPN, et faire confiance au certificat si HTTPS est configuré. Le secret est dans le fragment du lien (non envoyé lors du chargement de la page), retiré de la barre d'adresse à l'ouverture et stocké haché côté serveur. Rechargez depuis le lien original si vous quittez le formulaire avant l'inscription. Sans HTTPS, l'inscription reste non chiffrée comme la connexion.

Avant l’invitation sur un nouvel iPhone, si Safari ne peut pas ouvrir le serveur HTTPS local, utilisez l’aide **Préparer l’accès sur un nouvel iPhone** dans le même volet. L’administrateur télécharge ou partage le **fichier certificat public** depuis son appareil déjà connecté, puis copie les étapes d’installation et de confiance pour l’invité. L’empreinte SHA-256 permet une comparaison par un autre canal de confiance. Le certificat n’est pas une clé privée ; installer cette autorité reste une décision volontaire qui peut établir la confiance pour d’autres sites qu’elle signe. Un lien HTTPS vers le certificat ne résout pas un blocage avant ouverture du site. Voir [le parcours détaillé et ses limites](HTTPS.md#préparer-un-appareil-invité-depuis-manger).

#### Envoi facultatif depuis le serveur

L'envoi SMTP est **désactivé par défaut**. Aucun fournisseur n'est contacté au démarrage et aucune adresse de destinataire n'est enregistrée dans les bases ou les journaux de Manger!. Quand il est configuré, **Envoyer depuis Manger!** apparaît dans le lien d'invitation créé, uniquement pour les administrateurs. Saisissez un destinataire et confirmez volontairement l'envoi. Les contrôles restent dans le formulaire existant, sans nouvel écran.

Avec Docker Compose, complétez votre fichier local `.env` (déjà exclu de Git et de l'image), en conservant les réglages existants. Exemple **à adapter**, sans utiliser ces identifiants fictifs :

```dotenv
MANGER_SMTP_HOST=smtp.example.org
MANGER_SMTP_PORT=587
MANGER_SMTP_FROM=admin@example.org
MANGER_SMTP_USER=admin@example.org
MANGER_SMTP_PASSWORD='mot-de-passe-application-du-fournisseur'
MANGER_APP_URL=https://adresse-locale-du-serveur:3000
```

`MANGER_APP_URL` est l'adresse exacte utilisable par la personne invitée (Wi-Fi/VPN), sans chemin, paramètres ou identifiants. HTTPS est recommandé ; HTTP reste réservé au réseau de confiance. Le lien envoyé est construit depuis cette configuration, jamais depuis une adresse fournie dans la demande. `FROM` doit être une adresse autorisée chez votre fournisseur. Utilisez un mot de passe d'application si nécessaire ; ne partagez jamais le fichier `.env`. Les lignes USER/PASSWORD peuvent rester vides seulement si votre relais autorise l'envoi sans authentification.

Le port **465** utilise TLS dès la connexion ; **587** (ou un autre port) exige STARTTLS. Le certificat du service SMTP doit être valide pour son nom ; aucune option ne désactive sa vérification. Les délais de connexion, accueil, résolution DNS et inactivité SMTP sont limités à 10 secondes chacun. Le fournisseur peut conserver le destinataire et le contenu, dont le lien privé : choisissez un service de confiance. Voir la [documentation SMTP de Nodemailer](https://nodemailer.com/smtp).

Après configuration, appliquez `docker compose up -d --build` depuis le dépôt. Pour désactiver l'envoi, videz `MANGER_SMTP_HOST` puis relancez cette commande. Hors Docker, définissez ces variables dans l'environnement avant `npm start` ; Node ne charge pas `.env` automatiquement. Une configuration SMTP incomplète avec HOST renseigné refuse le démarrage avec le nom du réglage à corriger, sans afficher les secrets.

L'envoi ne crée, ne remplace et ne consomme pas l'invitation : les règles de 24 heures, inscription unique et révocation restent identiques. Limite commune à l'instance : **5 tentatives d'envoi par heure**, échecs compris, conservée après redémarrage ; un seul envoi simultané. Une erreur conserve le lien et le destinataire saisi. Une confirmation indique uniquement l'acceptation par le service SMTP, **pas la livraison**. Une réponse perdue peut masquer un envoi réussi : vérifiez la boîte et les indésirables avant de réessayer. Il n'y a ni nouvel envoi automatique, ni suivi de livraison, ni garantie contre deux envois successifs volontaires depuis plusieurs appareils.

Tests automatisés et navigateur effectués avec une messagerie simulée et des données isolées ; refus d'un serveur SMTP sans STARTTLS également testé par connexion locale. Aucun vrai courriel n'a été envoyé. Configuration du fournisseur, réception réelle, Docker Linux et Safari/iPhone restent à vérifier sur votre installation.

Après la mise à jour, créez le premier administrateur depuis le serveur (aucune inscription publique, aucun mot de passe par défaut) :

```sh
cd ~/services/manger
git pull --ff-only origin development
docker compose up -d --build
docker compose exec manger node accounts.js create-admin admin
```

La dernière commande affiche un mot de passe aléatoire : conservez-le dans votre gestionnaire, ne le collez pas dans une discussion. Ouvrez ensuite l'application et connectez-vous. Dans **Mon foyer → Mon compte et les accès au foyer**, un administrateur crée ou désactive les accès. Chaque personne peut modifier son mot de passe et se déconnecter. Les membres partagent les fonctions du foyer ; sauvegarde complète, restauration et administration des accès sont réservées aux administrateurs. La désactivation coupe les sessions, sans supprimer les repas. Votre propre accès ne peut pas être désactivé depuis cet écran.

Pour récupérer un accès perdu, depuis le terminal du serveur :

```sh
docker compose exec manger node accounts.js reset-password admin
```

Un nouveau mot de passe est généré, l'accès est réactivé et ses anciennes sessions sont révoquées. En local sans Docker, utilisez `node accounts.js create-admin admin` ou `node accounts.js reset-password admin` avec le même `MANGER_DB` que le serveur.

Les mots de passe sont hachés avec scrypt et un sel aléatoire ; les sessions durent sept jours maximum. Une modification du mot de passe révoque toutes les sessions de ce compte. Les tentatives sont limitées sur quinze minutes (8 par identifiant, 20 par adresse réseau et 60 globalement), sans faire confiance aux en-têtes de proxy. Les mutations vérifient l'origine ; les clients automatisés authentifiés doivent fournir l'en-tête `Origin` de l'instance. Le mode HTTPS natif active automatiquement les cookies `Secure` ; ne définissez pas `MANGER_SECURE_COOKIE=1` sur un accès HTTP.

Les accès sont stockés dans **`accounts.db` à côté de `manger.db`**, dans le même volume Docker. La sauvegarde/restauration du foyer ne contient et ne remplace pas les comptes. Pour une copie complète de l'installation, sauvegardez le volume Docker serveur arrêté, ou recréez les accès sur une nouvelle installation. Protégez cette copie : elle contient des données privées et des secrets de session.

La déconnexion et le changement d'accès effacent les copies locales des courses et recettes dans ce navigateur, y compris via les autres onglets ouverts. Une copie hors connexion déjà téléchargée reste lisible hors réseau jusqu'à son effacement local : désactiver un compte à distance ne peut pas effacer un téléphone déconnecté. N'activez donc pas le mode hors connexion sur un appareil partagé non fiable.

## Sauvegarder le foyer

Dans « Mon foyer », un administrateur peut ouvrir « Sauvegarde du foyer » pour télécharger une copie SQLite des données du foyer, y compris les recettes, photos, profils, planning, placard et courses, mais pas les comptes de connexion. La copie peut être créée pendant le fonctionnement du serveur. Un seul téléchargement de sauvegarde peut être préparé à la fois.

Le bouton affiche « Préparation… » pendant la réception du fichier, limitée à 30 secondes côté navigateur. Un double appui est ignoré ; une coupure, un refus ou un fichier vide débloque le bouton sans télécharger de fichier. Aucun nouvel essai n'est envoyé automatiquement : vérifiez la connexion puis retouchez le bouton. Ce téléchargement ne modifie pas le foyer ; son interruption n'annule pas nécessairement la préparation déjà commencée sur le serveur.

« Téléchargement lancé » signifie que le fichier a été confié au navigateur, pas qu'il est enregistré sur l'appareil. Vérifiez sa présence dans vos téléchargements. Le contrôle local refuse un fichier vide, mais ne vérifie pas toute son intégrité SQLite : utilisez l'outil de vérification ci-dessous si nécessaire.

Ce fichier contient vos données privées et n'est pas chiffré. Conservez-le dans un emplacement protégé ; le dépôt de code ne sauvegarde pas vos données personnelles. N'utilisez que des sauvegardes provenant de votre instance de confiance.

« Restaurer une sauvegarde » accepte un fichier SQLite de 32 Mo maximum, de la même version de schéma que l'instance. La vérification affiche le nombre de recettes, personnes et repas sans modifier le foyer. Une confirmation explicite remplace ensuite toutes les données. Avant ce remplacement, une copie complète de récupération est créée dans `recovery/`, à côté de la base active (dans le volume Docker). Si sa création échoue, aucune restauration n'est effectuée. Une erreur pendant le remplacement annule la transaction. Ces copies privées ne sont pas supprimées automatiquement ; surveillez l'espace disque et conservez aussi une sauvegarde sur un autre appareil.

L'aperçu expire après dix minutes. Les requêtes concurrentes sont refusées pendant la restauration ; rechargez les autres appareils après l'opération. Pour les fichiers plus volumineux ou d'anciennes versions, utilisez l'outil ci-dessous.

La vérification et la confirmation bloquent les doubles envois, les champs et la fermeture du foyer pendant l'attente, limitée à 30 secondes côté navigateur. Un fichier absent, vide ou trop volumineux est refusé avant l'envoi ; le fichier choisi reste sélectionné en cas d'erreur. L'aperçu peut être demandé au clavier, sans dépendre du bouton de soumission.

Attendez la fin de la préparation d'un téléchargement de sauvegarde avant de vérifier ou restaurer un fichier : ces demandes ne démarrent pas tant que ce téléchargement est en préparation.

Une confirmation réussie recharge l'application sans renvoyer la restauration. Si la réponse du remplacement est perdue ou si le délai expire, **rechargez la page et vérifiez le foyer avant toute nouvelle restauration** : le serveur peut avoir terminé malgré l'erreur réseau. Le bouton de confirmation disparaît ; il faut une nouvelle vérification du fichier pour obtenir un autre aperçu. Une erreur réseau pendant le seul aperçu ne remplace pas le foyer. Le délai navigateur n'annule pas nécessairement l'opération déjà commencée sur le serveur.

Pour vérifier un fichier puis le restaurer vers un **nouveau fichier**, depuis le dossier de l'application :

```shell
node backup-tools.js check sauvegarde.db
node backup-tools.js restore sauvegarde.db data/manger-restaure.db
```

La vérification contrôle l'intégrité SQLite, les relations et les tables principales ; elle ne garantit pas la fiabilité d'un fichier inconnu. La restauration en ligne de commande refuse toute destination existante et ne change pas la base active. Arrêtez ensuite Manger et configurez `MANGER_DB` avec le chemin du nouveau fichier avant de relancer le serveur. Gardez l'ancienne base jusqu'à vérification de vos données. Cette méthode complète la restauration guidée depuis l'interface décrite plus haut.

## Courses et organisation

Les courses se rafraîchissent automatiquement toutes les 15 secondes quand leur onglet est visible, ainsi qu'à son ouverture et au retour dans l'application. Deux appareils connectés à la même instance et à la même semaine voient ainsi les cases, ajouts, suppressions et changements de quantités sans recharger la page. La saisie d'un article est conservée. Le rafraîchissement attend pendant le rangement des rayons, une fenêtre ouverte ou une action en cours, et ignore les réponses rendues obsolètes par une action locale. En cas de coupure réseau, la dernière liste reste affichée et la lecture est retentée ; les écritures ne sont pas mises en attente hors connexion. Deux modifications concurrentes de la même case suivent le dernier enregistrement reçu par le serveur. Cette synchronisation ne crée pas de comptes ni d'isolation entre foyers.

Plusieurs articles peuvent être cochés en parallèle, mais chaque article en attente reste verrouillé même si la liste se redessine. L'envoi est limité à 15 secondes et la réponse reste liée à l'article et à sa semaine, jamais à sa position dans la liste. Une réponse perdue conserve l'état précédent et demande une relecture avant nouvel essai ; aucune coche n'est renvoyée automatiquement. La copie hors connexion activée sur l'appareil reçoit les changements confirmés, sans remplacer des achats locaux encore à envoyer.

### Saisie souple des aliments

Les comparaisons du placard et les regroupements des courses ignorent la casse et les espaces superflus. Un vocabulaire local reconnaît les pluriels et variantes accentuées courants (concombres, poireaux, œufs/oeufs…), sans retirer systématiquement le « s » : pois, radis, maïs restent intacts. Les préparations distinctes, comme tomate et tomate concassée ou tofu et tofu fumé, ne sont pas fusionnées. Ce vocabulaire n'est pas exhaustif.

Lors de la saisie d'un ingrédient de recette, d'un aliment du placard ou d'un article de courses, « Tu voulais dire… » propose jusqu'à trois noms proches, issus du vocabulaire et des recettes/du placard chargés. Cliquer sur une proposition remplace le champ ; ignorer la suggestion conserve la saisie. Cette aide utilise une comparaison orthographique locale, pas un modèle d'IA générative, et n'envoie aucune donnée à un service externe. Elle ne corrige pas rétroactivement les recettes ni les imports sans relecture et ne constitue pas un contrôle des allergies.

Les anciens stocks désormais équivalents ne sont pas additionnés ni effacés automatiquement. S'ils sont en doublon, le placard les signale et les calculs les ignorent jusqu'à correction : retirer les doublons, puis renseigner la quantité totale réellement disponible. Une entrée unique avec un ancien pluriel est mise à jour sans créer un deuxième stock.

« Mon placard » permet d'indiquer les quantités disponibles aujourd'hui et de les corriger ou retirer. Chaque ajout crée un lot distinct ; toucher une ligne permet de modifier ou supprimer uniquement ce lot. Les courses calculées déduisent ces stocks : les repas sont parcourus dans l'ordre des dates, avec priorité au lot dont la date limite est la plus proche, puis au plus ancien à date égale. Les lots sans date passent après les lots datés. Les repas antérieurs à la saisie ou à la mise à jour d'un lot ne consomment pas celui-ci. Les réservations des semaines précédentes sont conservées dans le calcul pour ne pas compter deux fois la même quantité. Le stock restant est une estimation fondée sur le planning, pas une confirmation de consommation : ajustez-le après avoir cuisiné ou jeté un aliment. Les articles de courses manuels restent indépendants.

La date facultative « À utiliser d’ici le » est un repère personnel, jamais une durée de conservation calculée. Le placard affiche « À utiliser bientôt » jusqu'à trois jours avant cette date, puis « Date dépassée · à vérifier ». Il ne supprime aucun aliment. Les courses ne déduisent le stock que pour les repas prévus au plus tard à cette date, incluse. Les suggestions et menus additionnent les lots compatibles disponibles à la date du repas et privilégient, à préférences et variété égales, les ingrédients suffisants dont une date approche. Une date ne garantit pas la sécurité alimentaire : vérifiez les indications de l'emballage. Le placard accepte 500 lots au maximum.

L'ajout, la mise à jour et le retrait partagent une protection d'envoi : champs, autres lots et fermeture sont bloqués pendant la demande (15 secondes maximum pour la réponse d'écriture). Le retrait demande confirmation. La saisie reste dans le formulaire en cas d'échec ; si la réponse est perdue, ferme puis rouvre le placard pour vérifier les stocks avant un nouvel envoi. Après une écriture confirmée, les lots affichés sont repris directement de la réponse du serveur et le formulaire est vidé ; une actualisation des courses échouée ne rejoue pas l'écriture. Ferme le placard puis utilise « Réessayer » pour cette lecture. Cela n'est pas une protection contre deux ajouts depuis des appareils différents, ni contre une modification concurrente d'un lot.

La mise à jour vers le schéma 4 conserve les anciens stocks. Téléchargez une nouvelle sauvegarde après mise à jour pour la restauration guidée ; les sauvegardes de schéma 3 restent récupérables par l'outil de restauration en ligne de commande, puis migrées à l'ouverture de la copie par Manger. Un ancien client ne peut pas remplacer plusieurs lots par une quantité unique : rechargez la page après mise à jour.

Les ingrédients calculés regroupent désormais les unités compatibles (g/kg, ml/cl/dl/l) et une liste explicite de variantes de noms (par exemple œuf/oeufs ou tomate/tomates). Ils ne confondent pas masse et volume, ni tomate et tomate concassée. Les corrections de rayon et les cases cochées suivent ces regroupements. Les synonymes non référencés et les articles ajoutés manuellement ne sont pas fusionnés.

Les courses combinent les ingrédients calculés depuis le planning et des articles ajoutés manuellement pour la semaine affichée. Les ajouts peuvent être cochés, supprimés et partagés avec la liste. Le sélecteur de rayon propose désormais « Automatique » par défaut, aussi pour les ajouts manuels. Le classement local reconnaît casse, accents et variantes de pluriels connues ; les mentions de surgelés et conserves priment sur le nom de l'aliment. Concombre et autres légumes reconnus vont aux fruits et légumes, poisson et produits frais au frais, produits explicitement surgelés aux surgelés, conserves et produits secs à l'épicerie, savon et produits ménagers reconnus à Maison. Il s'agit de règles indicatives, pas d'une IA ni d'une connaissance du magasin : les noms inconnus restent dans Autres, sans correction orthographique ni modification des quantités. Les ajouts ne sont ni fusionnés avec les ingrédients ni effacés lorsqu'un repas change. Les rayons précédemment choisis, y compris Autres, restent inchangés.

Les articles cochés se rangent dans « Déjà dans le panier », replié par défaut pour garder la liste courte sur téléphone. Ouvrez cette section pour décocher un article ; le mode « Organiser les rayons » continue d'afficher tous les articles.

Le crayon à côté d'un article ajouté manuellement ouvre sa modification : nom, quantité, unité et rayon. « Enregistrer » conserve son identité et sa coche ; « Supprimer cet article » demande confirmation dans cette même fenêtre. Les ingrédients calculés depuis les recettes restent inchangés : leur fenêtre ne propose que le rayon. Les doubles appuis et la fermeture sont bloqués pendant l'envoi ; un échec conserve la saisie dans la page. Si un autre appareil a modifié ou supprimé l'article, Manger refuse d'écraser ce changement : fermez la fenêtre et rechargez la page avant de réessayer. Une lecture échouée après confirmation ne rejoue pas l'écriture. Modifier un article ne corrige pas automatiquement les achats déjà cochés dans une copie hors connexion : les articles dont les caractéristiques ont changé restent soumis aux règles de fusion décrites plus haut.

L'ajout manuel bloque aussi les champs et les envois simultanés pendant la demande. La saisie reste dans la page si l'envoi échoue ; le formulaire se vide uniquement après confirmation du serveur. Si seule l'actualisation échoue, « Réessayer » recharge les données sans créer un deuxième article, puis efface l'ancien message d'erreur des courses. En cas de réponse perdue, illisible ou de délai dépassé (15 secondes), vérifiez la liste avant de renvoyer l'ajout : le serveur a peut-être reçu la demande. La protection contre les envois simultanés agit dans cette page ; elle ne fusionne pas les ajouts volontairement faits dans plusieurs onglets ou appareils.

Dans les courses, « Organiser les rayons » affiche une poignée ⠿ par article. Glissez-la à la souris ou au toucher vers un rayon (les destinations restent visibles en haut), ou activez-la par toucher, Entrée ou Espace pour choisir le rayon dans une fenêtre. « Terminer » retrouve la liste épurée. Chaque correction est enregistrée immédiatement et reste prioritaire sur le classement automatique. Pour un ingrédient calculé, ce choix est retenu pour l'aliment et ses unités compatibles dans toutes les semaines ; « Automatique » retire la correction. Pour un article ajouté manuellement, seul cet article est modifié ; « Automatique » est également disponible pour revenir au classement indicatif. Le déplacement change le rayon, pas l'ordre des articles à l'intérieur d'un rayon.

Le glisser-déposer bloque les déplacements simultanés et attend au maximum 15 secondes, puis débloque toujours la liste. Une confirmation suivie d'une relecture échouée ne renvoie pas le déplacement ; utilisez Réessayer dans la semaine. Après une réponse perdue, rechargez les courses avant de réessayer. La ligne animée et le respect du mouvement réduit sont conservés.

## Restes et déplacements du planning

Depuis un repas commun ou un repas avec un plat différent par personne, « Prévoir des restes » ajoute un repas ultérieur dans un créneau libre. Pour des assiettes individuelles ou une base commune avec protéines différentes, choisissez les personnes concernées et le nombre de portions à conserver pour chacune ; leur recette et leur supplément éventuel sont maintenus. Le formulaire affiche les protéines conservées, ou « sans supplément ». Les portions supplémentaires sont comptées à la date où l'on cuisine, y compris si les restes sont prévus la semaine suivante, et ne sont pas comptées une seconde fois le jour où elles sont mangées. Par exemple, conserver seulement l'assiette au tofu augmente la base et le tofu à préparer, sans augmenter le poulet de l'autre personne. La fiche ouverte depuis le planning affiche les assiettes prévues. Le choix de la date ne garantit pas la conservation du plat.

Un repas source ne peut pas être remplacé ni supprimé tant que des restes lui sont liés. Retirer les restes réduit automatiquement les quantités à préparer. « Déplacer ou copier » conserve la répartition du repas et refuse les créneaux occupés. Un déplacement respecte l'ordre préparation/restes. Copier un repas cuisiné copie seulement ce repas ; pour ajouter des restes, utilisez l'action dédiée depuis la source.

## Engagements

- auto-hébergeable avec une installation Docker simple ;
- utilisable confortablement depuis un téléphone ;
- aucune dépendance obligatoire à un service cloud ou à une IA ;
- données exportables et sans verrouillage propriétaire ;
- recommandations explicables à partir des préférences du foyer ;
- recettes privées par défaut.

## MVP

Le socle fonctionnel `0.1` implémenté permet de :

1. créer et modifier ses propres recettes avec des étapes de préparation, cuisson, repos et dressage ;
2. consulter une petite base interne de recettes libres ;
3. obtenir des suggestions selon les préférences, le temps disponible et les repas récents ;
4. placer un repas dans un calendrier hebdomadaire ;
5. indiquer un repas à l'extérieur ou au restaurant ;
6. marquer une occasion comme un date ou un repas avec des invités ;
7. générer une liste de courses depuis les recettes planifiées ;
8. cocher, copier et partager cette liste depuis l'application.
9. adapter un repas partagé aux régimes des membres du foyer avec des protéines explicitement compatibles.

## Modèle fonctionnel

Un élément du calendrier est un **repas planifié**. Il combine :

- une date et un moment de la journée ;
- un lieu : maison, extérieur ou restaurant ;
- une occasion : ordinaire, date ou invités ;
- un nombre de personnes ;
- zéro, une ou plusieurs recettes ;
- un restaurant facultatif ;
- une note facultative.

Un date n'est donc pas un type de repas fermé : il peut avoir lieu au restaurant ou autour d'une recette cuisinée à la maison.

## Recommandations v1

La version `0.1` n'utilise pas d'IA. Son classement est déterministe et explicable :

1. respecter les régimes et le temps disponible, puis classer selon les goûts des participants sans exclure les préparations inconnues ;
2. proposer les recettes non encore planifiées avant les répétitions ;
3. favoriser les aliments du placard, puis les ingrédients déjà prévus dans la semaine ;
4. pénaliser les plats mangés récemment et départager les égalités par ordre alphabétique.

« Proposer le prochain repas » indique « Placard estimé » ou « À utiliser bientôt » lorsqu'un ingrédient dispose d'une quantité suffisante pour les participants (une portion chacun, ou les portions d'origine sans profil sélectionné). Les repas enregistrés depuis la saisie du stock jusqu'à la fin de la semaine consultée, limitée par la date facultative du stock, sont réservés avant ce calcul, y compris les suppléments et les portions destinées aux restes. Un stock saisi après la date du repas n'est pas proposé. Les unités compatibles sont converties ; masse et volume restent distincts. Ce repère ne garantit ni un plat complet sans courses, ni la fraîcheur des aliments. Les propositions sont des alternatives : leur affichage ne réserve aucun stock.

Les goûts par personne orientent déjà ce classement sans exclure les préparations inconnues. Les allergies et contraintes de matériel nécessitent encore des données et contrôles adaptés ; elles ne sont pas garanties par les filtres actuels.

## Restaurants autour de soi

Les repas au restaurant et les dates peuvent rechercher jusqu'à huit restaurants OpenStreetMap dans un rayon de 3 km, classés par distance. Cliquer sur un résultat remplit le nom du repas ; aucune réservation n'est effectuée.

Cette fonction est optionnelle. Après un clic explicite et l'autorisation de géolocalisation du navigateur, les coordonnées sont transmises au serveur Manger puis à l'API publique Overpass ; Manger ne les enregistre pas. Les données OpenStreetMap peuvent être incomplètes ou anciennes. Vérifiez directement les horaires et le menu du restaurant.

La géolocalisation nécessite HTTPS, sauf sur `localhost`. Pour utiliser une autre instance Overpass, définissez `MANGER_OVERPASS_URL` avec son URL d'API. La planification manuelle reste disponible sans ce service.

En cas de géolocalisation indisponible, saisissez une ville ou un code postal français et choisissez la commune. La recherche est alors centrée sur cette commune. Cette saisie est transmise à l'API officielle `geo.api.gouv.fr`, configurable via `MANGER_COMMUNES_URL`. Les résultats affichent l'adresse lorsqu'elle est renseignée et proposent un lien vers la carte OpenStreetMap.

Une seule recherche est active dans la fenêtre : localisation, commune et choix du centre ne peuvent pas se lancer simultanément. Les boutons de recherche et la saisie de commune sont temporairement bloqués, mais le nom, le lieu, le nombre de personnes et la planification manuelle restent disponibles. La recherche par commune ou centre choisi attend 15 secondes maximum côté navigateur. « Localise-moi » demande une position avec un délai de 20 secondes et borne l'ensemble localisation/recherche à 35 secondes.

Fermer la fenêtre, changer de lieu, ouvrir une autre configuration ou enregistrer le repas annule l'attente. Les réponses anciennes sont ignorées ; une position obtenue après l'annulation n'est pas transmise par Manger. Le navigateur peut néanmoins terminer sa localisation et le serveur ses appels externes déjà commencés. Un échec conserve les champs saisis et propose de réessayer ou de planifier manuellement, sans renvoi automatique. Les noms de communes et restaurants peuvent passer sur plusieurs lignes pour rester lisibles avec du texte agrandi.

## Composer sa semaine

Le score anti-gaspi ignore automatiquement les basiques reconnus : sel, poivre, huiles, beurre, vinaigres, sucre, farine, eau, épices courantes et certains condiments. Ils ne donnent aucun bonus de stock disponible, de date proche ou de réutilisation entre recettes. Les légumes, viandes, poissons, œufs et autres ingrédients restent pris en compte, ainsi que le riz et les pâtes. Les herbes fraîches restent utiles ; les versions explicitement séchées ou en poudre sont ignorées pour ce score. Ce vocabulaire local n'est pas exhaustif : un nom inconnu reste pris en compte. Le filtre concerne seulement les propositions, jamais les quantités des recettes, les réservations du placard ou les courses ; la présence d'un basique chez vous n'est pas supposée.

« Réutiliser un menu → Reprendre une semaine » permet de choisir une semaine passée ou future, de consulter ses repas puis de les copier vers la semaine affichée. « Réutiliser un menu → Mes semaines types » enregistre jusqu'à 30 semaines sous un nom court et les rend disponibles même après avoir modifié le planning d'origine. Les plats par personne et suppléments sont conservés.

Aucun créneau occupé n'est remplacé : au moindre conflit, aucun repas n'est ajouté. Les restes sont reliés à leur nouvelle préparation uniquement si celle-ci appartient à la semaine enregistrée ; une semaine contenant des restes préparés ailleurs est refusée. Les courses sont recalculées, sans copier les articles manuels ni les cases cochées. Supprimer une semaine type ne supprime aucun repas du calendrier.

Dans Semaine, « Compose ma semaine » propose un menu pour les créneaux libres sélectionnés. Choisissez le temps maximum et les participants (une portion chacun), ou le nombre de personnes si aucun foyer n'est configuré. La base commune respecte les régimes des participants ; cette première version n'ajoute pas de supplément de protéine. Les variantes par personne restent disponibles dans l'ajout manuel.

Le choix initial privilégie ensuite les quantités suffisantes du placard, en commençant par celles dont la date approche, puis les ingrédients réutilisés entre les repas. Les repas déjà planifiés sont réservés avant le calcul et chaque proposition réserve virtuellement son stock pour les suivantes : la même quantité n'est donc pas promise deux fois dans l'aperçu. Un stock n'est utilisé qu'entre sa date de saisie et sa date facultative. Les doublons ambigus et les unités incompatibles sont ignorés. Cette logique reste une estimation anti-gaspi, pas une optimisation globale ni une garantie de fraîcheur.

L'aperçu ne modifie rien : chaque plat peut être remplacé avant validation. Chaque remplacement manuel est conservé pour cet aperçu et recalcule les autres propositions. Les ingrédients des plats choisis manuellement sont réservés en priorité, même pour un repas en fin de semaine ; les propositions restantes réutilisent ensuite les ingrédients et le stock disponible. Le calcul reste une estimation, sans garantie d'optimisation globale. En cas d'échec réseau, le menu précédent est conservé. Un catalogue limité peut entraîner des répétitions. Modifier les critères ou relancer « Proposer mon menu » remet à zéro ces choix manuels.

La validation ajoute tous les repas et met à jour les courses. Si un créneau a été rempli entre-temps, aucun repas du menu n'est enregistré : fermez le formulaire et recomposez. Les repas existants ne sont jamais remplacés par cet outil.

La confirmation utilise la protection commune du planning : doubles appuis ignorés, choix et fermeture bloqués pendant l'envoi, attente limitée à 15 secondes. Un refus conserve le menu choisi ; une réponse perdue demande de vérifier le planning avant de réessayer. Une lecture échouée après confirmation ne renvoie pas les repas. L'aperçu et son recalcul sont limités à 10 secondes, sans écriture ; en cas d'échec du recalcul, le menu précédent est conservé.

## Catalogue et univers

Dans Recettes, **De saison** active un filtre facultatif pour le mois courant, calculé automatiquement à partir de la date et du fuseau local de l'appareil (iOS, Android ou ordinateur), pas de la date du serveur ou de la semaine affichée. « En ce moment · octobre », par exemple, indique le mois utilisé ; il n'y a plus de sélection manuelle du mois. Le mois est recalculé au filtrage, au retour dans Recettes, au retour visible de l'application et à la reprise du focus. Si Recettes reste affiché, un contrôle local toutes les 60 secondes actualise le filtre au changement de mois ; les navigateurs peuvent suspendre ce contrôle en arrière-plan. La date système doit être correcte.

Le calendrier reste sélectionnable, uniquement avec ce filtre actif : France métropolitaine (par défaut), Hauts-de-France ou Bretagne. Le choix du calendrier est mémorisé sur cet appareil, pas partagé avec les autres comptes ou appareils. Il se combine avec la recherche, les univers, les favoris et la durée. Le désactiver retrouve les autres recettes : aucun plat n'est supprimé du catalogue ou du planning.

Le sélecteur de durée est disponible dès l'ouverture, à côté de « De saison ». « Réinitialiser les filtres » apparaît seulement si une recherche, une durée ou la saison est active : il efface ces trois critères sans quitter l'univers ou les favoris choisis. Le calendrier choisi est conservé, le mois reste automatique. La recherche reste visible dans chaque univers ; ces filtres n'écrivent aucune donnée du foyer. Un stockage local indisponible empêche seulement la mémorisation du calendrier.

Ces repères concernent une sélection de fruits et légumes identifiés dans les ingrédients, d'après les listes mensuelles du [calendrier Manger Bouger](https://www.mangerbouger.fr/manger-mieux/bien-manger-sans-se-ruiner/calendrier-de-saison), consultées le 7 octobre 2026. Les références régionales, consultées le 12 octobre, remplacent uniquement les repères couverts : [Région Bretagne](https://www.bretagne.bzh/actualites/de-janvier-a-decembre-mangez-breton-sans-vous-tromper/) pour les produits reconnus de ses listes mensuelles, [Où acheter local](https://ouacheterlocal.fr/produits-de-saison/janvier/) pour les pommes (septembre à mai) et betteraves (octobre à mars) en Hauts-de-France. Les autres produits gardent le calendrier national. En Bretagne, mars signifie **fin mars** pour les asperges. L'aide « Fruits et légumes du mois » précise la couverture et donne la source choisie ; les autres régions ne disposent pas encore de repères spécifiques.

Au moins un fruit ou légume identifié doit être de saison **et ne pas être disponible les douze mois dans le calendrier choisi** ; aucun produit identifié ne doit être hors saison. Les carottes seules ne suffisent donc plus à qualifier un plat. Le nombre de recettes restantes apparaît près du filtre, avec le mois courant, et suit aussi la recherche, la durée et l'univers. Couverture partielle et indicative : choisir une région ne garantit ni la provenance locale, ni le mode de culture ou de conservation des achats. Aromates seuls, protéines, ingrédients inconnus et produits transformés ne donnent pas de repère positif. Les intitulés ambigus comme « tomate concassée » ne sont pas assimilés à des tomates fraîches. Cru ou cuit ne permet pas de déduire si un ingrédient est frais ou surgelé. Il ne s'agit pas d'une certification de toute la recette ; les recettes non évaluables restent disponibles hors filtre. Aucun service externe ni géolocalisation n'est utilisé lors du filtrage ; seuls les liens de référence sont externes.

Depuis une fiche, « Dupliquer » ouvre une copie dans l'éditeur avec ses ingrédients, étapes et univers. La variante n'est créée qu'à l'enregistrement et ne modifie pas l'original ; annuler ne crée aucune recette.

Dans Recettes, « Ajouter les recettes manquantes du catalogue » propose un catalogue de 38 recettes avec ingrédients quantifiés et étapes détaillées. L'import conserve les recettes existantes et ignore les titres déjà présents, même si une ancienne recette du catalogue a été personnalisée. Les recettes importées restent modifiables et alimentent les suggestions et la liste de courses. Le dernier lot ajoute quatre adaptations pour comparer les saisons : risotto aux asperges, tian de légumes d'été, velouté de potimarron et endives au jambon. Les [références bien notées et résultats mensuels](RECETTES-DE-SAISON.md) sont documentés ; leurs notes ne deviennent pas des avis du foyer et ne valident pas nos adaptations. Les légumineuses sont indiquées cuites et égouttées quand les quantités correspondent au poids égoutté ; les états cru/cuit connus sont annotés, les autres restent non précisés. Les durées restent indicatives et les recettes n'ont pas encore été validées par des essais en cuisine.

Le bouton du catalogue bloque les doubles envois et borne l'attente à 15 secondes. Une réponse HTTP réussie confirme l'import, même si son compteur n'est pas lisible ; le rechargement de l'interface reste une étape distincte. En cas de lecture échouée après confirmation, utilisez Réessayer dans la semaine sans relancer l'import. Une réponse perdue est signalée comme incertaine ; aucun renvoi automatique n'est effectué.

La recherche porte sur le nom et les ingrédients, dans le catalogue et le choix des plats. Elle ignore casse et accents, reconnaît les pluriels connus et cherche des noms proches en cas d'absence de résultat exact. Elle ne modifie pas les recettes et reste une aide orthographique locale, pas une garantie de correspondance alimentaire. Les univers sont combinables dans l'éditeur : Recettes du rat (budget), Recettes de date, Plats mijotés, Japon, Chine, Terroir français et Côté chef. « Budget » ne garantit pas un prix ; « Côté chef » désigne une inspiration soignée, sans attribution à un chef connu. Les recettes n'ont pas encore été validées par des essais en cuisine.

Huit univers supplémentaires sont disponibles : Express (30 min maximum), Batch cooking, À emporter, Doudou food, Méditerranée, Italie, Inde et Mexique. Ils se choisissent dans l'éditeur et le filtre de recettes. Les prochains imports du catalogue incluent les nouvelles étiquettes pertinentes ; les recettes déjà importées restent inchangées et peuvent être classées manuellement. Mexique comprend désormais le chili et les tacos végétaux, d'inspiration mexicaine. Les étiquettes de conservation ne remplacent pas les précautions de refroidissement, de transport et de réchauffage.

## Parcours de validation `0.1`

Une personne doit pouvoir ajouter trois recettes, demander des suggestions, organiser sa semaine, noter une sortie et un date, puis obtenir la liste de courses correspondante sans ressaisir les ingrédients.

## Pas dans la version `0.1`

- commande directe chez les grandes enseignes ;
- comparaison des prix en temps réel ;
- réservation de restaurant ;
- application mobile native ;
- réseau social de recettes ;
- génération de recettes par IA ;
- calcul nutritionnel avancé.

Ces fonctions ne seront considérées qu'après validation du parcours principal.

## Premiers jalons

- [x] Valider la présente définition du MVP.
- [x] Produire une maquette mobile du calendrier hebdomadaire.
- [x] Choisir la stack à partir de cette maquette.
- [x] Implémenter la création et la modification des recettes.
- [x] Terminer le parcours de validation `0.1`.
- [ ] Publier une image Docker versionnée.

## Identité

- Nom public : **Manger!**
- Nom technique : `manger`
- Description : **Planificateur de repas libre et auto-hébergeable**
- Accroche : **Recettes, sorties et courses. Toute votre semaine à table.**

## Licence

Le code de **Manger!** est distribué sous licence [GNU AGPL-3.0-or-later](../LICENSE). Les descriptions et données des recettes originales de `catalog.js` sont dédiées au domaine public sous [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/). Aucune recette ni photographie de Jow n'est reprise. Les contenus ajoutés par les utilisateurs restent sous leur responsabilité.
