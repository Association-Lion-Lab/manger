# HTTPS local, sans domaine ni reverse proxy

Les commandes s'exécutent depuis la racine du dépôt. Pour les validations déjà rapportées et celles restant à réaliser, voir [les limites et blocages](DECISIONS.md#validations-et-blocages-restants).

Ce mode est **optionnel**. Une mise à jour normale ne l'active pas. Manger peut servir directement en HTTPS sur son port habituel ; il n'ouvre pas un deuxième serveur HTTP. Le volume des données et les comptes restent les mêmes.

Une petite autorité locale auto-signée signe le certificat du serveur. Il faut installer **son certificat public `ca.crt`** sur chacun de vos appareils de confiance. Sans cette étape, une alerte du navigateur est normale ; la contourner ne suffit pas à valider les fonctions hors connexion, géolocalisation ou maintien de l'écran.

## 1. Préparer les certificats sur le serveur Ubuntu

Réservez d'abord l'adresse IP du serveur dans le DHCP du routeur. Utilisez l'adresse exacte par laquelle les téléphones accèdent à Manger, y compris via votre VPN. Aucun nom de domaine n'est nécessaire.

```sh
cd ~/services/manger
git pull --ff-only origin development
read -r -p "Adresse IP du serveur : " SERVER_IP
```

Si Node et OpenSSL sont disponibles sur le serveur :

```sh
node create-local-tls.js "$SERVER_IP"
```

Sinon, ce conteneur temporaire fournit Node et OpenSSL, sans les installer sur Ubuntu ni modifier le conteneur Manger en cours. Il nécessite un accès aux dépôts de paquets Alpine et crée uniquement le dossier `tls` dans le dépôt :

```sh
docker run --rm --workdir /work \
  --mount "type=bind,src=$PWD,dst=/work" \
  -e SERVER_IP="$SERVER_IP" -e LOCAL_UID="$(id -u)" -e LOCAL_GID="$(id -g)" \
  node:24-alpine sh -ec 'apk add --no-cache openssl >/dev/null; node create-local-tls.js "$SERVER_IP"; chown -R "$LOCAL_UID:$LOCAL_GID" /work/tls'
```

N'exécutez qu'une des deux méthodes. Le script refuse un dossier `tls` déjà présent et n'écrase aucune clé. En cas d'échec partiel, gardez le dossier pour diagnostic ; utilisez un nouveau dossier explicite pour une nouvelle génération. Aucun certificat n'est installé automatiquement dans le système ou sur les téléphones.

Le dossier contient :

- `ca.crt` : certificat public à transférer aux appareils ; son empreinte SHA-256 est affichée à la génération.
- `ca.key` : clé privée de l'autorité, **à garder secrète** et à sauvegarder hors ligne.
- `server/` : certificat serveur, clé privée serveur et copie du certificat public de l'autorité. Seul ce sous-dossier sera monté dans Manger, en lecture seule.

Les chemins par défaut sont exclus de Git et de la construction de l'image Docker. Ne placez pas de copie de clé dans un autre dossier du dépôt. Une autorité installée peut établir la confiance pour d'autres sites : ne partagez jamais `ca.key` et n'installez que votre propre autorité sur vos appareils personnels.

## 2. Faire confiance au certificat sur les appareils

Transférez **uniquement `tls/ca.crt`**, par un canal de confiance (par exemple votre connexion SSH/SFTP). Vérifiez son empreinte avec celle affichée sur le serveur :

```sh
openssl x509 -in tls/ca.crt -noout -fingerprint -sha256
```

### Préparer un appareil invité depuis Manger!

Depuis un appareil qui fait **déjà confiance** au serveur, un administrateur ouvre **Compte → Mon compte → Accès au foyer → Inviter par lien privé → Préparer l’accès sur un nouvel iPhone**. Cette aide apparaît uniquement en HTTPS natif avec `MANGER_TLS_CA` configuré et une autorité racine valide correspondant au certificat serveur. Le modèle Compose existant fournit déjà ce fichier : aucun nouveau port ni montage de clé d’autorité n’est requis.

