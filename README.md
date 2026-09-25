# Manger!

> On mange quoi cette semaine ?

**Manger!** est un planificateur de repas libre et auto-hébergeable. Il rassemble les recettes, les repas à la maison, les sorties, les rendez-vous et la liste de courses dans un même calendrier.

## État du projet

La maquette mobile du calendrier est validée. Une première tranche fonctionnelle permet de planifier des recettes, des sorties et des dates, puis de générer la liste de courses correspondante. Les foyers mixtes peuvent enregistrer les régimes de leurs membres, attribuer une protéine compatible à chacun autour d'une base commune ou coordonner deux recettes différentes.

## Lancer localement

Depuis une fiche recette, **Cuisiner cette recette** ouvre les étapes guidées et les ingrédients. Chaque étape chronométrée dispose d'un minuteur indépendant : démarrer, mettre en pause, reprendre et réinitialiser. Passer à une autre étape ne l'arrête pas. Quitter le mode cuisine annule les minuteurs. « Confort de cuisine » propose un son optionnel en fin de minuteur et le maintien de l'écran allumé, selon les autorisations du navigateur. Ces options utilisent les API natives [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) et [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext), sans dépendance. Les alertes peuvent être retardées en arrière-plan ; aucune notification système n'est envoyée. Les durées servent de repères, pas de garantie de cuisson.

Le nombre de portions est ajustable de 1 à 100 dans la fiche et le mode cuisine : les ingrédients sont recalculés sans modifier la recette, le planning ou les courses. Les instructions rédigées et les durées ne sont pas recalculées automatiquement ; adaptez la cuisson si nécessaire. Changer les portions ne réinitialise pas les minuteurs.

Prérequis : Node.js 24 ou plus récent. Aucune dépendance n'est à installer.
Depuis la fiche recette, « Imprimer / PDF » ouvre l'impression du navigateur : sélectionnez votre imprimante ou l'enregistrement en PDF. La fiche contient les ingrédients pour les portions choisies, les étapes et le lien source éventuel. Les durées et instructions restent celles de la recette d'origine.

```shell
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

Cette commande construit localement l'image `manger:0.1.0` ; aucune image préconstruite n'est encore publiée. Docker Engine et le module Compose sont nécessaires. La construction Docker reste à valider sur une machine équipée.

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

### Courses, recettes hors connexion et écran d'accueil

Depuis une adresse HTTPS reconnue par le téléphone, ouvrez Courses → Courses hors connexion → « Garder une copie sur cet appareil ». L'activation est volontaire. La dernière semaine chargée est conservée avec ses quantités, les cases déjà cochées et l'heure de mise à jour ; consulter une autre semaine remplace cette copie. Les lectures réussies du serveur actualisent la copie. Elle reste consultable en lecture seule quand le serveur ou le réseau est inaccessible, même après rechargement. Photos, profils et sauvegardes ne sont pas mis en cache. Le bouton « Effacer toutes les copies sur cet appareil » supprime les copies de courses et de recettes et désactive l'actualisation des courses, sans toucher au serveur.

Dans une fiche recette, ouvrez **« Cette recette hors connexion » → « Garder cette recette sur cet appareil »**. La copie conserve le titre, les ingrédients recalculés pour les portions affichées, les étapes avec leurs durées d'origine et le lien source éventuel. Elle n'ajoute pas les suppléments de protéines d'un repas. Jusqu'à 20 recettes peuvent être conservées (1 million de caractères au total, sous réserve du quota du navigateur) ; enregistrer à nouveau la même recette remplace sa copie. Les recettes ne s'actualisent **pas automatiquement** : refaites une copie après modification. Les photos, notes privées, minuteurs et modifications hors ligne ne font pas partie de cette consultation.

Le lien « Voir mes recettes enregistrées » ouvre la page hors connexion commune aux recettes et aux courses. Chaque recette porte sa date de copie et peut être retirée indépendamment. Une erreur de stockage préserve les copies déjà présentes. Le serveur reste la source de référence : une copie peut rester ancienne même après suppression ou restauration d'une recette en ligne.

La copie est accessible aux personnes utilisant ce navigateur ; elle peut être ancienne et le navigateur peut supprimer son stockage. Vérifiez qu'elle est disponible avant de partir. Aucune modification hors connexion n'est envoyée plus tard. Revenez à Manger une fois connecté pour modifier ou cocher les courses.

Le manifeste et les icônes permettent l'ajout à l'écran d'accueil depuis le menu du navigateur compatible (sur iPhone, le menu de partage de Safari). Activez la copie depuis le mode installé si son stockage est distinct de celui du navigateur. L'installation et le stockage restent gérés par le navigateur. HTTPS est requis pour le service worker, sauf en développement sur localhost : `http://192.168.1.31:3000` et un VPN seuls ne suffisent pas. Voir [le fonctionnement des service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers). La mise en place HTTPS sur le serveur personnel et la validation iOS/Android réelles restent à effectuer.

