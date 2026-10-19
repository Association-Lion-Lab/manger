# Données et confidentialité d'une instance Manger!

Version technique du **19 octobre 2026**, d'après le code `034311b`.

**Cette notice décrit le logiciel auto-hébergé. Un résumé est accessible dans « Confidentialité et licences », sur Connexion, la page Mon compte et l'onglet Compte. Il ne remplace pas les informations propres à l'administrateur lorsqu'elles sont légalement requises.** Pour le dossier et les actions ouvertes, lire [Conformité France/UE](CONFORMITE.md).

La rubrique est fermée par défaut et se déplie sur place, sans quitter une saisie ni accepter de nouvelles conditions. La lire ne contacte aucun service externe. Les liens vers le code source, GNU et Creative Commons ne s'ouvrent qu'à la demande, dans un nouvel onglet sans transmettre le référent ; ils ne constituent pas une collecte obligatoire pour utiliser Manger!.

## 1. Où sont les données ?

Chaque administrateur installe et gère son serveur Manger!. Les données du foyer et les accès sont conservés sur ce serveur, pas dans un compte central de l'éditeur. Aucun suivi publicitaire ou envoi de télémétrie à l'éditeur n'a été trouvé dans la version examinée.

Une instance correspond à un foyer partagé. Les comptes de connexion ne créent pas des espaces privés séparés : les membres invités accèdent aux recettes, personnes, planning, placard et courses du même foyer. La gestion des accès, la sauvegarde complète et la restauration sont réservées aux administrateurs.

Pour une question concernant les données d'une instance, s'adresser à son administrateur. Ne pas transmettre une base réelle, un mot de passe ou un lien d'invitation actif dans un ticket public du projet.

## 2. Données utilisées par le logiciel

| Ensemble | Données principales | Emplacement et usage |
| --- | --- | --- |
| Accès | Identifiant choisi, mot de passe haché, état actif et rôle administrateur | `accounts.db`, pour gérer les accès ; pas de mot de passe conservé en clair par ce stockage |
| Connexions et invitations | Empreintes des jetons, référence du compte, expiration ; compteurs dont empreintes de l'adresse réseau et du nom de connexion | `accounts.db`, pour sessions, invitation et limitation des tentatives ; une empreinte n'est pas une garantie d'anonymisation |
| Foyer | Noms saisis des personnes, régimes/goûts, recettes, photos, notes et favoris, repas, stocks, courses et semaines types | `manger.db`, pour les fonctions partagées du foyer |
| Appareil | Réglages visuels et calendrier, coordination de changement de compte ; copies facultatives des courses/recettes et petites photos choisies | Stockage local du navigateur ; éléments de secours en cache après activation du hors connexion |
| Copies et prestataires | Exports demandés, sauvegardes, copies de récupération ; données nécessaires à un envoi ou partage volontaire | Destination choisie par l'utilisateur ou configuration de l'administrateur ; ne sont pas toutes contrôlées par l'application |

Les goûts ne constituent pas une protection contre les allergies ou les ingrédients cachés. Éviter de saisir des informations médicales ou d'autres données sensibles sans nécessité et sans cadre approprié.

## 3. Quand un échange externe a-t-il lieu ?

1. **Import d'une recette internet :** le serveur contacte le site demandé et les destinations de redirection validées. Ces sites et leurs infrastructures peuvent voir l'adresse réseau du serveur, l'URL demandée et les informations techniques de connexion. Le lien source est conservé avec le brouillon et la recette enregistrée.
2. **Invitation par messagerie du serveur, si configurée :** l'adresse destinataire et le message avec le lien privé sont transmis au service SMTP choisi. Manger! ne conserve pas l'adresse destinataire dans ses tables actuelles ; le prestataire et le destinataire peuvent conserver le message selon leurs propres règles.
3. **Partage, courriel préparé, export ou sauvegarde :** les informations choisies sont transmises à l'application, au fichier ou au destinataire sélectionné. Leur effacement ultérieur ne peut pas être garanti par Manger!.
4. **Ouverture d'un lien de source :** le navigateur contacte le site ouvert. Il s'agit d'une navigation choisie, pas d'une image distante chargée automatiquement pour les photos du foyer.
5. **Hébergement et accès réseau :** les systèmes et prestataires choisis par l'administrateur peuvent traiter des données techniques ou sauvegardes. Leur configuration et leurs journaux ne sont pas vérifiables depuis le seul code de Manger!.