1. **Télécharger le certificat public** récupère `manger-ca.cer`, au format DER. C’est le même certificat public que `tls/ca.crt`, avec la même empreinte SHA-256, sans clé privée ni données du foyer.
2. **Partager le certificat…** apparaît si le navigateur accepte le partage de ce type de fichier. Le fichier est préparé avant l’appui, avec une lecture limitée à 10 secondes ; le partage est volontaire. Une annulation ne copie ni n’envoie rien automatiquement. Sinon, téléchargez le fichier puis joignez-le vous-même à un courriel ou transmettez-le par un canal de confiance.
3. **Copier les instructions iPhone** fournit les étapes, l’adresse du serveur et l’empreinte à comparer avec l’administrateur par un autre canal de confiance. Si la copie est refusée, un champ sélectionnable permet une copie manuelle. Le guide ne contient pas le secret d’invitation.
4. L’invité ouvre le fichier reçu, installe le profil dans **Réglages → Général → VPN et gestion de l’appareil**, puis active sa confiance dans **Réglages → Général → Informations → Réglages des certificats**. Il rejoint ensuite le Wi-Fi/VPN et ouvre le lien d’invitation dans Safari.

**Important :** si Safari refuse la connexion TLS avant de charger Manger!, aucun bouton ni lien de téléchargement hébergé sur ce serveur HTTPS ne peut s’afficher. Envoyez le **fichier**, pas son URL, avant le lien d’invitation. Le courriel SMTP Manger! rappelle cette condition mais n’attache pas le certificat. Il n’y a pas de page HTTP publique de secours ni de confiance automatique. Installer une autorité donne confiance aux certificats qu’elle signe, y compris pour d’autres sites ; n’installez que celle d’un administrateur de confiance et retirez le profil lorsque cet accès n’est plus nécessaire.

Un refus Safari peut également venir du réseau/VPN, d’un certificat expiré ou d’une adresse absente de ses SAN : installer l’autorité ne corrige pas ces causes. Si l’aide n’apparaît pas, vérifiez `MANGER_TLS_CA` et la signature/validité des certificats ; HTTPS avec un certificat public ou terminé par un proxy ne nécessite pas cette aide locale. Tests Node, téléchargement DER et navigateur local ne prouvent pas l’installation d’un profil ni le partage natif réel sur iPhone.

Sur iPhone/iPad, installez le profil reçu, puis activez explicitement la confiance dans **Réglages → Général → Informations → Réglages des certificats**. L'installation seule ne suffit pas. Voir [la procédure Apple](https://support.apple.com/en-us/102390).

Sur Android, installez le certificat d'autorité via les paramètres de sécurité/chiffrement et identifiants ; les intitulés varient selon le constructeur. Voir [la procédure Google Pixel](https://support.google.com/pixelphone/answer/2844832). Vérifiez ensuite le navigateur réellement utilisé : toutes les applications n'acceptent pas les autorités ajoutées par l'utilisateur.

Sur PC, importez le certificat public dans les autorités de confiance de votre compte utilisateur ou du navigateur utilisé. Ne désactivez pas globalement la vérification des certificats.

## 3. Activer HTTPS dans Docker Compose

L'image Manger utilise l'utilisateur `node`, UID/GID `1000:1000`. Ces commandes ne changent que les permissions du sous-dossier destiné au conteneur ; la clé de l'autorité reste hors de ce montage :

```sh
sudo chown -R 1000:1000 tls/server
sudo chmod 750 tls/server
sudo chmod 600 tls/server/server.key
```

Si vous avez modifié l'utilisateur de l'image, adaptez cet UID/GID. Ne rendez pas les clés lisibles par tout le monde pour contourner un problème de permissions.