Le service worker ne conserve que la page de secours `/offline.html` ; les données de courses sont enregistrées séparément dans le stockage local après consentement. Les API et les écritures ne sont jamais interceptées. Lors d'une modification de la page de secours, incrémentez la version du cache dans `public/sw.js`.

L'interface conserve trois onglets. Les actions secondaires des recettes sont regroupées dans « Plus d'options » ; les notes et les options de cuisine sont repliées par défaut. Les contrastes des boutons principaux sont corrigés en clair et en sombre.

Une photo personnelle peut être ajoutée depuis l'éditeur, dans « Photo du plat ». JPEG, PNG ou WebP jusqu'à 10 Mo : le navigateur redimensionne à 960 pixels maximum puis convertit en JPEG avant envoi (400 000 caractères maximum pour la donnée encodée). Les photos sont conservées dans SQLite, chargées séparément et copiées avec les variantes. La suppression de la photo prend effet à l'enregistrement. Aucune photographie n'est importée automatiquement depuis un site tiers.

« Mon avis et mes notes » enregistre une appréciation de 1 à 5 (ou aucune note) et un commentaire de 2 000 caractères maximum, communs au foyer. Modifier une recette conserve cet avis ; dupliquer une recette ne le copie pas.

Une fiche recette permet d'ajouter ou retirer un favori. « Mes favoris » dans le filtre Univers du catalogue et du choix des plats affiche uniquement ces recettes. Les favoris sont communs au foyer et persistants, sans changer les règles de régime ni les ingrédients des courses.

Dans « Mon foyer », chaque personne possède son champ « N’aime pas » (50 aliments ou expressions maximum). Les goûts **classent, sans exclure** : recettes adaptées d’abord, préparation inconnue ensuite, goûts incompatibles en dernier. Les régimes et le temps disponible restent des filtres stricts. Les suggestions communes tiennent compte du foyer entier ; le menu automatique utilise les participants cochés et équilibre préférences et variété. Une recette inconnue peut être proposée plutôt qu’un plat déjà répété. L’aperçu indique « À vérifier pour [personne] » ou « Moins adapté aux goûts de [personne] » pour les plats sélectionnés ; ces indications suivent les changements de plats. Aucune confirmation supplémentaire n’est exigée.

Pour « tomate crue », l’état vient du champ facultatif **Servi : cru / cuit / non précisé** de chaque ingrédient, pas d’une déduction à partir des étapes. Le champ reste replié dans l’éditeur et est conservé par duplication et export/import JSON. Les imports internet non renseignés restent disponibles. Les originaux du catalogue sont annotés selon leurs instructions ; les anciennes copies ne sont mises à jour que si leurs ingrédients, quantités et étapes correspondent exactement. Les recettes personnalisées et les états déjà renseignés sont préservés. Ce n’est pas une protection contre les allergies : ingrédients cachés, synonymes, traces et contaminations croisées ne sont pas détectés. Les anciens goûts communs restent dans un volet replié pour être transférés manuellement aux bonnes personnes puis effacés, sans attribution arbitraire.

## Importer et exporter des recettes

