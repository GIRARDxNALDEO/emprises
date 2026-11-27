# EMPRISES — dépôt unique GIRARDxNALDEO/emprises

## 1. Import
Importer **le contenu du dossier** dans la branche main du dépôt privé `https://github.com/GIRARDxNALDEO/emprises`. Ne pas importer le ZIP tel quel (GitHub Actions ne pourrait pas lire le code).

## 2. Variables
Dans **Settings > Secrets and variables > Actions > Variables**, ajouter les variables non secrètes :
- `VITE_SUPABASE_URL` = URL du projet Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY` = clé publique publishable (jamais la `service_role` ni la clé secrète).

La clé publique n'est pas une clé de privilèges. Les règles RLS doivent être testées avant l'utilisation réelle.

## 3. Activer le déploiement GitHub Pages
Sous **Settings > Pages**, choisir **Build and deployment > GitHub Actions**. Vérifier que la formule GitHub permet Pages sur ce dépôt privé, sinon utiliser Cloudflare Pages sans créer de nouveau dépôt.

## 4. Exécuter les migrations SQL
Dans un projet Supabase de développement **vide**, relire et appliquer successivement les fichiers de `supabase/migrations` depuis SQL Editor. Ne pas exécuter sans revue sur une base contenant des données. Activer PostGIS. Configurer Auth, les invitations, les rôles et le domaine du site pour les redirections.

## 5. Contrôles obligatoires avant production
- `npm run build` réussit dans GitHub Actions.
- Connexion d'un admin et d'un chargé d'affaires invité.
- Vérification RLS pour deux organisations distinctes et utilisateurs sans droits.
- Création et réouverture d'une affaire, persistance de plusieurs zones.
- Export KML, GeoJSON, DXF, PDF et essais d'impression à différents zooms.
- Chiffrage et interdiction de modification des barèmes par un chargé d'affaires.
- Archives, restauration, suppression et sauvegardes/restaurations.

**Important :** ce projet est encore en développement : un build et une publication réussis ne prouvent pas la conformité fonctionnelle ou réglementaire.
