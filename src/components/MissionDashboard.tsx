import {useCallback,useEffect,useMemo,useState} from 'react'
import {ArrowRight,CalendarClock,CheckCircle2,CloudSun,FolderOpen,MapPin,RefreshCw,ShieldAlert,Target,Wind} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {MissionWeather} from './MissionWeather'
import type {ZoneJson} from '../lib/exports'

export type DashboardAffaire={
 id:string,organization_id:string,reference:string,title:string,client:string,
 commune:string,status:string,selected_aircraft_id?:string|null,planned_altitude_m?:number|null,
 feasibility?:string,feasibility_notes?:string
}
type MissionSchedule={affaire_id:string,planned_date:string,status:string}
type Upcoming={affaire:DashboardAffaire,plannedDate:string|null,missionStatus:string|null}
type Props={orgs:{id:string,name:string}[],adminOrgIds:string[],onOpen:(affaire:DashboardAffaire)=>void,onRequests:()=>void,onAffaires:()=>void}
const dateFmt=(date:string)=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Paris'}).format(new Date(date+'T12:00:00+01:00'))
const niceOrg=(s:string)=>s.replace(/^RHOTOR SOLUTIONS$/i,'RHOTOR')
const statusLabel=(status:string)=>({
 brouillon:'Brouillon',a_chiffrer:'En attente de validation',a_preparer:'À préparer',
 en_cours:'En cours',realisee:'Réalisée'
} as Record<string,string>)[status]??status