Dans l'onglet Recettes, le bouton ⇩ ouvre l'import par lien ou fichier. « Exporter mes recettes (JSON) » télécharge les recettes, leurs ingrédients, étapes et liens source au format `manger-recipes` version 1. Ce fichier ne sauvegarde pas le foyer, les favoris, les protéines, le calendrier ou les courses.

L'import d'un fichier (1 Mo, 1 à 200 recettes) valide les données puis permet de choisir une recette à relire dans l'éditeur. Il crée une nouvelle recette : aucun remplacement ni import en masse. Les anciennes recettes sans étapes restent des brouillons à compléter avant enregistrement. Il est possible de renommer le brouillon pour éviter des titres identiques.

L'import internet consulte la page depuis votre serveur et lit les blocs JSON-LD Schema.org `Recipe`. Il n'exécute pas JavaScript et ne télécharge pas les photographies. HTTPS public sur le port 443 et IPv4 uniquement : les adresses locales, privées et réservées sont refusées, chaque redirection est revérifiée et l'adresse DNS validée est épinglée à la connexion. Limites : 15 secondes, 3 redirections, 1,5 Mo par page, un téléchargement à la fois. Les sites sans données structurées, bloqués ou nécessitant une connexion peuvent être incompatibles ; aucun contournement n'est effectué.

La relecture est obligatoire dans l'interface. Les fractions et unités courantes sont reconnues partiellement ; les unités non reconnues sont laissées à remplir. Portions et durée absentes ou ambiguës sont signalées, avec valeurs provisoires de 2 portions et 30 min. Le régime proposé reste omnivore à vérifier, les étapes sont classées en préparation sans minuteurs automatiques, et les instructions ne sont ni traduites ni recalculées. Le lien de la source est conservé et visible dans la fiche : les recettes importées ne deviennent pas des contenus CC0 de Manger!.

La connexion est obligatoire depuis l'ajout des comptes. Restez sur un réseau de confiance ou votre VPN : sans HTTPS, identifiants et sessions circulent sans chiffrement HTTP. Le [mode HTTPS local optionnel](HTTPS.md) fonctionne sans domaine ni reverse proxy, avec une autorité locale à installer sur les appareils. Une mise à jour seule ne l'active pas. Les comptes ne constituent pas une autorisation d'exposer cette version directement sur Internet. L'export de recettes JSON n'inclut pas les photos ni les avis du foyer ; utilisez la sauvegarde ci-dessous.

### Comptes du foyer

Dans « Mon compte → Connexion sur d’autres appareils », **Déconnecter tous mes appareils** révoque toutes les sessions de votre compte, y compris celle utilisée, après confirmation. Le mot de passe reste inchangé et les autres membres restent connectés. Les anciennes sessions sont refusées dès leur prochaine requête au serveur ; cette action ne peut pas effacer une copie hors connexion sur un appareil déconnecté.

Une instance héberge **un seul foyer partagé**. Chaque accès possède un identifiant et un mot de passe ; les recettes, goûts des personnes, repas et courses existants sont conservés. Un accès n'ajoute pas automatiquement une personne à table. Les invitations par courriel et plusieurs foyers isolés ne sont pas encore disponibles.

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

Ce fichier contient vos données privées et n'est pas chiffré. Conservez-le dans un emplacement protégé ; le dépôt de code ne sauvegarde pas vos données personnelles. N'utilisez que des sauvegardes provenant de votre instance de confiance.

« Restaurer une sauvegarde » accepte un fichier SQLite de 32 Mo maximum, de la même version de schéma que l'instance. La vérification affiche le nombre de recettes, personnes et repas sans modifier le foyer. Une confirmation explicite remplace ensuite toutes les données. Avant ce remplacement, une copie complète de récupération est créée dans `recovery/`, à côté de la base active (dans le volume Docker). Si sa création échoue, aucune restauration n'est effectuée. Une erreur pendant le remplacement annule la transaction. Ces copies privées ne sont pas supprimées automatiquement ; surveillez l'espace disque et conservez aussi une sauvegarde sur un autre appareil.

L'aperçu expire après dix minutes. Les requêtes concurrentes sont refusées pendant la restauration ; rechargez les autres appareils après l'opération. Pour les fichiers plus volumineux ou d'anciennes versions, utilisez l'outil ci-dessous.

