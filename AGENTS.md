# Consignes du projet Manger!

Ces consignes s'appliquent à tout le dépôt.

- **Mets à jour la doc dans `/docs` à chaque modification de code.** `/docs` désigne le dossier `docs/` à la racine de ce dépôt. Documente le comportement réellement livré et ses limites dans la même modification que le code.
- **Écris des fonctions courtes et lisibles par un humain.** Réutilise les fonctions et contrôles existants, nomme clairement les responsabilités et évite les abstractions ou dépendances inutiles. Ne lance pas de refonte sans rapport avec la demande pour raccourcir du code ancien.
- **Explique chaque blocage ou choix technique dans la doc.** Dans `docs/DECISIONS.md`, indique le contexte, le choix et sa raison, les alternatives pertinentes, les conséquences, la preuve de validation et ce qui reste à vérifier. Pour un blocage, précise la cause connue ou incertaine et l'action permettant de le lever.

## Documentation et vérification

Commence par [l'index](docs/README.md), puis lis les pages concernées. Le code actuel prévaut sur un ancien compte rendu. Conserve l'historique dans [la feuille de route](docs/ROADMAP.md) ; ne présente jamais une idée différée ou une maquette comme une fonction livrée.

Vérifie les comportements modifiés avec des tests proportionnés au risque. Distingue tests locaux, simulations et validation réelle sur appareil ou serveur. Ne publie jamais de données personnelles, sauvegardes SQLite, mots de passe, liens d'invitation actifs, fichiers `.env` ou clés TLS dans la documentation. Utilise `admin` dans les exemples publics.

Le produit reste principalement mobile : quatre onglets, commandes sobres, pas d'heure de repas ni d'écran ajouté sans nécessité. Préserve les données locales ignorées et ne modifie pas l'installation Ubuntu de l'utilisateur pour valider le développement.
