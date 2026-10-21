# Conformité France et Union européenne — dossier de travail

État au **19 octobre 2026**, code examiné : `034311b`, branche `development`. Cette page est un cadrage documenté, **pas une certification de conformité ni un avis juridique**. Les points ouverts ci-dessous ne sont pas déclarés résolus par la seule création de cette documentation.

## 1. Modèle confirmé et limites de la revue

Le porteur du projet a confirmé le 19 octobre : **chaque administrateur gère son propre serveur Manger!**. Le modèle examiné est donc celui d'un logiciel distribué et auto-hébergeable, avec un foyer partagé par instance. Ce n'est pas un hébergement central de plusieurs foyers par l'éditeur.

FDL, le futur service communautaire, et le futur scan de recettes sont des projets distincts, hors de ce dossier. Leur conformité ne découle pas de celle de Manger!.

Revue réalisée : dépendances et configuration de livraison, parcours de suggestions/recherche/import, stockage des comptes, cookies et copies locales, sauvegardes, notices existantes et droits annoncés sur le catalogue. Aucun accès aux bases du foyer, au serveur Ubuntu ou aux appareils distants. Pas de recherche d'antériorités de marque, de test d'intrusion complet ni d'examen juridique de chaque recette et image.

La revue AI Act précédente a exécuté 25 tests ciblés avec succès, après autorisation des connexions de test locales. Aucun nouveau comportement applicatif n'est livré par le présent lot documentaire ; ces tests ne prouvent ni la conformité juridique ni un déploiement distant.

## 2. Qui doit faire quoi ?

| Acteur | Périmètre à prendre en charge | Limite importante |
| --- | --- | --- |
| Éditeur/distributeur de Manger! | Code et licences distribués, origine des contenus livrés, conception et documentation de sécurité/confidentialité | Ne peut pas garantir les paramètres ni les pratiques de toutes les instances |
| Administrateur de l'instance | Choix de l'hébergement, accès, membres invités, sauvegardes, prestataires et pratiques de conservation | L'étiquette « auto-hébergé » n'efface pas les obligations applicables à son activité |
| Membres du foyer | Informations et contenus saisis, personnes destinataires d'un partage volontaire | Un membre connecté accède au foyer partagé, pas à un espace personnel cloisonné |
| Hébergeur et messagerie choisis | Opérations effectivement réalisées pour l'instance | Rôles, contrats et transferts à examiner selon les prestations réelles |
| Mainteneur intervenant sur des données réelles | Support, maintenance ou traitement autorisé et limité à un besoin | Peut nécessiter un encadrement de sous-traitance ; pas de transmission spontanée de bases via les tickets |

