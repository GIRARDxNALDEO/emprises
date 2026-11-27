import {useCallback,useEffect,useState} from 'react'
import {Archive,ArrowRight,Download,FolderOpen,LogOut,MapPinned,Plus,Shield,Trash2} from 'lucide-react'
import {supabase,isConfigured} from './lib/supabase'
import {ZoneMap} from './components/ZoneMap'
import {exportGeojson,exportKml,type ZoneJson} from './lib/exports'
import {exportProjectedDxf} from './lib/dxfProjected'
import {printPrefecture} from './lib/prefecture'
import type {User} from '@supabase/supabase-js'
type Organization={id:string,name:string}
type Affaire={id:string,reference:string,title:string,commune:string,client:string,status:string,organization_id:string}
export default function App(){
 const [user,setUser]=useState<User|null>(null)
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [newPassword,setNewPassword]=useState('')
 const [confirmPassword,setConfirmPassword]=useState('')
 const [settingPassword,setSettingPassword]=useState(()=>/type=(invite|recovery)/.test(window.location.hash+window.location.search))
 const [message,setMessage]=useState('')
 const [orgs,setOrgs]=useState<Organization[]>([])
 const [org,setOrg]=useState('')
 const [isAdmin,setIsAdmin]=useState(false)
 const [affaires,setAffaires]=useState<Affaire[]>([])
 const [selected,setSelected]=useState<Affaire|null>(null)
 const [zones,setZones]=useState<ZoneJson[]>([])
 const [reference,setReference]=useState('')
 const [title,setTitle]=useState('')
 const [client,setClient]=useState('')
 const [commune,setCommune]=useState('')
 const [view,setView]=useState<'active'|'archive'|'trash'>('active')
 const [flightStart,setFlightStart]=useState('')
 const [flightEnd,setFlightEnd]=useState('')
 const [drone,setDrone]=useState('')
 const [notes,setNotes]=useState('')
 const aircraft={
  'RHOTOR SOLUTIONS':[
   {uas:'UAS-FR-372350',model:'DJI Avata'},
   {uas:'UAS-FR-307814',model:'DJI Matrice 300 RTK'},
   {uas:'UAS-FR-302496',model:'DJI Mavic 2 Pro'},
   {uas:'UAS-FR-477723',model:'DJI Mavic 3 Pro'},
   {uas:'UAS-FR-355706',model:'DJI Mavic 3E'},
   {uas:'UAS-FR-377968',model:'flying eye Mavic 3 Pro Flysafe'}
  ],
  'NALDEO':[
   {uas:'UAS-FR-307814',model:'DJI Matrice 300 RTK'},
   {uas:'UAS-FR-477723',model:'DJI Mavic 3 Pro'},
   {uas:'UAS-FR-399722',model:'DJI Mavic 3T'},
   {uas:'UAS-FR-305622',model:'DJI Phantom 4 RTK'},
   {uas:'UAS-FR-377968',model:'flying eye Mavic 3 Pro Flysafe'}
  ],
  'Neutre':[]
 } as const
 const aircraftList=aircraft[template as keyof typeof aircraft]??aircraft['RHOTOR SOLUTIONS']
 const selectedAircraft=aircraftList.find(x=>x.uas===drone)
 const operatorEmail=template==='NALDEO'?'baptiste.girard@naldeo.com':'rhotor.survey@gmail.com'
 const [estimate,setEstimate]=useState<{total_ht:number,gcp_count:number,surface_ha:number}|null>(null)
 const [currentMission,setCurrentMission]=useState<string>('')
 const [pricing,setPricing]=useState({gcp:'4',minimum:'4',lidar:'0',photo:'0',gcpprice:'0',mob:'0',setup:'0',processing:'0'})
 const [template,setTemplate]=useState('RHOTOR SOLUTIONS')
 const [tab,setTab]=useState<'map'|'pricing'|'admin'>('map')
 useEffect(()=>{
  if(!supabase)return
  supabase.auth.getUser().then(({data})=>setUser(data.user))
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{setUser(session?.user??null);if(event==='PASSWORD_RECOVERY')setSettingPassword(true)})
  return()=>subscription.unsubscribe()
 },[])
 const loadOrgs=useCallback(async()=>{
  if(!supabase||!user)return
  const {data,error}=await supabase.from('organizations').select('id,name').order('name')
  if(error){setMessage(error.message);return}
  setOrgs(data??[])
  setOrg(current=>current||(data?.[0]?.id??''))
 },[user])
 const loadAffaires=useCallback(async()=>{
  if(!supabase||!org)return
  const {data,error}=await supabase.from('affaires').select('id,reference,title,commune,client,status,organization_id').eq('organization_id',org).order('created_at',{ascending:false})
  if(error){setMessage(error.message);return}
  setAffaires(data??[])
 },[org])
 const loadZones=useCallback(async()=>{
  if(!supabase||!selected)return
  const {data,error}=await supabase.rpc('get_affaire_zones_geojson',{p_affaire:selected.id})
  if(error){setMessage(error.message);return}
  setZones((data??[]) as ZoneJson[])
 },[selected])
 useEffect(()=>{void loadOrgs()},[loadOrgs])
 useEffect(()=>{void loadAffaires();setSelected(null)},[loadAffaires])
 useEffect(()=>{void loadZones();setCurrentMission('');setEstimate(null);setTab('map')},[loadZones])
 useEffect(()=>{if(!supabase||!org)return;supabase.from('pricing_rules').select('*').eq('organization_id',org).eq('active',true).maybeSingle().then(({data})=>{if(data)setPricing({gcp:String(data.gcp_per_ha),minimum:String(data.min_gcp_per_mission),lidar:String(data.lidar_eur_ha),photo:String(data.photogrammetrie_eur_ha),gcpprice:String(data.gcp_eur_unit),mob:String(data.amene_repli_eur),setup:String(data.setup_eur),processing:String(data.processing_eur_ha)})})},[org])
 useEffect(()=>{
  if(!supabase||!org||!user)return
  supabase.from('memberships').select('role').eq('organization_id',org).eq('user_id',user.id).eq('active',true)
  .then(({data})=>setIsAdmin(Boolean(data?.some(r=>r.role==='admin'))))
 },[org,user])
 async function savePrices(){
  if(!supabase||!org||!isAdmin)return
  const p=pricing
  const {error}=await supabase.rpc('admin_publish_pricing',{p_org:org,p_gcp_per_ha:Number(p.gcp),p_min_gcp:Number(p.minimum),p_lidar:Number(p.lidar),p_photo:Number(p.photo),p_gcp_unit:Number(p.gcpprice),p_mobilisation:Number(p.mob),p_setup:Number(p.setup),p_processing:Number(p.processing)})
  setMessage(error?.message??'Nouvelle version du barème publiée')
 }
 async function calculateEstimate(){
  if(!supabase||!selected)return
  try{
   let missionId=currentMission
   if(!missionId){const {data,error}=await supabase.rpc('create_affaire_mission',{p_affaire:selected.id,p_title:'Estimation — '+selected.reference});if(error)throw error;missionId=data;setCurrentMission(missionId)}
   const {data:id,error}=await supabase.rpc('create_mission_estimate',{p_mission:missionId});if(error)throw error
   const {data:details,error:readError}=await supabase.from('estimates').select('total_ht,gcp_count,surface_ha').eq('id',id).single();if(readError)throw readError
   setEstimate(details);setMessage('Estimation enregistrée et figée en base')
  }catch(e){setMessage(e instanceof Error?e.message:'Erreur de calcul')}
 }
 async function deleteZone(id:string){if(!supabase||!confirm('Supprimer cette zone ?'))return;const {error}=await supabase.rpc('delete_affaire_zone',{p_zone:id});setMessage(error?.message??'Zone supprimée');if(!error)await loadZones()}
 async function login(e:React.FormEvent){e.preventDefault();if(!supabase)return;const {error}=await supabase.auth.signInWithPassword({email,password});setMessage(error?.message??'Connexion réussie')}
 async function resetPassword(){if(!supabase)return;if(!email.trim()){setMessage('Renseigne ton adresse e-mail avant de demander un lien.');return}const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+import.meta.env.BASE_URL});setMessage(error?.message??'Si un compte existe pour cette adresse, un courriel de réinitialisation sera envoyé.')}
 async function setAccountPassword(e:React.FormEvent){e.preventDefault();if(!supabase)return;if(newPassword.length<12){setMessage('Utilise un mot de passe d’au moins 12 caractères.');return}if(newPassword!==confirmPassword){setMessage('Les deux mots de passe sont différents.');return}const {error}=await supabase.auth.updateUser({password:newPassword});if(error){setMessage(error.message);return}setNewPassword('');setConfirmPassword('');setSettingPassword(false);setMessage('Mot de passe défini. Ton compte est prêt.')}
 async function createAffaire(e:React.FormEvent){
  e.preventDefault();if(!supabase||!user||!org)return
  const {error}=await supabase.from('affaires').insert({organization_id:org,reference,title,client,commune,owner_id:user.id})
  if(error){setMessage(error.message);return}
  setReference('');setTitle('');setClient('');setCommune('');setMessage('Affaire créée');await loadAffaires()
 }
 async function changeStatus(status:'archivee'|'supprimee'|'brouillon'){
  if(!supabase||!selected)return
  if(status==='supprimee'&&!confirm('Déplacer cette affaire dans la corbeille ?'))return
  const {error}=await supabase.rpc('admin_set_affaire_status',{p_affaire:selected.id,p_status:status})
  if(error){setMessage(error.message);return}
  setSelected(null);await loadAffaires()
 }
 if(!isConfigured)return <div className="auth-page"><div className="auth-box"><h1>EMPRISES</h1><p>Configuration Supabase absente.</p><code>Copie .env.example dans .env puis renseigne VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY</code></div></div>
 if(settingPassword)return <div className="auth-page"><form onSubmit={setAccountPassword} className="auth-box"><img src={`${import.meta.env.BASE_URL}rhotor-logo.png`} alt="Logo RHOTOR"/><span className="eyebrow">RHOTOR SOLUTIONS</span><h1>EMPRISES</h1><p>Définir mon mot de passe</p><label>Nouveau mot de passe (12 caractères minimum)<input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label>Confirmer le mot de passe<input type="password" autoComplete="new-password" required minLength={12} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label><button type="submit">Enregistrer le mot de passe <ArrowRight size={16}/></button>{message&&<p className="hint">{message}</p>}</form></div>
 if(!user)return <div className="auth-page"><form onSubmit={login} className="auth-box"><img src={`${import.meta.env.BASE_URL}rhotor-logo.png`} alt="Logo RHOTOR"/><span className="eyebrow">RHOTOR SOLUTIONS</span><h1>EMPRISES</h1><p>Connexion à votre espace missions drone</p><label>Email professionnel<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Mot de passe<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button>Se connecter <ArrowRight size={16}/></button><button type="button" className="ghost" onClick={resetPassword}>Mot de passe oublié ?</button>{message&&<p className="hint">{message}</p>}<p className="hint">Accès réservé aux utilisateurs invités.</p></form></div>
 return <div className="app-shell">
  <aside className="sidebar"><div className="brand"><img src={`${import.meta.env.BASE_URL}rhotor-logo.png`} alt="RHOTOR"/><div><strong>EMPRISES</strong><small>by RHOTOR SOLUTIONS</small></div></div>
   <nav><button onClick={()=>setSelected(null)}><FolderOpen size={18}/> Mes affaires</button><button onClick={()=>{setSelected(null);setView('archive')}}><Archive size={18}/> Archives</button>{isAdmin&&<button onClick={()=>{setSelected(null);setView('trash')}}><Trash2 size={18}/> Corbeille</button>}</nav>
   <div className="sidebar-bottom"><span>{user.email}</span><button onClick={()=>supabase?.auth.signOut()}><LogOut size={16}/> Déconnexion</button></div>
  </aside>
  <main className="content"><header className="top"><div><span className="eyebrow">GESTION DES MISSIONS DRONE</span><h1>{selected?selected.reference+' · '+selected.title:'Mes affaires'}</h1></div><select value={org} onChange={e=>setOrg(e.target.value)} aria-label="Organisation">{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></header>
   {message&&<p className="notice" role="status">{message}<button onClick={()=>setMessage('')}>×</button></p>}
   {!selected?<div className="cols"><section className="panel"><div className="panel-head"><h3>{view==='archive'?'Archives':view==='trash'?'Corbeille':'Affaires actives'}</h3><span className="hint">{affaires.filter(a=>view==='archive'?a.status==='archivee':view==='trash'?a.status==='supprimee':a.status!=='archivee'&&a.status!=='supprimee').length} dossier(s)</span></div>
    {affaires.filter(a=>view==='archive'?a.status==='archivee':view==='trash'?a.status==='supprimee':a.status!=='archivee'&&a.status!=='supprimee').map(a=><button className="affaire-row" key={a.id} onClick={()=>setSelected(a)}><MapPinned size={20}/><span><strong>{a.reference} · {a.title}</strong><small>{a.commune||'Commune non renseignée'} · {a.status}</small></span><ArrowRight size={17}/></button>)}
    {!affaires.length&&<p className="hint">Aucune affaire accessible. Vérifie tes autorisations Supabase.</p>}
    </section><section className="panel"><div className="panel-head"><h3><Plus size={18}/> Nouvelle affaire</h3></div><form onSubmit={createAffaire} className="new-form"><label>Référence<input required value={reference} onChange={e=>setReference(e.target.value)} placeholder="A26045"/></label><label>Intitulé<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Relevé topographique"/></label><label>Client<input value={client} onChange={e=>setClient(e.target.value)}/></label><label>Commune<input value={commune} onChange={e=>setCommune(e.target.value)}/></label><button>Créer l'affaire <Plus size={16}/></button></form></section></div>
    : <div className="detail"><div className="detail-top"><button className="ghost" onClick={()=>setSelected(null)}>← Retour</button><span className="status">{selected.status}</span>{isAdmin&&<div className="admin-actions"><Shield size={16}/>{selected.status==='archivee'||selected.status==='supprimee'?<button onClick={()=>changeStatus('brouillon')}>Restaurer</button>:<button onClick={()=>changeStatus('archivee')}><Archive size={15}/> Archiver</button>}{selected.status!=='supprimee'&&<button className="danger" onClick={()=>changeStatus('supprimee')}><Trash2 size={15}/> Corbeille</button>}</div>}</div>
      <div className="buttons"><button className={tab==='map'?'':'ghost'} onClick={()=>setTab('map')}>Carte et emprises</button><button className={tab==='pricing'?'':'ghost'} onClick={()=>setTab('pricing')}>Chiffrage</button>{isAdmin&&<button className={tab==='admin'?'':'ghost'} onClick={()=>setTab('admin')}>Barèmes administrateur</button>}</div>
      {tab==='map'&&<ZoneMap affaireId={selected.id} zones={zones} onSaved={loadZones} canEdit={selected.status!=='archivee'&&selected.status!=='supprimee'}/>}
      <section className="panel"><div className="panel-head"><h3>Zones enregistrées</h3><span className="hint">{zones.length} zone(s)</span></div><div className="zone-list">{zones.map(z=><div key={z.id} className="zone"><span>{z.name} <small>· {z.type}</small></span><strong>{(z.surface_m2/10000).toLocaleString('fr-FR',{maximumFractionDigits:3})} ha</strong>{isAdmin&&selected.status!=='archivee'&&selected.status!=='supprimee'&&<button className="ghost" onClick={()=>deleteZone(z.id)}>Supprimer</button>}</div>)}</div><div className="buttons"><button onClick={()=>exportKml(zones)} disabled={!zones.length}><Download size={16}/> KML</button><button onClick={()=>exportGeojson(zones)} disabled={!zones.length}><Download size={16}/> GeoJSON</button><button onClick={()=>exportProjectedDxf(zones,'EPSG:2154')} disabled={!zones.length}><Download size={16}/> DXF Lambert-93</button><button onClick={()=>exportProjectedDxf(zones,'EPSG:3945')} disabled={!zones.length}><Download size={16}/> DXF CC45</button></div><div className="export-pref"><h3>Export cartographique Préfecture · plusieurs zones</h3><div className="new-form"><label>En-tête / organisation<select value={template} onChange={e=>{setTemplate(e.target.value);setDrone('')}}><option>RHOTOR SOLUTIONS</option><option>NALDEO</option><option>Neutre</option></select></label><label>Télépilote<input readOnly value="Baptiste GIRARD"/></label><label>Téléphone<input readOnly value="06.15.04.46.21"/></label><label>E-mail de contact<input readOnly value={operatorEmail}/></label><label>Début de la période<input type="datetime-local" value={flightStart} onChange={e=>setFlightStart(e.target.value)}/></label><label>Fin de la période<input type="datetime-local" min={flightStart||undefined} value={flightEnd} onChange={e=>setFlightEnd(e.target.value)}/></label><label>Drone / n° UAS<select value={drone} onChange={e=>setDrone(e.target.value)}><option value="">Sélectionner un aéronef</option>{aircraftList.map(x=><option key={x.uas} value={x.uas}>{x.model} — {x.uas}</option>)}</select></label><label>Observations<input value={notes} onChange={e=>setNotes(e.target.value)}/></label></div><div className="buttons"><button disabled={!zones.length} onClick={()=>printPrefecture(selected,zones,{name:template,pilot:'Baptiste GIRARD',phone:'06.15.04.46.21',email:operatorEmail,start:flightStart,end:flightEnd,drone:selectedAircraft?.model??'',registration:selectedAircraft?.uas??'',notes},'osm')}>PDF Préfecture (fond plan)</button><button disabled={!zones.length} onClick={()=>printPrefecture(selected,zones,{name:template,pilot:'Baptiste GIRARD',phone:'06.15.04.46.21',email:operatorEmail,start:flightStart,end:flightEnd,drone:selectedAircraft?.model??'',registration:selectedAircraft?.uas??'',notes},'ortho')}>PDF Préfecture (orthophoto)</button></div><p className="hint">Document cartographique imprimable : utilise « Enregistrer en PDF » dans la fenêtre d'impression. Vérifier l'affichage des fonds et les contraintes aériennes avant transmission.</p></div></section>
    {tab==='pricing'&&<section className="panel"><h3>Estimation automatique</h3><p>Les prix et la densité GCP sont imposés par l'administrateur. L'estimation est calculée et figée côté Supabase.</p><p>Surface géographique des zones : <strong>{(zones.reduce((s,z)=>s+z.surface_m2,0)/10000).toLocaleString('fr-FR',{maximumFractionDigits:3})} ha</strong> (somme indicative ; le moteur évite le double comptage des chevauchements d'un même mode d'acquisition).</p><button disabled={!zones.length||selected.status==='archivee'||selected.status==='supprimee'} onClick={calculateEstimate}>Créer le chiffrage</button>{estimate&&<div className="estimate-result"><strong>{Number(estimate.total_ht).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})} HT</strong><p>{estimate.surface_ha} ha · {estimate.gcp_count} points GCP · calcul enregistré</p></div>}</section>}
    {tab==='admin'&&isAdmin&&<section className="panel"><h3>Barème administrateur</h3><p>Chaque publication crée une nouvelle version. Les anciens chiffrages restent inchangés.</p><div className="new-form">{([{key:'gcp',label:'GCP par hectare'},{key:'minimum',label:'Minimum GCP par mission'},{key:'lidar',label:'LiDAR €/ha'},{key:'photo',label:'Photogrammétrie €/ha'},{key:'gcpprice',label:'Prix / GCP (€)'},{key:'mob',label:'Amené / repli (€)'},{key:'setup',label:'Mise en place (€)'},{key:'processing',label:'Traitement €/ha'}] as const).map(item=><label key={item.key}>{item.label}<input type="number" min="0" step={item.key==='minimum'?'1':'0.01'} value={pricing[item.key]} onChange={e=>setPricing(p=>({...p,[item.key]:e.target.value}))}/></label>)}</div><button onClick={savePrices}>Publier un nouveau barème</button></section>}
    </div>}
  </main>
 </div>
}