Vérifiez qu'il n'existe pas déjà un `compose.override.yaml`. S'il existe, intégrez le contenu du modèle manuellement sans remplacer votre configuration. Sinon :

```sh
cp -n compose.https.yaml compose.override.yaml
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Compose charge automatiquement `compose.override.yaml` lors des prochaines mises à jour. Le service doit devenir `healthy`. Le contrôle utilise la vraie autorité locale, sans désactiver la vérification TLS. Un fichier manquant, une paire clé/certificat invalide ou une configuration incomplète empêche le démarrage HTTPS : il n'y a **aucun repli silencieux en HTTP**.

Ouvrez `https://ADRESSE_IP:3000` (ou votre port configuré avec `MANGER_HTTP_PORT`, dont le nom historique est conservé). L'ancienne URL `http://` ne répond plus : c'est attendu. Reconnectez-vous avec votre compte existant. Le changement HTTP → HTTPS constitue une nouvelle origine pour le navigateur : activez à nouveau les courses hors connexion et recréez le raccourci d'accueil si nécessaire. Une ancienne copie locale HTTP n'est pas effacée à distance ; effacez les données de l'ancien site sur un appareil partagé.

Validation sur téléphone : aucune alerte de certificat, connexion au compte, chargement des repas, activation des courses hors connexion puis essai en mode avion. Vérifiez séparément géolocalisation et maintien de l'écran : HTTPS est nécessaire mais ne garantit pas leur disponibilité ni l'autorisation du navigateur.

## Entretien et retour arrière

Le certificat serveur dure **365 jours**, l'autorité dix ans. Il n'y a pas de renouvellement automatique dans ce lot. Planifiez un renouvellement avant l'expiration. Si l'IP change, générez un certificat pour la nouvelle adresse. Le générateur ne renouvelle pas une autorité existante : une nouvelle génération dans un nouveau dossier implique de réinstaller la nouvelle autorité sur les appareils. Conservez les anciens fichiers jusqu'à validation de la nouvelle configuration, puis retirez l'ancienne confiance des appareils.

Sauvegardez les certificats et les clés de façon privée, séparément de la sauvegarde du foyer : ils ne sont pas dans `manger.db`. Ne publiez jamais le dossier `tls` ni son contenu dans une issue ou une capture.

Pour revenir temporairement à HTTP, retirez uniquement la configuration HTTPS de `compose.override.yaml` (ou renommez ce fichier s'il ne contient que ce modèle), puis relancez `docker compose up -d`. Conservez `tls` et le volume de données. Un navigateur peut conserver un cookie `Secure` pour la même adresse ; effacez les cookies de ce site avant de vous reconnecter en HTTP. Restez sur un réseau de confiance/VPN.

## Sans Docker / paramètres

Définissez `MANGER_TLS_CERT` et `MANGER_TLS_KEY` vers les fichiers PEM avant `node server.js`. Les cookies deviennent automatiquement `Secure` quand le serveur utilise TLS. `MANGER_TLS_CA` indique l'autorité pour `node healthcheck.js` et pour son téléchargement public par un administrateur connecté ; le certificat serveur doit couvrir `127.0.0.1` pour ce contrôle local (le générateur le fait). Le serveur impose TLS 1.2 minimum. Aucun en-tête de reverse proxy n'est nécessaire.

Références techniques : [HTTPS natif Node](https://nodejs.org/api/https.html#httpscreateserveroptions-requestlistener), [OpenSSL req](https://docs.openssl.org/3.0/man1/openssl-req/).

Tests automatisés : génération réelle avec OpenSSL, vérification de la signature/SAN, refus d'écrasement, connexion HTTPS avec validation de l'autorité, cookie `Secure`, contrôle d'origine et healthcheck. Docker Ubuntu et la confiance réelle sur iOS/Android doivent être validés sur votre installation ; les tests locaux ne prouvent pas ces deux points.