Les rôles RGPD se déterminent par les faits : finalités et moyens décidés, opérations réalisées, destinataires. Ne pas désigner automatiquement l'éditeur comme sous-traitant de tous les foyers, ni conclure qu'il est toujours exonéré parce qu'il n'héberge pas leurs bases. Source : [CNIL — identifier son rôle](https://www.cnil.fr/fr/rgpd-comment-bien-identifier-son-role).

Pour une personne physique et une activité strictement personnelle ou domestique, une exclusion du champ du RGPD peut s'appliquer. Elle ne s'étend pas automatiquement à une association, une entreprise, un usage professionnel ou des activités excédant ce cadre. Elle n'est pas une dispense générale des autres lois. Source : [RGPD, article 2 et considérant 18, version publiée par la CNIL](https://www.cnil.fr/fr/reglement-europeen-protection-donnees).

## 3. État des principaux sujets

### 3.1 Données personnelles et information

**Constaté :** bases `manger.db` et `accounts.db` sur le serveur de l'administrateur ; pas de télémétrie ou de compte central de l'éditeur trouvé dans le code examiné. Une [notice technique](CONFIDENTIALITE.md) décrit les données et les échanges réellement prévus.

**Accès livré après ce cadrage :** un résumé commun « Confidentialité et licences » est replié sur Connexion, Mon compte et dans Compte, avec les échanges externes, limites des copies/suppressions et licences. Aucun formulaire d'acceptation ni traceur ajouté.

**À compléter :** le logiciel ne connaît pas l'identité du responsable de chaque instance. Lorsque le RGPD s'applique, l'administrateur doit définir et communiquer le responsable, les finalités, les bases légales, les destinataires, les durées et les modalités d'exercice des droits. Le résumé générique ne remplace pas cette information spécifique. Ne pas inventer un contact, demander un consentement général à tout, ou considérer l'acceptation d'une notice comme la base légale de tous les traitements.

Les champs libres et régimes peuvent révéler des informations sensibles suivant leur contenu et leur contexte. Les goûts ne constituent pas un dossier médical ; ne pas ajouter une collecte de santé, de religion ou d'allergies garanties sans nouvelle analyse. Source : [CNIL — guide RGPD du développeur](https://www.cnil.fr/fr/guide-rgpd-du-developpeur).

### 3.2 Cookies et stockage du navigateur

**Constaté :** cookie d'authentification `manger_session`, réglages d'affichage/calendrier, coordination des changements de compte et copies hors connexion demandées par l'utilisateur. Aucun traceur publicitaire ou outil de mesure d'audience tiers repéré.

**Conséquence proposée :** pas de bandeau de consentement ajouté par principe pour ces seules finalités nécessaires ou explicitement demandées. L'exemption dépend de la finalité et des conditions d'usage réelles, pas du nom du stockage : `localStorage` n'est pas hors droit des traceurs. Informer sur ces usages et réexaminer avant d'ajouter un outil tiers. Source : [CNIL — cookies et traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi).

### 3.3 Conservation, droits et sauvegardes

**Constaté :** les sessions expirent après sept jours et l'invitation après 24 heures ; l'expiration d'un accès ne signifie pas que toutes ses traces sont immédiatement supprimées. Les nettoyages de tables sont déclenchés par certaines opérations, pas par une purge générale autonome.

Désactiver un compte met `active=0` et révoque ses sessions ; cela ne supprime ni sa ligne ni les informations personnelles éventuellement présentes dans le foyer. Les profils de personnes sont distincts des comptes de connexion. La sauvegarde exportée couvre le foyer, pas `accounts.db` ; elle n'est pas un export individuel de droits RGPD et peut contenir les données d'autres membres.

**À faire si RGPD applicable :** définir puis appliquer les durées ; une durée n'est pas nécessairement la même pour toutes les données. Mettre en place une procédure d'accès, rectification et effacement proportionnée, couvrant comptes, profils, champs libres, sauvegardes, copies de récupération et appareils. Aucun bouton « supprimer mon compte » ni effacement à distance d'un appareil hors ligne n'est prétendu livré.

Une procédure manuelle documentée peut être appropriée au volume réel ; le RGPD n'impose pas systématiquement un bouton ou un DPO. Elle doit réellement fonctionner et respecter les droits d'autrui. Le délai de réponse est en principe d'un mois, avec prolongation encadrée lorsque les conditions sont réunies. Sources : [CNIL — conservation](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees), [droit d'accès](https://www.cnil.fr/fr/repondre-une-demande-de-droit-dacces).

### 3.4 Recettes, photos, logo et licences

**Constaté :** code annoncé sous AGPL-3.0-or-later, textes originaux du catalogue annoncés sous CC0-1.0, quatre adaptations avec liens de sources. Les photos personnelles ne sont pas ajoutées au dépôt par la fonction de photo du serveur.

**Droits à justifier avant une diffusion élargie :**

1. Distinguer les idées/méthodes culinaires des textes, images et autres éléments protégés ; un lien ou un crédit ne remplace pas l'autorisation nécessaire.
2. Documenter l'origine et les droits des quatre adaptations et des éléments graphiques distribués, sans les déclarer illicites du seul fait de leur référence.
3. Limiter l'annonce CC0 aux droits que le contributeur peut effectivement accorder ; elle ne libère pas les contenus tiers ni les droits indisponibles selon le droit applicable.
4. Garder l'import internet volontaire et les sources ; ne pas présenter la copie privée comme une autorisation automatique de redistribution collective ou publique.
5. Prévoir un contact de signalement des contenus du dépôt et une procédure d'examen ; ne pas afficher une certification de marque ou d'absence de contrefaçon du logo sans vérification.

Sources : [CPI, article L122-4](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006278911), [CPI, article L122-5](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048603495).

Le texte AGPL est inclus dans `LICENSE`. Les obligations varient avec la distribution et la modification : une version modifiée accessible par réseau doit notamment proposer son code source correspondant dans les conditions de la section 13. Un lien vers le dépôt d'origine ne suffit pas si l'instance exécute d'autres modifications. La rubrique affiche désormais les liens vers le projet, GNU AGPL et CC0, et rappelle à l'administrateur la version modifiée ; elle n'héberge pas automatiquement les sources spécifiques des administrateurs. Références : [AGPL v3](https://www.gnu.org/licenses/agpl-3.0.html), [FAQ GNU](https://www.gnu.org/licenses/gpl-faq.en.html).

### 3.5 Sécurité et incidents

**Contrôles présents dans les chemins examinés :** mots de passe hachés, sessions/invitations représentées par empreintes côté serveur, contrôle des accès, limitation des connexions, protection des actions intersites, validation des imports et sauvegardes réservées aux administrateurs. Ce n'est pas le résultat d'un audit de sécurité exhaustif.

HTTPS et les cookies `Secure` dépendent de la configuration. Un réseau local n'est pas une preuve de confidentialité ; un certificat auto-signé doit être correctement vérifié et approuvé sur les appareils. Les sauvegardes téléchargées et les bases ne sont pas chiffrées par l'application : sécuriser les supports, accès et destinations, selon le risque.

Il manque un point de contact de sécurité dédié et une procédure versionnée de signalement et de traitement des vulnérabilités. Le mode de contact ne doit pas inviter à publier des bases ou mots de passe dans un ticket public. Lorsqu'un traitement relève du RGPD, prévoir aussi l'évaluation et la documentation des violations ; notification à la CNIL lorsque les conditions sont réunies, dans les meilleurs délais et si possible sous 72 heures, et information des personnes si le risque élevé le requiert. Source : [CNIL — notifier une violation](https://www.cnil.fr/fr/services-en-ligne/notifier-une-violation-de-donnees-personnelles).

**Défaut technique identifié le 19 octobre, hors qualification juridique :** le `Dockerfile` ne copiait pas `catalog-extra.js`, pourtant chargé par `catalog.js`. Le [correctif du 21 octobre](DOCKER.md) remplace cette liste fragile par une copie filtrée et un contrôle de modules à la construction, avec scripts de vérification d'image et CI préparée. Régressions locales vérifiées ; **image neuve non construite/testée ici faute de Docker**, activation et exécution de la CI encore à faire. Cela ne clôt pas les autres obligations d'exploitation, de signalement ou de conformité.

## 4. Textes à examiner selon l'activité réelle

| Sujet | Conclusion limitée au périmètre actuel | Déclencheur d'une nouvelle analyse |
| --- | --- | --- |
| AI Act | Fonctions examinées fondées sur traitements et règles explicites ; aucun système d'IA intégré identifié | Modèle intégré, service d'IA externe ou changement de capacité d'inférence ; usage professionnel des outils d'IA de production à examiner séparément |
| Mentions légales et information du service | La notice d'une instance ne peut pas annoncer l'éditeur du logiciel comme son hébergeur par défaut | Site public de l'éditeur ou instance qualifiable de service de communication au public ; identité/statut réel de l'opérateur à vérifier |
| Consommation et accessibilité | Pas de vente ou d'abonnement intégré constaté ; pas de certification RGAA ou exemption universelle annoncée | Offre commerciale, fourniture de contenu/service numérique contre données selon les conditions légales, opérateur soumis à obligations particulières |
| Cyber Resilience Act | Vérifier la qualification de la distribution, de son éventuel caractère commercial et d'un éventuel rôle d'intendant de logiciel libre | Changement de financement, modèle commercial, prestations ou organisation du développement |
| DSA / plateforme et contenus | Pas de catalogue communautaire hébergé centralement dans Manger! actuel ; ne pas importer les conclusions de FDL | Hébergement ou diffusion de contenus pour des tiers selon une autre activité que le foyer privé |

L'absence d'abonnement ne suffit pas à exclure tout le droit de la consommation ; « gratuit », « libre » ou « association » ne constitue pas une exemption de tous les textes. Les déclarations nutritionnelles, médicales, d'allergènes ou de conformité doivent rester cohérentes avec les fonctions réellement vérifiées.

Sources AI : [définition et considérant 12](https://ai-act-service-desk.ec.europa.eu/en/ai-act/recital-12), [article 50](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50), [article 4](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-4). Les textes et images assistés par IA utilisés pour créer le produit sont un sujet distinct : ne pas conclure à l'absence de toute obligation de publication au seul motif que l'application n'embarque pas de modèle ; les conditions de l'article 50 et le contrôle éditorial humain sont à examiner selon les contenus.

Sources France/UE : [LCEN consolidée](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000801164), [Service Public — règles du commerce en ligne](https://entreprendre.service-public.gouv.fr/vosdroits/F23455), [DGCCRF — accessibilité](https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/professionnels-vos-produits-et-services-doivent-etre-conformes-la-directive-accessibilite), [Commission — CRA et logiciel libre](https://digital-strategy.ec.europa.eu/en/policies/cra-open-source), [ANSSI — calendrier CRA](https://cyber.gouv.fr/reglementation/cybersecurite-des-produits/cyber-resilience-act/cadre-r%C3%A8glementaire-du-cra/). Pour les acteurs concernés, les obligations de notification CRA ont commencé en septembre 2026 et le calendrier général vise décembre 2027 ; ne pas présenter l'ensemble du règlement comme seulement futur.

## 5. Travaux prioritaires et preuve attendue

P1 signifie ici **à traiter avant de présenter une diffusion élargie comme juridiquement prête**. Ce n'est pas une liste d'infractions toutes établies ni une interdiction de l'usage familial existant.

| Référence | Travail | Preuve de clôture | Statut |
| --- | --- | --- | --- |
| J1 — P1 | Rendre l'information confidentialité/source/licence accessible sans surcharger l'interface ; permettre l'identification du contact de l'instance quand nécessaire | Parcours connexion/Compte et version spécifique à l'administrateur, textes exacts, liens et absence de données inventées | Résumé et accès aux sources/licences implémentés ; contact et information propres à l'instance restent à organiser |
| J2 — P1 | Définir la conservation et la procédure de droits pour les instances hors exception domestique | Cas d'essai isolé : départ d'une personne, compte/profil distincts, données communes et sauvegardes prises en compte | À réaliser |
| J3 — P1 | Constituer le registre des droits du contenu livré et traiter les origines incertaines | Texte/image/usage/licence/provenance examinés, résultats consignés sans licence attribuée arbitrairement | À réaliser |
| J4 — P1 | Formaliser signalement sécurité/contenu, exploitation et limites ; corriger la livraison Docker identifiée | Contact réel choisi, procédure, données sensibles interdites dans les tickets ; image neuve contrôlée après correctif | Correctif et procédures Docker préparés le 21 octobre ; image réelle/CI à vérifier, autres travaux à réaliser |
| J5 — P2 / avant changement de modèle | Confirmer les qualifications juridiques selon l'opérateur et la distribution | Relecture ciblée par une personne compétente ; CRA, site public, consommation et accessibilité examinés selon les faits | À réaliser selon périmètre |

Ne pas transformer J1 en publication de fausses coordonnées ni J2 en effacement automatique de données communes. Les paramètres et la migration éventuelle des données exigent des tests et un cadrage distincts. Ne pas modifier les instances des administrateurs à leur insu.

## 6. Décision de communication

Formulation justifiée aujourd'hui : « Manger! est auto-hébergeable ; cette documentation décrit les traitements et accompagne la configuration de chaque instance. Des travaux de conformité restent ouverts. »

Formulations non justifiées : « certifié RGPD », « conforme à toute la loi européenne/française », « nous ne sommes jamais responsables », « aucune donnée ne sort jamais de votre serveur » ou « toute recette importée est libre de droits ».

Sources de cadrage consultées le 19 octobre 2026. Une vérification spécialisée reste nécessaire pour les qualifications incertaines, les droits des contenus et tout lancement sous un modèle différent. Le code et l'installation effectivement déployés prévalent sur ce document.
