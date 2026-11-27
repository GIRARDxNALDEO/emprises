# Guide d'installation guidé — débutant

## 1. Projet Supabase neuf

Ouvrir https://supabase.com/dashboard et créer un projet dédié `emprises-missions-drone`. Choisir une région UE appropriée. Garder le mot de passe de base **privé**. L'extension PostGIS sera activée par le premier script SQL dans le schéma `extensions`.

## 2. Migrations SQL

Dans **SQL Editor**, ouvrir puis exécuter les cinq scripts `supabase/migrations/` un par un dans l'ordre lexical:

1. `202611270001_core.sql`: tables, géométries, RLS, RPC zones et statuts.
2. `202611270002_pricing_and_storage.sql`: barèmes, calcul des devis et bucket privé.
3. `202611270003_hardening.sql`: limitations des mises à jour.
4. `202611270004_admin_trash.sql`: visibilité de la corbeille réservée aux administrateurs.
5. `202611270005_production_controls.sql`: protection des champs sensibles et fonctions contrôlées.

**Attention**: sur une base en production, utiliser ensuite des migrations versionnées (Supabase CLI). Ces scripts initiaux ne sont pas prévus pour être relancés. Éviter de les exécuter sur une base contenant déjà des données.

## 3. Comptes / invitation obligatoire

Dans **Authentication → Providers / Sign In**, désactiver l'inscription publique (réglage actuel selon interface). Ne pas activer l'inscription libre par email. Dans **Authentication → Users**, inviter l'administrateur et les autres utilisateurs depuis le tableau de bord (ou une future Edge Function authentifiée et autorisée). Le trigger crée leur `profiles` lors de l'ajout dans `auth.users`.

Dans SQL Editor, après création du compte admin, exécuter le script ci-dessous en remplaçant uniquement l'UUID de l'utilisateur par celui visible dans **Authentication → Users** et en adaptant les noms d'organisations.

```sql
insert into public.organizations(name,slug) values
('RHOTOR SOLUTIONS','rhotor-solutions'),
('NALDEO','naldeo');

-- Remplacer par le vrai UUID de l'utilisateur auth, PAS son email.
insert into public.memberships(organization_id,user_id,role)
select id,'00000000-0000-0000-0000-000000000000'::uuid,'admin'::public.app_role
from public.organizations;
```

Ne pas exécuter ce dernier bloc sans remplacer l'UUID de démonstration. Pour ajouter un chargé d'affaires à une seule organisation :

```sql
insert into public.memberships(organization_id,user_id,role)
select id,'UUID_UTILISATEUR_ICI'::uuid,'charge_affaires'::public.app_role
from public.organizations where slug='naldeo';
```

Une personne peut avoir deux rôles : ajouter une ligne par rôle. Le système n'ouvre aucun droit métier simplement parce qu'un compte Auth existe.

## 4. Publier le barème de départ (admin connecté)

La fonction RPC `admin_publish_pricing` reçoit les valeurs suivantes :

- `p_org` : UUID de l'organisation.
- `p_gcp_per_ha` : 4 par défaut souhaité, modifiable par admin.
- `p_min_gcp` : minimum GCP **par mission**.
- `p_lidar`, `p_photo`, `p_gcp_unit`, `p_mobilisation`, `p_setup`, `p_processing` : montants HT.

Un écran de publication du barème existe, mais la gestion des invitations et habilitations reste à développer. Ne pas considérer les tarifs d'exemple comme validés. Pour une première vérification, configurer le barème via un appel RPC fait par un utilisateur admin connecté; ne pas insérer manuellement de prix dans le frontend.

## 5. Connexion frontend

Dans **Project settings → API Keys**, copier **Project URL** et la clé **publishable** dans `.env`:

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Ne jamais copier la clé `sb_secret_...`, `service_role`, les mots de passe ou le token d'accès GitHub dans un fichier commité.

Lancer `npm install` puis `npm run dev` sur le PC. Connecter un compte réellement invité et habilité, puis créer une affaire, dessiner une zone et vérifier qu'elle est toujours présente après déconnexion et reconnexion.

## 6. GitHub

Créer un dépôt **privé** `emprises-missions-drone` puis envoyer le contenu de ce dossier. La présence de `.gitignore` empêche l'ajout accidentel du `.env`. Vérifier quand même manuellement le contenu de chaque commit.

## 7. Mise en ligne

Avec Cloudflare Pages (ou hébergement statique similaire), connecter le dépôt GitHub, choisir Vite et le répertoire de sortie `dist`; définir les variables d'environnement publiques. Configurer le domaine dans `Authentication → URL Configuration` de Supabase.

## 8. Tests impératifs avant usage professionnel

- L'admin RHOTOR ne doit pas voir les données NALDEO sans adhésion autorisée; même exigence dans l'autre sens.
- Un chargé d'affaires ne peut pas modifier les barèmes ou les appartenances.
- Un utilisateur non autorisé ne peut pas récupérer une zone en modifiant son UUID.
- Les coordonnées des zones et les versions de chiffrage restent identiques après plusieurs connexions.
- Les exports KML et GeoJSON se réimportent correctement dans QGIS.
- Pour la production : auditer la RLS, la gestion des buckets, les documents, les estimations et les conditions RGPD.
