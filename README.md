# Manger!

**Migration PostgreSQL explicite :** candidat, restauration complète et HTTPS validés sous Docker Linux ; import sur copie privée puis [mise en service LAN confirmée par l’administrateur](docs/POSTGRESQL-ADMIN.md#bascule-linux-confirmée--27-octobre-2026), recette iPhone encore attendue. Le guide distingue les données à conserver du cas autorisé après anciennes données de test. Les commandes standard ci-dessous conservent SQLite et ses volumes. Une instance passée à PostgreSQL utilise les fichiers, le projet et la procédure de maintenance du guide PostgreSQL ; aucune conversion implicite.

> On mange quoi cette semaine ?

Planificateur de repas libre et auto-hébergeable : recettes avec étapes, planning du foyer, assiettes adaptées à chacun, sorties et dates, placard anti-gaspi et courses partagées. Interface pensée d'abord pour le téléphone, avec les onglets Semaine, Recettes, Courses et Compte.

## Démarrer

Depuis la racine du dépôt, avec Docker Engine et Compose :

```sh
docker compose up -d --build
docker compose exec manger node accounts.js create-admin admin
```

La deuxième commande sert uniquement à créer le premier administrateur si aucun accès n'existe. Conserve le mot de passe généré dans un gestionnaire ; aucun mot de passe par défaut n'est fourni. Le service utilise le port **3000** et le volume `manger-data`. Reste sur un réseau de confiance ou un VPN ; ne l'expose pas directement à Internet.

Pour une installation existante, suivre [la procédure Docker sécurisée](docs/DOCKER.md) : sauvegarder les deux bases, construire et tester l'image avant de remplacer le service. Le build vérifie maintenant le chargement des modules ; ne jamais supprimer les volumes pour mettre à jour.

En développement sans Docker, Node.js **24 ou plus récent** :

```sh
npm ci --ignore-scripts
node accounts.js create-admin admin
npm start
```

Les bases sont dans `data/` par défaut. HTTPS est optionnel et nécessite une configuration explicite ; l'installation seule ne l'active pas. Ouvre l'adresse du serveur en HTTP ou HTTPS selon cette configuration.

## Documentation du projet

- [Index de toute la documentation](docs/README.md).
- [Fonctionnalités réalisées](docs/FONCTIONNALITES.md) et [guide complet](docs/GUIDE.md).
- [Architecture et maintenance](docs/ARCHITECTURE.md).
- [Choix techniques, limites et blocages](docs/DECISIONS.md).
- [Historique et priorités](docs/ROADMAP.md), [HTTPS local](docs/HTTPS.md) et [direction visuelle](docs/DESIGN-REFONTE.md).

Les règles de contribution figurent dans [AGENTS.md](AGENTS.md) : toute modification de code doit actualiser la documentation dans `docs/`.

## Tests et licence

`npm test` exécute les tests Node sur des données isolées. Les résultats locaux ne prouvent pas le fonctionnement sur un iPhone ou un serveur distant ; voir les limites documentées.

Code sous [GNU AGPL-3.0-or-later](LICENSE). Les recettes originales du catalogue sont dédiées au domaine public sous CC0-1.0. Les recettes importées restent des contenus de leurs sources ; aucune recette ni photographie Jow n'est reprise.
