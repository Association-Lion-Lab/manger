# Leaflet distribué avec Manger!

- Version : 1.9.4, paquet npm `leaflet@1.9.4`.
- Source : https://leafletjs.com/download.html ; documentation : https://leafletjs.com/reference.html.
- Licence BSD-2-Clause conservée dans [LICENSE](LICENSE), avec les notices des fichiers originaux.
- Fichiers distribués sans modification : `dist/leaflet.js` et `dist/leaflet.css`. Aucun script d'installation exécuté ; pas de dépendance npm de production ajoutée.
- Intégrité du paquet vérifiée contre le registre : `sha512-nxS1ynzJOmOlHp+iL3FyWqK89GtNL8U8rvlMOsQdTTssxZwCXh8N2NB3GDQOL+YR3XnWyZAxwQixURb+FA74PA==`.
- Audit npm isolé de cette version : aucune vulnérabilité connue signalée le 14 octobre 2026. Ce résultat ne garantit pas l'absence de toute vulnérabilité.

Manger utilise ses propres repères DivIcon, pas les images par défaut ni le contrôle de couches. La source map de débogage n'est pas distribuée. Seuls le JS et le CSS sont servis par une liste exacte du serveur ; aucune ouverture générique de ce dossier.

Les fonds de carte restent externes : https://tile.openstreetmap.org/{z}/{x}/{y}.png. Attribution visible, cache navigateur normal, pas de téléchargement hors connexion ou préchargement de zones. Politique : https://operations.osmfoundation.org/policies/tiles/. Les essais automatisés interceptent les tuiles et ne chargent pas les serveurs OSM.
