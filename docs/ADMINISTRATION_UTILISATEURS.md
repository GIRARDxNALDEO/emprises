# EMPRISES — Activer l'administration des utilisateurs

Le front-end GitHub Pages comprend désormais **Administration → Utilisateurs**, mais
**ce module n'est utilisable qu'une fois la fonction Supabase déployée**.
Ne jamais copier la clé `service_role` dans Vite, GitHub Pages ou le navigateur.

## 1. Préparer Supabase (une seule fois)

La fonction est stockée dans `supabase/functions/manage-users/index.ts`.
Les migrations 001 et 006 doivent déjà être appliquées : elles définissent les
organisations, les profils, les rattachements et les rôles.

Lancez depuis la racine du dépôt dans un terminal avec la CLI Supabase :

```bash
npx supabase login
npx supabase link --project-ref sswadjbntazawikvrijy
npx supabase functions deploy manage-users --project-ref sswadjbntazawikvrijy
```

Ou utilisez le tableau de bord **Supabase → Edge Functions → Deploy new function**
et déployez le code de `supabase/functions/manage-users/index.ts` sous le nom
exact **manage-users**.

Le projet doit exposer aux Edge Functions les secrets serveur
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_ANON_KEY`
(ou `SUPABASE_PUBLISHABLE_KEY`), fournis par Supabase ou configurés via
**Edge Functions → Secrets**. **Ne pas les inclure dans les commits.**

### Authentification

Le déploiement standard conserve la vérification du JWT. La fonction procède
à une vérification supplémentaire via `auth.getUser(token)`, puis lit les
rôles réels de la base avant chaque opération. Elle ne se fie jamais au rôle
ou à l'organisation annoncés par le navigateur.

### SMTP pour les invitations

Supabase → **Project Settings → Authentication / SMTP** : configurer un SMTP
capable d'émettre vers les domaines externes, dont `@naldeo.com`.
Le déclenchement de l'invitation par l'API ne garantit pas la réception dans Outlook.
Vérifier les journaux Auth, les erreurs SMTP et le courrier indésirable.

Autoriser dans **Authentication → URL Configuration** le redirect :
`https://girardxnaldeo.github.io/emprises/`.

## 2. Utilisation dans EMPRISES

1. Se connecter avec un compte déjà titulaire du rôle **admin** actif dans
   RHOTOR ou NALDEO.
2. Ouvrir **Administration → Utilisateurs** dans la barre latérale.
3. Sélectionner l'organisation à administrer.
4. Renseigner l'adresse e-mail et le rôle souhaité, puis cliquer sur
   **Inviter / attribuer les droits**.
5. Si l'utilisateur n'existe pas, Supabase crée l'invitation et le rattachement ;
   si le compte existe, la fonction ajoute le rattachement sans nouvel e-mail.
6. L'annuaire permet de modifier le rôle, désactiver ou réactiver l'accès.

**Rôles :**
- **Chargé d'affaires** : crée ses propres affaires et emprises en brouillon.
- **Télépilote** : lecture/mission selon droits, ne crée pas d'affaires.
- **Administrateur** : gestion de l'organisation, de ses accès et de ses missions.

Les droits sont spécifiques à chaque organisation, sans affecter les autres.
La désactivation d'un rattachement n'efface ni le compte Auth ni ses données.
Un administrateur ne peut pas se retirer lui-même et l'interface préserve le
dernier administrateur actif.

## 3. Contrôles après déploiement

- Tester comme admin NALDEO : inviter un compte neuf de test dans NALDEO
  avec le rôle chargé d'affaires ; vérifier réception Outlook.
- Tester un compte existant Yvan dans NALDEO : la fonction doit ajouter
  le rattachement sans créer de second compte.
- Se reconnecter comme chargé d'affaires et créer une affaire en brouillon
  puis y enregistrer une emprise.
- Vérifier qu'un collaborateur standard ne voit pas le menu utilisateurs.
- Vérifier qu'un administrateur RHOTOR sans rôle NALDEO ne peut pas gérer NALDEO.
- Vérifier la désactivation puis la réactivation d'un compte de test.

Le déploiement GitHub Pages **ne déploie pas les fonctions Supabase**.
Il est nécessaire d'effectuer l'étape CLI ou tableau de bord ci-dessus.
