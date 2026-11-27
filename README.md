# EMPRISES V2 — by RHOTOR SOLUTIONS

**Projet en développement — livraison de consolidation du 27/11/2026**. Ce dépôt est un socle **non prêt pour la production**. Il reprend le parcours général identifié dans l'application publiée « Emprises — Missions drone », mais **ne contient pas le code source original**, qui n'a pas été retrouvé. Ne pas écraser l'application existante avant import, comparaison et tests.

## Livré dans cette archive

- React + TypeScript + Vite avec identité RHOTOR, connexion Supabase, sélection organisation, création/lecture des affaires.
- Carte Leaflet avec choix Plan OSM / orthophoto IGN, couche cadastrale, import KML polygonal, dessin simplifié de zones, enregistrement PostGIS via RPC, listing et exports KML/GeoJSON.
- Migrations Supabase SQL (001 à 005) : organisations séparées, utilisateurs par invitation, membres multi-rôles, affaires et zones, missions, tarifs versionnés, estimations, stockage privé, historique et règles RLS.
- Administration: archivage/restauration/corbeille, publication de barème depuis une interface restreinte aux administrateurs. Gestion des invitations et des membres depuis l’interface non implémentée.
- Calcul serveur des estimations **par mission** (minimum GCP par mission), prix historiques figés.

## Pas encore livré

- Code d’origine, édition fine des sommets, GeoPackage, PDF/Excel de chiffrage avec modèles définitifs, invitation depuis l’interface, gestion complète des comptes et modèles, moteur cartographique PDF de qualité homologable et sauvegardes automatisées. L’export Préfecture multi-zones est une **page cartographique imprimable via le navigateur** et non un PDF serveur garanti; les fonds externes exigent des vérifications à l’impression.
- Gestion d'erreurs exhaustive, tests automatisés, conformité réglementaire du PDF, et audit de sécurité indépendant.
- Vérification de compilation sur cet environnement: `npm install` n'a pas pu être terminé (accès au registre indisponible). Exécuter les commandes ci-dessous sur un poste disposant d'Internet.

## Démarrage local

1. Installer Node.js LTS.
2. `npm install`
3. Copier `.env.example` vers `.env` et renseigner **seulement** URL Supabase et clé `sb_publishable_...` (jamais une clé secrète).
4. `npm run dev`
5. `npm run build` pour vérifier avant publication.

## Installation Supabase

Suivre [docs/INSTALLATION.md](docs/INSTALLATION.md). Exécuter **dans l'ordre**, dans un **nouveau projet** uniquement, les migrations de `supabase/migrations/`. Les scripts ne sont pas idempotents; ne pas les réexécuter sur une base déjà migrée.

## Déploiement

GitHub privé, puis hébergement de la partie Vite avec build `npm run build` et dossier `dist`. Renseigner les deux variables `VITE_...` sur l'hébergeur. Auth URL configuration Supabase doit contenir le domaine de production. Aucune clé admin dans le front.

## Points de vigilance avant production

1. Revoir et tester toutes les RLS avec trois vrais profils (admin, chargé d'affaires, télépilote) et deux organisations.
2. Désactiver l'inscription publique, utiliser les invitations Supabase.
3. Migrer le code d'origine en conservant la mise en page EMPRISES et l'export Préfecture, après audit.
4. Ajouter une vraie corbeille (liste des `supprimee`, restauration, suppression définitive différée) et l'archivage accessible depuis l'admin.
5. Mettre en place sauvegarde DB + objets Storage, restaurations testées, RGPD et hébergement conforme aux politiques de l'entreprise.

## Sources techniques

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- PostGIS: https://supabase.com/docs/guides/database/extensions/postgis
- Storage RLS: https://supabase.com/docs/guides/storage/security/access-control
- Invitation: https://supabase.com/docs/guides/auth/users

### Reprise de l'application d'origine et limites
Le site ChatGPT publié n'expose pas le code source du projet Work. Le présent dépôt est
un développement séparé basé sur les fonctionnalités connues, **pas une extraction
fidèle de ce projet privé**. La mise en production reste interdite tant que les
migrations, les tests RLS multi-comptes, les sauvegardes, l'authentification,
les exports et les usages métiers n'ont pas été validés sur un environnement de test.
La couche Parcellaire Express utilise un service WMS IGN ; disponibilité et
conditions d'usage à contrôler au déploiement. Les DXF Lambert-93 et CC45 sont désormais calculés en mètres par projection conique conforme (test de coordonnées de référence effectué) ; contrôle métier SIG/DAO toujours nécessaire.

## Changements du 27/11 — reprise en cours

- Sélecteur de fonds OSM / orthophotos IGN.
- Import KML des Placemark Polygon/MultiPolygon avec validation des coordonnées et sauvegarde via `save_zone` (permissions PostGIS existantes).
- La couche parcellaire cadastrale reste optionnelle.
- L’accès au code source original Work est toujours indisponible, et la compilation ne peut pas être certifiée sans les dépendances Node téléchargées.


## Consolidation fonctionnelle du 27/11 (même dépôt)

- Un module `src/lib/prefecture.ts` compose une carte et une légende multi-zones avec orthophoto IGN ou OSM et ouvre une page A4 paysage imprimable. **Ce n’est pas encore l’export PDF Préfecture historique**. Il dépend de l’impression du navigateur et de services de tuiles externes ; validation préalable obligatoire.
- DXF métriques EPSG:2154 et EPSG:3945, fonctions de projection contrôlées à l’aide de coordonnées de référence PROJ/pyproj.
- Espace de chiffrage connecté aux RPC : la création d’une estimation utilise une mission créée à la demande, les prix restent versionnés en base.
- Écran d’administration du barème accessible au rôle administrateur, suppression contrôlée des zones.
- Migration `202611270005_production_controls.sql` : verrouillage des colonnes sensibles, RPC de création de mission et suppression de zone.

### Conditions non satisfaites pour le label « prêt à la production »

- `npm install` bloqué dans l’environnement de génération : impossible de compiler et tester l’application complète. Les modules TypeScript ont passé une vérification de syntaxe ; ce n’est pas une compilation ni un test fonctionnel.
- SQL non exécuté sur un Supabase réel ; politiques RLS non testées avec utilisateurs réels.
- Code de l’application Work d’origine toujours inaccessible : reprise visuelle partielle seulement.
- Aucun déploiement, test e2e, test d’impression A4 multi-navigateurs ni stratégie de sauvegarde/restauration validée.
- Les modèles d’en-tête NALDEO/RHOTOR sont des libellés dans la version actuelle ; les logos et les modèles administrables sont encore à intégrer.
- L’accès navigateur aux fichiers et aux bases externes exige l’autorisation et les connexions explicites de l’utilisateur.

**Ne pas écraser le site existant avec ce code sans recette.**