Pour vérifier un fichier puis le restaurer vers un **nouveau fichier**, depuis le dossier de l'application :

```shell
node backup-tools.js check sauvegarde.db
node backup-tools.js restore sauvegarde.db data/manger-restaure.db
```

La vérification contrôle l'intégrité SQLite, les relations et les tables principales ; elle ne garantit pas la fiabilité d'un fichier inconnu. La restauration refuse toute destination existante et ne change pas la base active. Arrêtez ensuite Manger et configurez `MANGER_DB` avec le chemin du nouveau fichier avant de relancer le serveur. Gardez l'ancienne base jusqu'à vérification de vos données. Il n'y a pas encore de restauration depuis l'interface.

## Courses et organisation

Les courses se rafraîchissent automatiquement toutes les 15 secondes quand leur onglet est visible, ainsi qu'à son ouverture et au retour dans l'application. Deux appareils connectés à la même instance et à la même semaine voient ainsi les cases, ajouts, suppressions et changements de quantités sans recharger la page. La saisie d'un article est conservée. Le rafraîchissement attend pendant le rangement des rayons, une fenêtre ouverte ou une action en cours, et ignore les réponses rendues obsolètes par une action locale. En cas de coupure réseau, la dernière liste reste affichée et la lecture est retentée ; les écritures ne sont pas mises en attente hors connexion. Deux modifications concurrentes de la même case suivent le dernier enregistrement reçu par le serveur. Cette synchronisation ne crée pas de comptes ni d'isolation entre foyers.

### Saisie souple des aliments

Les comparaisons du placard et les regroupements des courses ignorent la casse et les espaces superflus. Un vocabulaire local reconnaît les pluriels et variantes accentuées courants (concombres, poireaux, œufs/oeufs…), sans retirer systématiquement le « s » : pois, radis, maïs restent intacts. Les préparations distinctes, comme tomate et tomate concassée ou tofu et tofu fumé, ne sont pas fusionnées. Ce vocabulaire n'est pas exhaustif.

Lors de la saisie d'un ingrédient de recette, d'un aliment du placard ou d'un article de courses, « Tu voulais dire… » propose jusqu'à trois noms proches, issus du vocabulaire et des recettes/du placard chargés. Cliquer sur une proposition remplace le champ ; ignorer la suggestion conserve la saisie. Cette aide utilise une comparaison orthographique locale, pas un modèle d'IA générative, et n'envoie aucune donnée à un service externe. Elle ne corrige pas rétroactivement les recettes ni les imports sans relecture et ne constitue pas un contrôle des allergies.

Les anciens stocks désormais équivalents ne sont pas additionnés ni effacés automatiquement. S'ils sont en doublon, le placard les signale et les calculs les ignorent jusqu'à correction : retirer les doublons, puis renseigner la quantité totale réellement disponible. Une entrée unique avec un ancien pluriel est mise à jour sans créer un deuxième stock.

« Mon placard » permet d'indiquer les quantités disponibles aujourd'hui et de les corriger ou retirer. Chaque ajout crée un lot distinct ; toucher une ligne permet de modifier ou supprimer uniquement ce lot. Les courses calculées déduisent ces stocks : les repas sont parcourus dans l'ordre des dates, avec priorité au lot dont la date limite est la plus proche, puis au plus ancien à date égale. Les lots sans date passent après les lots datés. Les repas antérieurs à la saisie ou à la mise à jour d'un lot ne consomment pas celui-ci. Les réservations des semaines précédentes sont conservées dans le calcul pour ne pas compter deux fois la même quantité. Le stock restant est une estimation fondée sur le planning, pas une confirmation de consommation : ajustez-le après avoir cuisiné ou jeté un aliment. Les articles de courses manuels restent indépendants.

La date facultative « À utiliser d’ici le » est un repère personnel, jamais une durée de conservation calculée. Le placard affiche « À utiliser bientôt » jusqu'à trois jours avant cette date, puis « Date dépassée · à vérifier ». Il ne supprime aucun aliment. Les courses ne déduisent le stock que pour les repas prévus au plus tard à cette date, incluse. Les suggestions et menus additionnent les lots compatibles disponibles à la date du repas et privilégient, à préférences et variété égales, les ingrédients suffisants dont une date approche. Une date ne garantit pas la sécurité alimentaire : vérifiez les indications de l'emballage. Le placard accepte 500 lots au maximum.

