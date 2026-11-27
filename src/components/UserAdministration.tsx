import {useCallback,useEffect,useState} from 'react'
import {AlertCircle,CheckCircle2,MailPlus,RefreshCw,Shield,UserRoundCheck,UserRoundX,Users} from 'lucide-react'
import {supabase} from '../lib/supabase'
type Organization={id:string,name:string}
type Role='admin'|'charge_affaires'|'telepilote'
type Person={user_id:string,email:string,role:Role,active:boolean,invited_at:string|null,confirmed_at:string|null,last_sign_in_at:string|null}
type Result={ok?:boolean,error?:string,message?:string,invited?:boolean,people?:Person[],organization?:string}
const roles:{value:Role,label:string}[]=[
 {value:'charge_affaires',label:"Chargé d'affaires"},
 {value:'telepilote',label:'Télépilote'},
 {value:'admin',label:'Administrateur'}
]
const date=(value:string|null)=>value?new Date(value).toLocaleDateString('fr-FR'):'—'
function messageOf(error:unknown){
 return error instanceof Error?error.message:'Une erreur est survenue.'
}
export function UserAdministration({organizations,adminOrgIds,currentUserId}:{organizations:Organization[],adminOrgIds:string[],currentUserId:string}){
 const adminOrganizations=organizations.filter(o=>adminOrgIds.includes(o.id))
 const [organization,setOrganization]=useState('')
 const [email,setEmail]=useState('')
 const [role,setRole]=useState<Role>('charge_affaires')
 const [people,setPeople]=useState<Person[]>([])
 const [loading,setLoading]=useState(false)
 const [submitting,setSubmitting]=useState(false)
 const [editingId,setEditingId]=useState<string|null>(null)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [initialized,setInitialized]=useState(false)
 useEffect(()=>{setOrganization(previous=>adminOrgIds.includes(previous)?previous:(adminOrgIds[0]??''))},[adminOrgIds.join('|')])
 const invoke=useCallback(async(payload:Record<string,unknown>):Promise<Result>=>{
  if(!supabase)throw new Error('Connexion Supabase absente.')
  const {data,error:callError}=await supabase.functions.invoke('manage-users',{body:payload})
  if(callError){
   // Error details, including authorization failures, are returned by the Edge Function.
   let detail=''
   if('context' in callError&&callError.context instanceof Response){
    const parsed=await callError.context.clone().json().catch(()=>null) as Result|null
    detail=parsed?.error??''
   }
   throw new Error(detail||'Service utilisateurs indisponible. Vérifier le déploiement de la fonction Supabase « manage-users ».')
  }
  const result=(data??{}) as Result
  if(result.error)throw new Error(result.error)
  return result
 },[])
 const reload=useCallback(async()=>{
  if(!organization)return
  setLoading(true);setError('')
  try{
   const result=await invoke({action:'list',organization_id:organization})
   setPeople(result.people??[]);setInitialized(true)
  }catch(e){setPeople([]);setError(messageOf(e))}
  finally{setLoading(false)}
 },[organization,invoke])
 useEffect(()=>{void reload()},[reload])
 async function invite(e:React.FormEvent){
  e.preventDefault()
  if(!organization||!email.trim())return
  setSubmitting(true);setError('');setNotice('')
  try{
   const result=await invoke({action:'invite',organization_id:organization,email:email.trim(),role})
   setNotice(result.message??'Accès enregistré.')
   setEmail('');await reload()
  }catch(e){setError(messageOf(e))}
  finally{setSubmitting(false)}
 }
 async function change(person:Person,operation:'set_role'|'set_active',value:Role|boolean){
  if(person.user_id===currentUserId)return
  const isDisable=operation==='set_active'&&value===false
  const isAdminRole=operation==='set_role'&&value==='admin'
  if((isDisable||isAdminRole)&&!window.confirm(isDisable?`Désactiver l'accès de ${person.email} à cette organisation ?`:`Donner le rôle Administrateur à ${person.email} ?`))return
  setEditingId(person.user_id);setError('');setNotice('')
  try{
   const data=await invoke({action:operation,organization_id:organization,user_id:person.user_id,...(operation==='set_role'?{role:value}:{active:value})})
   setNotice(data.message??'Modification enregistrée.')
   await reload()
  }catch(e){setError(messageOf(e))}
  finally{setEditingId(null)}
 }
 return <section className="panel users-panel">
  <div className="panel-head"><div><h3><Users size={19}/> Administration des utilisateurs</h3><p className="hint">Invitations et autorisations par organisation. Les rôles sont contrôlés côté serveur dans Supabase.</p></div><button type="button" className="ghost" onClick={()=>void reload()} disabled={loading||submitting}><RefreshCw size={16}/> Actualiser</button></div>
  <div className="users-toolbar"><label>Organisation administrée<select value={organization} onChange={e=>{setOrganization(e.target.value);setNotice('');setInitialized(false)}}>{adminOrganizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><p className="hint">Les utilisateurs RHOTOR et NALDEO sont gérés séparément. Seuls les administrateurs autorisés peuvent agir.</p></div>
  <div className="users-layout"><form className="users-form" onSubmit={e=>void invite(e)}>
    <h4><MailPlus size={17}/> Ajouter un utilisateur</h4>
    <p className="hint">Un compte existant reçoit ses droits immédiatement. Un nouveau compte reçoit une invitation par e-mail.</p>
    <label>Adresse e-mail professionnelle<input type="email" required maxLength={254} autoComplete="off" placeholder="prenom.nom@naldeo.com" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Rôle attribué<select value={role} onChange={e=>setRole(e.target.value as Role)}>{roles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
    <button disabled={submitting||!organization} type="submit"><MailPlus size={16}/>{submitting?'Traitement en cours…':'Inviter / attribuer les droits'}</button>
    <p className="hint">Le rôle « Chargé d'affaires » autorise la création d'affaires et de leurs emprises. Les invitations nécessitent un service SMTP opérationnel.</p>
   </form>
   <div className="users-directory"><div className="users-directory-head"><h4><UserRoundCheck size={17}/> Collaborateurs et accès</h4><span>{people.length} autorisation(s)</span></div>
    {loading?<p className="hint">Chargement des collaborateurs…</p>:people.length===0?<p className="hint">{initialized?'Aucun utilisateur rattaché à cette organisation.':'Annuaire non chargé.'}</p>:<div className="users-rows">
    {people.map(person=><div className="users-row" key={person.user_id+':'+person.role}>
     <div className="users-person"><strong>{person.email}</strong><small>{person.confirmed_at?'Compte confirmé':person.invited_at?'Invitation en attente / non confirmée':'Activation à vérifier'} · Dernière connexion : {date(person.last_sign_in_at)}</small><span className={person.active?'users-active':'users-inactive'}>{person.active?'Accès actif':'Accès désactivé'}</span></div>
     <div className="users-controls"><label>Rôle<select aria-label={`Rôle de ${person.email}`} disabled={person.user_id===currentUserId||Boolean(editingId)||!person.active} value={person.role} onChange={e=>void change(person,'set_role',e.target.value as Role)}>{roles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
     <button type="button" className={person.active?'danger':'ghost'} disabled={person.user_id===currentUserId||Boolean(editingId)} onClick={()=>void change(person,'set_active',!person.active)} title={person.user_id===currentUserId?'Impossible de modifier son propre accès':''}>{person.active?<UserRoundX size={14}/>:<UserRoundCheck size={14}/>} {person.active?'Désactiver':'Réactiver'}</button></div>
    </div>)}</div>}
   </div></div>
   {notice&&<p role="status" className="users-success"><CheckCircle2 size={17}/>{notice}</p>}
   {error&&<p role="alert" className="users-error"><AlertCircle size={17}/>{error}</p>}
   <p className="hint users-footnote"><Shield size={13}/> La clé administrateur Supabase reste côté serveur. Chaque action vérifie le rôle de l'administrateur pour l'organisation concernée. Si un collègue ne reçoit pas l'e-mail, vérifier le SMTP et les journaux Auth Supabase.</p>
 </section>
}
