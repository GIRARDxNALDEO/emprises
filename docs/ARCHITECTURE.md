# Architecture retenue et limites du premier lot

## Structure métier

- `organizations` → `memberships` → `profiles` (multi-rôles par société, droits distincts)
- `organizations` → `affaires` → `zones` (PostGIS MultiPolygon WGS84)
- `affaires` → `missions` → `mission_zones` (sous-ensemble explicite de zones; si aucun lien, toutes les zones de l'affaire sont prises pour le calcul)
- `organizations` → `pricing_rules` (append-only, barème actif versionné)
- `missions` → `estimates` → `estimate_lines` (copies des règles, résultats immuables)
- `affaires` → `documents`, `activity_logs`, `affaire_access`
- `organizations` → `document_templates`, `app_settings`

## Permissions (lot initial)

- `admin`: vue globale de son organisation et RPC de changements de statuts et tarifs.
- `charge_affaires`: crée ses propres affaires, lit et modifie les affaires accessibles, crée des zones via RPC.
- `telepilote`: lit les affaires où il est attribué à une mission, sans pouvoir modifier le barème.
- `affaire_access`: dossier explicitement partagé avec des collaborateurs de la même organisation.
- Pas de suppression définitive sur ce lot, pas d'édition des permissions par navigateur.

## Geometrie

- Stockage `MultiPolygon` EPSG:4326. Surface en m² avec `ST_Area(geom::geography)`.
- Pour les estimations, union géométrique par technique LiDAR ou photogrammétrie avant calcul de la surface afin de ne pas doubler les chevauchements d'une même technique.
- Les chevauchements entre **techniques différentes** peuvent être facturés séparément selon la demande. À valider avec les futurs barèmes.
- DXF CC45 / Lambert-93 et GeoPackage à développer dans le lot export.

## Sécurité

Les tables ont RLS et privilèges explicitement définis. Les helpers `SECURITY DEFINER` sont dans le schéma non exposé `private` avec `search_path` fixe. Les RPC sensibles vérifient le rôle avant toute action.

Le stockage `emprises-private` est **lecture seule côté navigateur** pour l'instant; des fonctions serveur seront nécessaires pour upload, signatures, et suppressions cohérentes. Le SQL n'autorise pas encore l'upload du PDF Préfecture.

## Reprise de l'existant

La trace retrouvée du projet publié mentionne l'espace demandeur, le dessin sur carte et l'import KML. Le code original n'est pas inclus dans la bibliothèque consultée. L'interface créée ici est un **squelette neuf stylistiquement cohérent**, pas une conversion exacte du projet d'origine. La reprise fidèle du PDF Préfecture multi-zones nécessite le code de l'ancien export ou ses spécifications et un exemple PDF.

## Lots ultérieurs

1. Import fidèle de l'ancienne interface + édition cartographique avancée + fond parcellaire.
2. Exports PDF Préfecture multi-zones A4/A3 avec moteur d'impression cartographique et attribution des sources.
3. DXF, GeoPackage, KML avancé, chiffrage UI et personnalisation des en-têtes RHOTOR/NALDEO/neutre.
4. Interface d'administration des invitations, barèmes, corbeille et historique, RGPD, reprise des données existantes, tests et production.