La mise à jour vers le schéma 4 conserve les anciens stocks. Téléchargez une nouvelle sauvegarde après mise à jour pour la restauration guidée ; les sauvegardes de schéma 3 restent récupérables par l'outil de restauration en ligne de commande, puis migrées à l'ouverture de la copie par Manger. Un ancien client ne peut pas remplacer plusieurs lots par une quantité unique : rechargez la page après mise à jour.

Les ingrédients calculés regroupent désormais les unités compatibles (g/kg, ml/cl/dl/l) et une liste explicite de variantes de noms (par exemple œuf/oeufs ou tomate/tomates). Ils ne confondent pas masse et volume, ni tomate et tomate concassée. Les corrections de rayon et les cases cochées suivent ces regroupements. Les synonymes non référencés et les articles ajoutés manuellement ne sont pas fusionnés.

Les courses combinent les ingrédients calculés depuis le planning et des articles ajoutés manuellement pour la semaine affichée. Les ajouts peuvent être cochés, supprimés et partagés avec la liste. Leur rayon est choisi à l'ajout ; celui des ingrédients est estimé par mots-clés et peut être approximatif. Les ajouts ne sont ni fusionnés avec les ingrédients ni effacés lorsqu'un repas change.

Dans les courses, « Organiser les rayons » affiche une poignée ⠿ par article. Glissez-la à la souris ou au toucher vers un rayon (les destinations restent visibles en haut), ou activez-la par toucher, Entrée ou Espace pour choisir le rayon dans une fenêtre. « Terminer » retrouve la liste épurée. Chaque correction est enregistrée immédiatement. Pour un ingrédient calculé, ce choix est retenu pour l'aliment et ses unités compatibles dans toutes les semaines ; « Automatique » retire la correction. Pour un article ajouté manuellement, seul cet article est modifié. Le déplacement change le rayon, pas l'ordre des articles à l'intérieur d'un rayon.

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

La version `0.1` devra permettre de :

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

Les allergies, préférences et contraintes de matériel enrichiront ce classement lorsqu'elles seront enregistrables dans les profils.

## Restaurants autour de soi

Les repas au restaurant et les dates peuvent rechercher jusqu'à huit restaurants OpenStreetMap dans un rayon de 3 km, classés par distance. Cliquer sur un résultat remplit le nom du repas ; aucune réservation n'est effectuée.

Cette fonction est optionnelle. Après un clic explicite et l'autorisation de géolocalisation du navigateur, les coordonnées sont transmises au serveur Manger puis à l'API publique Overpass ; Manger ne les enregistre pas. Les données OpenStreetMap peuvent être incomplètes ou anciennes. Vérifiez directement les horaires et le menu du restaurant.

La géolocalisation nécessite HTTPS, sauf sur `localhost`. Pour utiliser une autre instance Overpass, définissez `MANGER_OVERPASS_URL` avec son URL d'API. La planification manuelle reste disponible sans ce service.

En cas de géolocalisation indisponible, saisissez une ville ou un code postal français et choisissez la commune. La recherche est alors centrée sur cette commune. Cette saisie est transmise à l'API officielle `geo.api.gouv.fr`, configurable via `MANGER_COMMUNES_URL`. Les résultats affichent l'adresse lorsqu'elle est renseignée et proposent un lien vers la carte OpenStreetMap.

## Composer sa semaine

Le score anti-gaspi ignore automatiquement les basiques reconnus : sel, poivre, huiles, beurre, vinaigres, sucre, farine, eau, épices courantes et certains condiments. Ils ne donnent aucun bonus de stock disponible, de date proche ou de réutilisation entre recettes. Les légumes, viandes, poissons, œufs et autres ingrédients restent pris en compte, ainsi que le riz et les pâtes. Les herbes fraîches restent utiles ; les versions explicitement séchées ou en poudre sont ignorées pour ce score. Ce vocabulaire local n'est pas exhaustif : un nom inconnu reste pris en compte. Le filtre concerne seulement les propositions, jamais les quantités des recettes, les réservations du placard ou les courses ; la présence d'un basique chez vous n'est pas supposée.