export function MissionDashboard({orgs,adminOrgIds,onOpen,onRequests,onAffaires}:Props){
 const [affaires,setAffaires]=useState<DashboardAffaire[]>([])
 const [schedule,setSchedule]=useState<MissionSchedule[]>([])
 const [focusZones,setFocusZones]=useState<ZoneJson[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [refresh,setRefresh]=useState(0)
 const load=useCallback(async()=>{
  if(!supabase)return
  setLoading(true);setError('')
  const [aff,mis]=await Promise.all([
   supabase.from('affaires').select('id,organization_id,reference,title,client,commune,status,selected_aircraft_id')
    .not('status','in','(archivee,supprimee)').order('created_at',{ascending:false}).limit(500),
   supabase.from('missions').select('affaire_id,planned_date,status').not('planned_date','is',null).order('planned_date',{ascending:true}).limit(500)
  ])
  if(aff.error){setError(aff.error.message);setLoading(false);return}
  // Missions are only linked to affaires visible to the signed-in user (RLS).
  setAffaires((aff.data??[]) as DashboardAffaire[])
  if(mis.error){setSchedule([]);setError('Dates de mission indisponibles : '+mis.error.message)}
  else setSchedule((mis.data??[]) as MissionSchedule[])
  setLoading(false)
 },[])
 useEffect(()=>{void load()},[load,refresh])
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const scheduleByAffaire=useMemo(()=>{
  const map=new Map<string,MissionSchedule>()
  for(const m of schedule)if(m.planned_date>=today&&m.status!=='cloturee'&&m.status!=='realisee'&&!map.has(m.affaire_id))map.set(m.affaire_id,m)
  return map
 },[schedule,today])
 const upcoming:Upcoming[]=useMemo(()=>{
  const entries=affaires.filter(a=>a.status!=='realisee')
   .map(a=>({affaire:a,plannedDate:scheduleByAffaire.get(a.id)?.planned_date??null,missionStatus:scheduleByAffaire.get(a.id)?.status??null}))
  entries.sort((a,b)=>{
   if(a.plannedDate&&!b.plannedDate)return -1
   if(!a.plannedDate&&b.plannedDate)return 1
   if(a.plannedDate&&b.plannedDate)return a.plannedDate.localeCompare(b.plannedDate)
   const priority=(s:string)=>s==='en_cours'?0:s==='a_preparer'?1:s==='a_chiffrer'?2:3
   return priority(a.affaire.status)-priority(b.affaire.status)
  })
  return entries.slice(0,6)
 },[affaires,scheduleByAffaire])
 const nextPlanned=upcoming.find(x=>x.plannedDate)
 const focus=nextPlanned?.affaire??upcoming.find(x=>x.affaire.status!=='brouillon')?.affaire??upcoming[0]?.affaire??null
 useEffect(()=>{
  let ignore=false;setFocusZones([])
  if(!focus||!supabase)return
  supabase.rpc('get_affaire_zones_geojson',{p_affaire:focus.id}).then(({data,error})=>{
   if(!ignore)setFocusZones(!error&&Array.isArray(data)?data as ZoneJson[]:[])
  })
  return()=>{ignore=true}
 },[focus?.id])
 const pending=affaires.filter(a=>a.status==='a_chiffrer'&&adminOrgIds.includes(a.organization_id)).length
 const inPrep=affaires.filter(a=>a.status==='a_preparer'||a.status==='en_cours').length
 const programmed=affaires.filter(a=>scheduleByAffaire.has(a.id)).length
 const formatOrg=(id:string)=>niceOrg(orgs.find(o=>o.id===id)?.name??'Organisation')
 return <div className="hud-dashboard">
  <section className="hud-intro">
   <div><span className="hud-overline"><Target size={15}/> CENTRE DE CONTRÔLE · EMPRISES</span><h2>Tableau de bord</h2><p>Vue opérationnelle de vos missions accessibles, tous espaces confondus.</p></div>
   <button className="hud-refresh" onClick={()=>setRefresh(n=>n+1)} disabled={loading}><RefreshCw size={16}/> Actualiser</button>
  </section>
  <div className="hud-stats">
   <button onClick={onAffaires} className="hud-stat"><span><FolderOpen size={17}/> Affaires actives</span><strong>{loading?'—':affaires.length}</strong><small>Accéder aux dossiers <ArrowRight size={13}/></small></button>
   <button onClick={onAffaires} className="hud-stat"><span><CalendarClock size={17}/> Missions planifiées</span><strong>{loading?'—':programmed}</strong><small>Avec une date future renseignée</small></button>
   <button onClick={onAffaires} className="hud-stat"><span><CheckCircle2 size={17}/> En préparation</span><strong>{loading?'—':inPrep}</strong><small>Validées ou en cours</small></button>
   {adminOrgIds.length>0&&<button onClick={onRequests} className={'hud-stat '+(pending?'hud-stat-alert':'')}><span><ShieldAlert size={17}/> À examiner</span><strong>{loading?'—':pending}</strong><small>Validation administrateur <ArrowRight size={13}/></small></button>}
  </div>
  {error&&<p className="hud-error" role="status">{error}</p>}
  <div className="hud-main-grid">
   <section className="panel hud-missions">
    <div className="panel-head"><div><span className="hud-section-tag"><CalendarClock size={14}/> PLANIFICATION</span><h3>Prochaines missions</h3></div><span className="hud-section-count">{upcoming.length} affichée(s)</span></div>
    {loading?<p className="hint">Chargement des missions…</p>:upcoming.length===0?<div className="hud-no-missions"><FolderOpen size={25}/><p>Aucune mission active accessible.</p><button onClick={onAffaires}>Consulter mes affaires</button></div>
    :<div className="hud-mission-list">{upcoming.map(m=><button key={m.affaire.id} className="hud-mission" onClick={()=>onOpen(m.affaire)}>
      <div className={'hud-mission-date '+(!m.plannedDate?'undated':'')}>{m.plannedDate?<><strong>{m.plannedDate.slice(8,10)}</strong><small>{new Intl.DateTimeFormat('fr-FR',{month:'short'}).format(new Date(m.plannedDate+'T12:00:00'))}</small></>:<><CalendarClock size={19}/><small>À dater</small></>}</div>
      <div className="hud-mission-description"><span className="hud-mission-ref">{formatOrg(m.affaire.organization_id)} · {m.affaire.reference}</span><strong>{m.affaire.title}</strong><small><MapPin size={12}/>{m.affaire.commune||'Commune non renseignée'} <span className="hud-mid-dot">·</span> {statusLabel(m.affaire.status)}</small></div>
      <ArrowRight size={17} className="hud-mission-arrow"/>
    </button>)}</div>}
    {upcoming.length>0&&<p className="hud-caption"><CalendarClock size={13}/> Les dates proviennent des missions planifiées en base. Les dossiers non datés sont signalés « À dater ».</p>}
   </section>
   <section className="panel hud-next">
    <div className="panel-head"><div><span className="hud-section-tag"><Target size={14}/> FOCUS MISSION</span><h3>{focus?'Prochaine intervention':'Préparation de vol'}</h3></div></div>
    {focus?<><div className="hud-next-meta"><span>{formatOrg(focus.organization_id)}</span><span className="hud-next-status">{statusLabel(focus.status)}</span></div><h4>{focus.reference} · {focus.title}</h4><p><MapPin size={15}/>{focus.commune||'Commune non renseignée'}</p><div className="hud-next-detail"><span>Intervention</span><strong>{nextPlanned&&nextPlanned.affaire.id===focus.id?dateFmt(nextPlanned.plannedDate!):'Date à programmer'}</strong></div><button className="hud-next-open" onClick={()=>onOpen(focus)}>Ouvrir le dossier <ArrowRight size={16}/></button></>:<><p className="hint">Tes prochaines missions apparaîtront ici après leur création.</p><button onClick={onAffaires}>Mes affaires <ArrowRight size={15}/></button></>}
   </section>
  </div>
  <div className="hud-weather-head"><div><span className="hud-section-tag"><Wind size={14}/> BRIEFING MÉTÉOROLOGIQUE</span><h3><CloudSun size={19}/> Météo du prochain site</h3></div>{focus&&<span className="hud-section-count">{focus.reference} · {focus.commune||'Zone de vol'}</span>}</div>
  <MissionWeather zones={focusZones} commune={focus?.commune??''}/>
  <p className="hud-caption">Les prévisions météo sont limitées aux cinq prochains jours : une mission programmée plus tard ne peut pas encore bénéficier d'une prévision spécifique. Aucune condition de vol n'est automatiquement déclarée « sûre ».</p>
 </div>
}
