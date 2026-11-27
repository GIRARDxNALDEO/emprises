# EMPRISES — première installation Supabase

> IMPORTANT : ne pas utiliser une base contenant déjà des données pour les premiers essais.
> Le site GitHub Pages est public, mais les affaires doivent rester privées derrière Auth et RLS.

## 1. Créer les structures
Dans le projet Supabase **emprises-rhotor-solutions**, ouvrir **SQL Editor**.
Exécuter les fichiers dans cet ordre, **un par un**, en vérifiant qu'aucun ne produit d'erreur :

1. `supabase/migrations/202611270001_core.sql`
2. `supabase/migrations/202611270002_pricing_and_storage.sql`
3. `supabase/migrations/202611270003_hardening.sql`
4. `supabase/migrations/202611270004_admin_trash.sql`
5. `supabase/migrations/202611270005_production_controls.sql`
6. `supabase/migrations/202611270006_organizations.sql`

N'exécuter **aucune partie** si une migration précédente a échoué : relever le message SQL exact et corriger avant de poursuivre. Certains scripts sont non idempotents : ne pas les relancer à l'aveugle.

## 2. Inviter le premier administrateur
Dans **Authentication → Providers → Email**, vérifier le réglage d'inscription :
- si disponible, désactiver **Allow new users to sign up** ;
- conserver la possibilité d'inviter les comptes depuis le tableau de bord administrateur Supabase.

Dans **Authentication → Users → Invite user**, inviter l'adresse e-mail qui servira au premier administrateur. L'utilisateur doit apparaître dans `auth.users`.

Ouvrir `supabase/SETUP_FIRST_ADMIN.sql`, remplacer `REPLACE_WITH_YOUR_INVITED_EMAIL` par l'e-mail invité et exécuter dans le SQL Editor. Il attribue à ce compte un rôle administrateur actif dans les organisations RHOTOR et NALDEO. Aucun autre utilisateur n'est autorisé automatiquement.

**Ne pas transmettre son mot de passe ni une clé secrète au développeur.**

## 3. Configurer les URL d'authentification
Dans **Authentication → URL Configuration** :
- Site URL : `https://girardxnaldeo.github.io/emprises/`
- Redirect URLs : `https://girardxnaldeo.github.io/emprises/**`

Vérifier que la connexion par mot de passe est activée si elle est utilisée.

## 4. Activer un barème de test
Se connecter à EMPRISES, choisir l'organisation, ouvrir l'administration et créer un **barème de test**.
Attention : les nouveaux barèmes ne doivent pas être interprétés comme des devis réels tant que la recette fonctionnelle n'est pas terminée.

## 5. Test fonctionnel minimum
- Sans connexion : aucune affaire visible et aucune lecture des tables privées par API.
- Admin RHOTOR : création d'une affaire et sauvegarde d'une zone, puis réouverture.
- Admin NALDEO : mêmes opérations, sans mélange des données.
- Chargé d'affaires invité : peut créer une affaire mais ne peut pas publier de barèmes.
- Utilisateur sans membership : aucune affaire accessible.
- Archivage et corbeille : administrateur uniquement.
- Le stockage `emprises-private` doit rester non public.

## 6. Sauvegardes et exploitation
Prévoir des sauvegardes PostgreSQL et des objets Supabase Storage, ainsi qu'une vérification régulière des permissions. Ne déclarer l'application prête à la production qu'après migration réussie et tests d'intégration réels.