La recherche de restaurants a été supprimée : nom saisi manuellement, pas d'appel Overpass, de géolocalisation ou de tuiles de carte pour ce parcours. Aucun modèle d'IA distant n'est intégré aux recherches ou aux suggestions examinées.

## 4. Cookies et stockage local

Le cookie `manger_session` sert à l'authentification et expire au plus tard sept jours après sa création, sauf fermeture/révocation anticipée. Il est inaccessible au JavaScript (`HttpOnly`) et envoyé avec la politique `SameSite=Strict`. Son attribut `Secure` dépend de la configuration HTTPS/cookie sécurisé : il n'est pas garanti par une installation HTTP seule.

Le navigateur mémorise les réglages attendus du service : thème/couleur et calendrier de saison. La coordination du compte permet de réagir à une connexion/déconnexion dans un autre onglet.

Les copies hors connexion sont activées volontairement. Elles rendent certaines données disponibles sur cet appareil même sans session serveur vérifiable au moment de la lecture. Elles ne sont pas chiffrées par Manger! : utiliser un appareil protégé et ne pas activer cette option sur un appareil partagé non fiable.

Les copies peuvent être retirées dans les commandes prévues du hors connexion ou avec les données du site dans le navigateur. La déconnexion explicite efface les copies de courses et recettes du navigateur concerné. La révocation serveur de toutes les sessions **ne garantit pas l'effacement immédiat des copies sur un appareil hors ligne**. Les préférences visuelles ne sont pas assimilées à ces copies de contenu.

Pour ces seules finalités, aucun bandeau de consentement publicitaire n'est prévu : l'exemption des stockages nécessaires ou demandés est à confirmer selon l'usage réel de l'instance. Ajouter des statistiques ou traceurs tiers impose une nouvelle analyse, même si leur stockage n'est pas un cookie. Référence : [CNIL — cookies et traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi).

## 5. Durées et suppression : limites actuelles

Les accès peuvent être désactivés par l'administrateur et les sessions révoquées. Les invitations sont à usage unique, expirent après 24 heures et peuvent être remplacées ou annulées. Les compteurs de connexion utilisent des expirations et un nettoyage déclenché lors de nouvelles opérations.

Une expiration empêche l'usage d'un accès ; elle ne prouve pas la suppression physique immédiate de toutes ses traces. **Désactiver un compte ne supprime pas son enregistrement.** Il n'existe pas actuellement de procédure complète dans l'interface permettant de supprimer toutes les données relatives à une personne dans tous les stockages.

Le code ne fixe pas de durée générale d'effacement pour les comptes, profils, recettes, repas ou sauvegardes. L'administrateur doit organiser la conservation et l'effacement selon son usage et les règles qui lui sont applicables. Ne pas confondre le compte de connexion, un profil de personne et les données partagées qui peuvent mentionner cette personne.

La sauvegarde téléchargée contient les données et photos du foyer dans un fichier SQLite non chiffré par l'application. Elle n'inclut pas `accounts.db`, ne constitue pas une réponse individuelle automatique à une demande d'accès et doit être protégée sur son support. Une restauration et ses copies de récupération peuvent maintenir des versions antérieures ; les intégrer à la politique de conservation.

## 6. Information à compléter pour une instance soumise au RGPD

Avant une collecte concernée, l'administrateur doit compléter et rendre accessible une information adaptée, notamment :

1. Identité du responsable, contact pour les données et délégué éventuel lorsqu'il existe ou est requis.
2. Finalités et bases légales ; informations nécessaires/facultatives et conséquences de leur absence.
3. Destinataires et prestataires réellement choisis, transferts éventuels et garanties applicables.
4. Durées ou critères de conservation, copies de récupération et sauvegardes comprises.
5. Droits applicables et façon de les exercer, notamment réclamation auprès de la CNIL ; préciser les droits conditionnels sans tous les promettre de façon absolue.

L'identité de cet administrateur et ses prestataires ne sont pas connus de l'éditeur à partir du code distribué. Ce document ne publie donc pas de coordonnées fictives et ne désigne pas arbitrairement une association ou une personne comme responsable de toutes les instances.

Source : [CNIL — information et transparence](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence). Le fonctionnement constaté doit être réexaminé après toute modification du code, de l'hébergement ou des services connectés.
