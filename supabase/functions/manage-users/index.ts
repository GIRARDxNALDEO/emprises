// EMPRISES — administration des collaborateurs, côté serveur exclusivement.
// Déployer avec : supabase functions deploy manage-users
// L'API Auth Admin / clé de service ne doivent JAMAIS apparaître dans le code client.
import {createClient} from 'npm:@supabase/supabase-js@2'

type Role='admin'|'charge_affaires'|'telepilote'
type Membership={organization_id:string,user_id:string,role:Role,active:boolean}
const validRoles=new Set<Role>(['admin','charge_affaires','telepilote'])
const allowedOrigins=new Set(['https://girardxnaldeo.github.io','http://localhost:5173','http://127.0.0.1:5173'])
const maxPages=25
function cors(req:Request){
 const origin=req.headers.get('origin')??''
 return {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://girardxnaldeo.github.io',
         'Access-Control-Allow-Methods':'POST, OPTIONS',
         'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
         'Vary':'Origin','Content-Type':'application/json; charset=utf-8'}
}
function response(req:Request,payload:Record<string,unknown>,status=200){
 return new Response(JSON.stringify(payload),{status,headers:cors(req)})
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const mail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)})
 if(req.method!=='POST')return response(req,{error:'Méthode non autorisée.'},405)
 const url=Deno.env.get('SUPABASE_URL')
 const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 const publishable=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
 if(!url||!secret||!publishable)return response(req,{error:'Configuration serveur manquante : contacter l’administrateur Supabase.'},503)
 const authHeader=req.headers.get('Authorization')??''
 const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):''
 if(!token)return response(req,{error:'Session requise.'},401)
 const admin=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}})
 const caller=createClient(url,publishable,{auth:{autoRefreshToken:false,persistSession:false}})
 const {data:{user},error:authError}=await caller.auth.getUser(token)
 if(authError||!user)return response(req,{error:'Session expirée ou invalide.'},401)

 let input:Record<string,unknown>
 try{const json=await req.json();if(!json||typeof json!=='object'||Array.isArray(json))throw Error();input=json}
 catch{return response(req,{error:'Requête JSON invalide.'},400)}
 const action=input.action
 const orgId=typeof input.organization_id==='string'?input.organization_id:''
 if(!uuid.test(orgId))return response(req,{error:'Organisation invalide.'},400)

 // Check permissions server-side on each and every operation.
 const {data:adminRole,error:roleError}=await admin.from('memberships')
   .select('role').eq('user_id',user.id).eq('organization_id',orgId).eq('role','admin').eq('active',true).maybeSingle()
 if(roleError)return response(req,{error:'Impossible de vérifier les autorisations.'},503)
 if(!adminRole)return response(req,{error:'Accès réservé aux administrateurs de cette organisation.'},403)
 const {data:organization}=await admin.from('organizations').select('id,name').eq('id',orgId).maybeSingle()
 if(!organization)return response(req,{error:'Organisation inconnue.'},404)

 try{
  if(action==='list'){
   const {data:members,error}=await admin.from('memberships').select('organization_id,user_id,role,active')
     .eq('organization_id',orgId).order('created_at',{ascending:true})
   if(error)throw error
   const users=await allUsers(admin)
   const byId=new Map(users.map(u=>[u.id,u]))
   const people=(members as Membership[]??[]).map(m=>{
    const info=byId.get(m.user_id)
    return {user_id:m.user_id, email:info?.email??'Adresse indisponible',
            role:m.role,active:m.active,invited_at:info?.invited_at??null,
            confirmed_at:info?.email_confirmed_at??null,last_sign_in_at:info?.last_sign_in_at??null}
   })
   return response(req,{people,organization:organization.name})
  }

  if(action==='invite'){
   const email=String(input.email??'').trim().toLowerCase()
   const role=input.role as Role
   if(!mail.test(email)||email.length>254)return response(req,{error:'Adresse e-mail invalide.'},400)
   if(!validRoles.has(role))return response(req,{error:'Rôle invalide.'},400)
   const users=await allUsers(admin)
   let target=users.find(u=>u.email?.toLowerCase()===email)
   let invited=false
   if(!target){
    // The sender's SMTP must be configured for external emails to work.
    const invitation=await admin.auth.admin.inviteUserByEmail(email,{
      redirectTo:'https://girardxnaldeo.github.io/emprises/'
    })
    if(invitation.error)throw Error('Invitation non envoyée : '+invitation.error.message+' — Vérifier la configuration SMTP de Supabase.')
    target=invitation.data.user??undefined
    invited=true
   }
   if(!target?.id)throw Error('Création du compte non confirmée par Supabase.')
   // Keep unrelated organizations untouched. In this organization a person has one role.
   const {error:upsertError}=await admin.from('memberships').upsert(
    {organization_id:orgId,user_id:target.id,role,active:true},
    {onConflict:'organization_id,user_id,role'}
   )
   if(upsertError)throw Error('Compte créé, mais attribution des droits impossible : '+upsertError.message)
   // Do not overwrite existing admin membership or other roles by surprise.
   return response(req,{ok:true,invited,email,
     message:invited?'Invitation demandée à Supabase et accès attribué. La réception de l’e-mail dépend du SMTP.':'Compte existant : accès à '+organization.name+' attribué sans envoyer de nouvelle invitation.'})
  }

  if(action==='set_role'||action==='set_active'){
   const targetId=String(input.user_id??'')
   if(!uuid.test(targetId))return response(req,{error:'Utilisateur invalide.'},400)
   if(targetId===user.id)return response(req,{error:'Pour éviter de perdre vos droits, vous ne pouvez pas modifier votre propre accès ici.'},403)
   const {data:rows,error:membershipError}=await admin.from('memberships').select('organization_id,user_id,role,active')
     .eq('organization_id',orgId).eq('user_id',targetId)
   if(membershipError)throw membershipError
   if(!rows?.length)return response(req,{error:'Utilisateur non rattaché à cette organisation.'},404)
   const current=rows as Membership[]
   const removingActiveAdmin=current.some(m=>m.role==='admin'&&m.active)&&(
     (action==='set_active'&&input.active===false)||
     (action==='set_role'&&input.role!=='admin')
   )
   if(removingActiveAdmin){
    const {count,error:countError}=await admin.from('memberships').select('user_id',{count:'exact',head:true})
      .eq('organization_id',orgId).eq('role','admin').eq('active',true)
    if(countError)throw countError
    if((count??0)<=1)return response(req,{error:'Impossible de désactiver ou rétrograder le dernier administrateur.'},409)
   }

   if(action==='set_active'){
    if(typeof input.active!=='boolean')return response(req,{error:'Statut invalide.'},400)
    const {error}=await admin.from('memberships').update({active:input.active})
      .eq('organization_id',orgId).eq('user_id',targetId)
    if(error)throw error
    return response(req,{ok:true,message:input.active?'Accès réactivé.':'Accès désactivé pour cette organisation.'})
   }

   const nextRole=input.role as Role
   if(!validRoles.has(nextRole))return response(req,{error:'Rôle invalide.'},400)
   // Write the desired role first, then remove old roles; recoverable on network error.
   const {error:insertError}=await admin.from('memberships').upsert(
      {organization_id:orgId,user_id:targetId,role:nextRole,active:current.some(m=>m.active)},
      {onConflict:'organization_id,user_id,role'})
   if(insertError)throw insertError
   const {error:deleteError}=await admin.from('memberships').delete()
      .eq('organization_id',orgId).eq('user_id',targetId).neq('role',nextRole)
   if(deleteError)throw deleteError
   return response(req,{ok:true,message:'Rôle mis à jour pour '+organization.name+'.'})
  }
  return response(req,{error:'Action inconnue.'},400)
 }catch(error){
  const detail=error instanceof Error?error.message:'Erreur de gestion des utilisateurs.'
  // Avoid returning tokens/secrets or internal server diagnostics.
  return response(req,{error:detail.slice(0,500)},500)
 }
})

async function allUsers(admin:ReturnType<typeof createClient>){
 const list: Array<{id:string,email?:string,invited_at?:string|null,email_confirmed_at?:string|null,last_sign_in_at?:string|null}>=[]
 for(let page=1;page<=maxPages;page++){
  const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000})
  if(error)throw error
  list.push(...data.users)
  if(data.users.length<1000)return list
 }
 throw Error('Annuaire trop volumineux : filtrage serveur à prévoir avant de continuer.')
}