« Plus d’options → Réutiliser une autre semaine » permet de choisir une semaine passée ou future, de consulter ses repas puis de les copier vers la semaine affichée. « Mes semaines types » enregistre jusqu'à 30 semaines sous un nom court et les rend disponibles même après avoir modifié le planning d'origine. Les plats par personne et suppléments sont conservés.

Aucun créneau occupé n'est remplacé : au moindre conflit, aucun repas n'est ajouté. Les restes sont reliés à leur nouvelle préparation uniquement si celle-ci appartient à la semaine enregistrée ; une semaine contenant des restes préparés ailleurs est refusée. Les courses sont recalculées, sans copier les articles manuels ni les cases cochées. Supprimer une semaine type ne supprime aucun repas du calendrier.

Dans Semaine, « Compose ma semaine » propose un menu pour les créneaux libres sélectionnés. Choisissez le temps maximum et les participants (une portion chacun), ou le nombre de personnes si aucun foyer n'est configuré. La base commune respecte les régimes des participants ; cette première version n'ajoute pas de supplément de protéine. Les variantes par personne restent disponibles dans l'ajout manuel.

Le choix initial privilégie ensuite les quantités suffisantes du placard, en commençant par celles dont la date approche, puis les ingrédients réutilisés entre les repas. Les repas déjà planifiés sont réservés avant le calcul et chaque proposition réserve virtuellement son stock pour les suivantes : la même quantité n'est donc pas promise deux fois dans l'aperçu. Un stock n'est utilisé qu'entre sa date de saisie et sa date facultative. Les doublons ambigus et les unités incompatibles sont ignorés. Cette logique reste une estimation anti-gaspi, pas une optimisation globale ni une garantie de fraîcheur.

L'aperçu ne modifie rien : chaque plat peut être remplacé avant validation. Chaque remplacement manuel est conservé pour cet aperçu et recalcule les autres propositions. Les ingrédients des plats choisis manuellement sont réservés en priorité, même pour un repas en fin de semaine ; les propositions restantes réutilisent ensuite les ingrédients et le stock disponible. Le calcul reste une estimation, sans garantie d'optimisation globale. En cas d'échec réseau, le menu précédent est conservé. Un catalogue limité peut entraîner des répétitions. Modifier les critères ou relancer « Proposer mon menu » remet à zéro ces choix manuels.

La validation ajoute tous les repas et met à jour les courses. Si un créneau a été rempli entre-temps, aucun repas du menu n'est enregistré : fermez le formulaire et recomposez. Les repas existants ne sont jamais remplacés par cet outil.

## Catalogue et univers

Depuis une fiche, « Dupliquer » ouvre une copie dans l'éditeur avec ses ingrédients, étapes et univers. La variante n'est créée qu'à l'enregistrement et ne modifie pas l'original ; annuler ne crée aucune recette.

Dans Recettes, « Ajouter les recettes manquantes du catalogue » propose un catalogue de 18 recettes originales avec ingrédients quantifiés et étapes de préparation, cuisson et service. L'import conserve les recettes existantes et ignore les titres déjà présents. Les recettes importées restent modifiables et alimentent les suggestions et la liste de courses. Le nouveau lot comprend chili doux aux haricots rouges, tacos de champignons et haricots noirs, velouté de poireaux et pommes de terre, et pâtes au brocoli, citron et pois chiches. Les légumineuses de ces quatre recettes sont indiquées cuites et égouttées : leurs quantités ne correspondent pas au poids sec.

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

Le code de **Manger!** est distribué sous licence [GNU AGPL-3.0-or-later](LICENSE). Les descriptions et données des recettes originales de `catalog.js` sont dédiées au domaine public sous [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/). Aucune recette ni photographie de Jow n'est reprise. Les contenus ajoutés par les utilisateurs restent sous leur responsabilité.
