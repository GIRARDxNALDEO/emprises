import {useCallback,useEffect,useMemo,useState} from 'react'
import {Calculator,CarFront,Download,FileText,MapPin,RefreshCw,Route,Upload} from 'lucide-react'
import {supabase} from '../lib/supabase'
import type {ZoneJson} from '../lib/exports'
type Company='RHOTOR'|'NALDEO'
type Affaire={id:string,reference:string,title:string,client:string,commune:string,organization_id:string}
type QuoteLine={id:string,label:string,quantity:number,unit:string,unit_price:number,total_ht:number}
type Estimate={id:string,total_ht:number,surface_ha:number,gcp_count:number,created_at:string}
type Point=[number,number]
const addresses:Record<Company,string>={
 RHOTOR:'1750 route du Bosc, 07140 Les Assions',
 NALDEO:'663 chemin du Travers, 07200 Lachapelle-sous-Aubenas'
}
const formatEur=(n:number)=>n.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c))
const formatDate=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('fr-FR')
const cents=(n:number)=>Math.round((n+Number.EPSILON)*100)/100
const isPoint=(a:unknown):a is number[]=>Array.isArray(a)&&a.length>=2&&typeof a[0]==='number'&&typeof a[1]==='number'&&Number.isFinite(a[0])&&Number.isFinite(a[1])
function centerOfZones(zones:ZoneJson[]):Point|null{
 const points:number[][]=[]
 for(const zone of zones){
  const g=zone.geometry
  if(g.type!=='Polygon'&&g.type!=='MultiPolygon')continue
  const polygons=(g.type==='Polygon'?[g.coordinates]:g.coordinates) as unknown[]
  for(const polygon of polygons){
   if(!Array.isArray(polygon))continue
   const outer=polygon[0]
   if(Array.isArray(outer))for(const p of outer)if(isPoint(p))points.push(p)
  }
 }
 if(!points.length)return null
 return [(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,
         (Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2]
}
async function geocode(address:string):Promise<Point>{
 const u=new URL('https://data.geopf.fr/geocodage/search')
 u.searchParams.set('q',address);u.searchParams.set('limit','1')
 const res=await fetch(u.toString())
 if(!res.ok)throw new Error('Géocodage du siège indisponible.')
 const json=await res.json() as {features?:{geometry?:{coordinates?:number[]},properties?:{label?:string,score?:number}}[]}
 const point=json.features?.[0]?.geometry?.coordinates
 if(!isPoint(point))throw new Error('Adresse du siège introuvable par le géocodeur IGN.')
 return [point[0],point[1]]
}
async function routeKm(start:Point,end:Point):Promise<number>{
 const u=new URL('https://data.geopf.fr/navigation/itineraire')
 const params={resource:'bdtopo-osrm',profile:'car',optimization:'fastest',start:start.join(','),end:end.join(','),distanceUnit:'kilometer',timeUnit:'minute'}
 Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v))
 const res=await fetch(u.toString())
 if(!res.ok)throw new Error('Calcul routier IGN indisponible.')
 const json=await res.json() as {distance?:number|string,status?:string}
 const value=Number(json.distance)
 if(!Number.isFinite(value)||value<=0)throw new Error('Itinéraire non trouvé : vérifie le point d’accès de la mission.')
 return value
}
const today=()=>new Date().toLocaleDateString('en-CA')
export function QuoteBuilder({affaire,zones,company,estimateRevision,companyOrgIds}:{affaire:Affaire,zones:ZoneJson[],company:Company,estimateRevision:number,companyOrgIds:Record<Company,string>}){
 const [selectedCompany,setSelectedCompany]=useState<Company>(company)
 const [distance,setDistance]=useState('')
 const [kmRates,setKmRates]=useState<Record<Company,number>>({RHOTOR:0.55,NALDEO:0.55})
 const [trips,setTrips]=useState('1')
 const [includeTravel,setIncludeTravel]=useState(true)
 const [tripSource,setTripSource]=useState<'manual'|'ign'|null>(null)
 const [loadingRoute,setLoadingRoute]=useState(false)
 const [routeError,setRouteError]=useState('')
 const [estimates,setEstimates]=useState<{estimate:Estimate,lines:QuoteLine[]}|null>(null)
 const [estimateError,setEstimateError]=useState('')
 const [loadingEstimate,setLoadingEstimate]=useState(false)
 const [quoteDate,setQuoteDate]=useState(today)
 const [validity,setValidity]=useState('30')
 const [clientAddress,setClientAddress]=useState('')
 const [issuerSiret,setIssuerSiret]=useState('')
 const [legalText,setLegalText]=useState('')
 const [payment,setPayment]=useState('Conditions de règlement à préciser avant envoi.')
 const [logo,setLogo]=useState('')
 const [additional,setAdditional]=useState<QuoteLine[]>([])
 const [extraLabel,setExtraLabel]=useState('')
 const [extraQty,setExtraQty]=useState('1')
 const [extraRate,setExtraRate]=useState('')
 const [printError,setPrintError]=useState('')
 const point=useMemo(()=>centerOfZones(zones),[zones])
 const kmRate=kmRates[selectedCompany]
 useEffect(()=>{if(!supabase)return;supabase.from('app_settings').select('organization_id,setting_value').eq('setting_key','km_rate_eur').then(({data})=>{if(!data)return;setKmRates(prev=>{const next={...prev};for(const item of data){const value=Number(item.setting_value);if(!Number.isFinite(value)||value<0)continue;if(item.organization_id===companyOrgIds.RHOTOR)next.RHOTOR=value;if(item.organization_id===companyOrgIds.NALDEO)next.NALDEO=value}return next})})},[companyOrgIds.RHOTOR,companyOrgIds.NALDEO])
 useEffect(()=>{setSelectedCompany(company);setDistance('');setTripSource(null);setLogo('')},[company,affaire.id])
 const fetchEstimate=useCallback(async()=>{
  if(!supabase)return
  setLoadingEstimate(true);setEstimateError('')
  const missions=await supabase.from('missions').select('id').eq('affaire_id',affaire.id)
  if(missions.error){setEstimateError(missions.error.message);setLoadingEstimate(false);return}
  const ids=(missions.data??[]).map(x=>x.id)
  if(!ids.length){setEstimates(null);setLoadingEstimate(false);return}
  const result=await supabase.from('estimates').select('id,total_ht,surface_ha,gcp_count,created_at').in('mission_id',ids).order('created_at',{ascending:false}).limit(1)
  if(result.error){setEstimateError(result.error.message);setLoadingEstimate(false);return}
  const latest=result.data?.[0]
  if(!latest){setEstimates(null);setLoadingEstimate(false);return}
  const lines=await supabase.from('estimate_lines').select('id,label,quantity,unit,unit_price,total_ht').eq('estimate_id',latest.id).order('sort_order')
  if(lines.error){setEstimateError(lines.error.message);setLoadingEstimate(false);return}
  setEstimates({estimate:latest as Estimate,lines:(lines.data??[]) as QuoteLine[]})
  setLoadingEstimate(false)
 },[affaire.id])
 useEffect(()=>{void fetchEstimate()},[fetchEstimate,estimateRevision])
 async function autoRoute(){
  if(!point){setRouteError('Enregistre d’abord une emprise polygonale : le centre sert de destination indicative.');return}
  setLoadingRoute(true);setRouteError('')
  try{
   const home=await geocode(addresses[selectedCompany])
   const km=await routeKm(home,point)
   setDistance(km.toFixed(1));setTripSource('ign')
  }catch(e){setRouteError((e instanceof Error?e.message:'Impossible de calculer le trajet')+' Tu peux saisir la distance aller manuellement.')}
  finally{setLoadingRoute(false)}
 }
 async function uploadLogo(e:React.ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];if(!file)return
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5e6){setPrintError('Logo : image JPG/PNG/WebP de moins de 5 Mo.');return}
  const reader=new FileReader();reader.onload=()=>setLogo(String(reader.result));reader.readAsDataURL(file)
 }
 const kmOneWay=Number(distance)
 const tripCount=Number(trips)
 const validTravel=Number.isFinite(kmOneWay)&&kmOneWay>0&&Number.isFinite(tripCount)&&Number.isInteger(tripCount)&&tripCount>0&&tripCount<=365
 const totalKm=validTravel?cents(kmOneWay*2*tripCount):0
 const mileageCost=validTravel?cents(totalKm*kmRate):0
 const baseTotal=estimates?cents(estimates.lines.reduce((sum,l)=>sum+Number(l.total_ht),0)):0
 const extraTotal=cents(additional.reduce((sum,l)=>sum+l.total_ht,0))
 const totalHT=cents(baseTotal+extraTotal+(includeTravel?mileageCost:0))
 const showLines=[...(estimates?.lines??[]),...additional]
 function addLine(){
  const qty=Number(extraQty),rate=Number(extraRate)
  if(!extraLabel.trim()||!Number.isFinite(qty)||qty<=0||!Number.isFinite(rate)||rate<0){setPrintError('Renseigne un libellé, une quantité positive et un prix unitaire.');return}
  setAdditional(v=>[...v,{id:crypto.randomUUID(),label:extraLabel.trim(),quantity:qty,unit:'forfait',unit_price:rate,total_ht:cents(qty*rate)}])
  setExtraLabel('');setExtraQty('1');setExtraRate('');setPrintError('')
 }
 function print(){
  if(!estimates){setPrintError('Crée d’abord un chiffrage serveur pour inclure les postes calculés du dossier.');return}
  if(includeTravel&&!validTravel){setPrintError('Complète la distance aller et le nombre d’allers-retours, ou désactive les déplacements.');return}
  if(selectedCompany==='NALDEO'&&!logo){setPrintError('Importe le logo officiel NALDEO pour respecter la charte.');return}
  if(!issuerSiret.trim()){setPrintError('Renseigne le numéro SIRET de la société émettrice.');return}
  if(!clientAddress.trim()){setPrintError('Renseigne l’adresse de facturation du client.');return}
  if(!legalText.trim()){setPrintError('Renseigne les mentions fiscales/TVA applicables à la société émettrice.');return}
  if(!quoteDate){setPrintError('Renseigne la date du devis.');return}
  setPrintError('')
  const name=selectedCompany==='NALDEO'?'NALDEO':'RHOTOR'
  const logoUrl=selectedCompany==='RHOTOR'&&!logo?new URL(`${import.meta.env.BASE_URL}rhotor-logo.png`,window.location.origin).href:logo
  const lines=showLines.map(l=>`<tr><td>${esc(l.label)}</td><td class="right">${Number(l.quantity).toLocaleString('fr-FR',{maximumFractionDigits:3})}</td><td>${esc(l.unit)}</td><td class="right">${formatEur(Number(l.unit_price))}</td><td class="right">${formatEur(Number(l.total_ht))}</td></tr>`).join('')
  const kmRow=includeTravel?`<tr><td>Déplacements routiers : ${esc(addresses[selectedCompany])} ↔ ${esc(affaire.commune||'site mission')} (${tripCount} aller-retour(s), ${kmOneWay.toLocaleString('fr-FR',{maximumFractionDigits:1})} km aller)</td><td class="right">${totalKm.toLocaleString('fr-FR',{maximumFractionDigits:1})}</td><td>km</td><td class="right">${formatEur(kmRate)}/km</td><td class="right">${formatEur(mileageCost)}</td></tr>`:''
  const disclaimer=includeTravel?`<div class="note">Déplacements facturés au tarif commercial de ${formatEur(kmRate)}/km, selon le barème administrateur. Distance ${tripSource==='ign'?'estimée via IGN et à confirmer':'saisie manuellement'}. Péages et stationnement non inclus. Ce tarif est distinct du barème fiscal officiel.</div>`:''
  const html=`<!doctype html><html lang="fr"><head><meta charset="UTF-8"/><title>Devis ${esc(affaire.reference)} — ${name}</title><style>
  @page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#eaf1f4;font:11px Arial,Helvetica,sans-serif;color:#1b3644;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .printbar{max-width:210mm;margin:auto;display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:#e6f3f3}.printbar button{background:#0e8a90;color:white;border:0;border-radius:6px;padding:11px 14px;cursor:pointer;font-weight:bold}
  .page{width:210mm;min-height:297mm;margin:0 auto 15px;background:white;box-shadow:0 8px 30px #18344120;padding:17mm 16mm 15mm;position:relative}
  .mast{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #188a91;padding-bottom:13mm}
  .identity{display:flex;align-items:center;gap:16px}.identity img{max-width:48mm;max-height:22mm;object-fit:contain}.identity div{font-size:10px;color:#56717b;line-height:1.55}.identity strong{display:block;color:#153c4c;font-size:13px}
  .doc-label{text-align:right}.doc-label b{display:block;color:#123747;font-size:30px;letter-spacing:-.03em}.doc-label span{font-size:10px;color:#5c7b87}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin:13mm 0}.card{border-left:3px solid #0e9296;background:#f2f7f8;padding:5mm;min-height:28mm}.tag{font-size:9px;font-weight:bold;letter-spacing:.08em;color:#45808b;margin-bottom:3mm}.card p{margin:0;line-height:1.65;font-size:11px}
  h1{font-size:17px;color:#15394a;margin:2mm 0 4mm}.subject{padding-bottom:9mm}.subject span{color:#56717d;font-size:10px}
  table{border-collapse:collapse;width:100%;font-size:10px}thead th{background:#123c4c;color:white;padding:12px 8px;text-align:left;font-size:9px;font-weight:bold;text-transform:uppercase}tbody td{padding:11px 8px;border-bottom:1px solid #e0eaee;vertical-align:top;line-height:1.35}.right{text-align:right;white-space:nowrap}
  .summary{display:flex;justify-content:flex-end;margin-top:9mm}.total{width:75mm;padding:5mm 6mm;background:#123c4c;color:white;display:flex;justify-content:space-between;gap:12px;align-items:center}.total strong{font-size:18px}
  .note{font-size:9px;line-height:1.55;color:#617983;margin-top:7mm}.terms{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-top:13mm;padding-top:6mm;border-top:1px solid #dae8ec}.terms p{font-size:10px;line-height:1.6;margin:5px 0}.terms b{display:block;margin-bottom:2mm}
  footer{font-size:9px;color:#647d87;margin-top:18mm;padding-top:4mm;border-top:2px solid #e1ebee;line-height:1.7}.barcode{letter-spacing:1.5px;font-weight:bold;color:#128c91}
  @media print{body{background:#fff}.printbar{display:none}.page{box-shadow:none;margin:0;min-height:297mm}}
  </style></head><body><div class="printbar"><span>Prévisualisation A4 · vérifier les mentions légales avant envoi</span><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div><article class="page">
  <header class="mast"><div class="identity"><img src="${esc(logoUrl)}" alt="Logo officiel ${name}"/><div><strong>${name}</strong>${esc(addresses[selectedCompany])}<br/>SIRET : ${esc(issuerSiret)}</div></div>
  <div class="doc-label"><b>DEVIS</b><span>Réf. ${esc(affaire.reference)} · ${formatDate(quoteDate)}</span></div></header>
  <div class="grid"><div class="card"><div class="tag">ÉMETTEUR</div><p>${name}<br/>${esc(addresses[selectedCompany])}<br/>SIRET ${esc(issuerSiret)}</p></div>
  <div class="card"><div class="tag">DESTINATAIRE</div><p><strong>${esc(affaire.client||'Client à préciser')}</strong><br/>${esc(clientAddress).replace(/\n/g,'<br/>')}</p></div></div>
  <div class="subject"><span>MISSION DRONE · ${esc(affaire.commune)}</span><h1>${esc(affaire.title)}</h1><span>Estimation technique enregistrée · ${Number(estimates.estimate.surface_ha).toLocaleString('fr-FR',{maximumFractionDigits:3})} ha · ${estimates.estimate.gcp_count} points GCP</span></div>
  <table><thead><tr><th>Prestations / désignation</th><th>Qté</th><th>Unité</th><th class="right">PU HT</th><th class="right">Total HT</th></tr></thead><tbody>${lines}${kmRow}</tbody></table>
  <div class="summary"><div class="total"><span>TOTAL HT</span><strong>${formatEur(totalHT)}</strong></div></div>
  ${disclaimer}
  <div class="terms"><p><b>Validité du devis</b>${esc(validity)} jours à compter de la date d'émission.<br/><br/><b>Modalités de règlement</b>${esc(payment)}</p>
  <p><b>Régime fiscal et TVA</b>${esc(legalText).replace(/\n/g,'<br/>')}<br/><br/><b>Acceptation du client</b>Date, signature et mention « Bon pour accord » :</p></div>
  <footer><span class="barcode">${name} · EMPRISES</span> — Devis établi sur la base des données saisies et du chiffrage de l'affaire. Les obligations légales et mentions TVA doivent être vérifiées par l'émetteur.</footer></article></body></html>`
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}))
  const w=window.open(url,'_blank')
  if(!w)setPrintError('Le navigateur a bloqué la prévisualisation. Autorise les fenêtres pop-up pour EMPRISES.')
  setTimeout(()=>URL.revokeObjectURL(url),180000)
 }
 return <section className="panel quote-builder"><div className="panel-head"><div><h3><FileText size={18}/> Générateur de devis PDF</h3><p className="hint">Devis A4 avec en-tête de la société, lignes de chiffrage enregistrées et déplacements au tarif administrateur.</p></div><button className="ghost" disabled={loadingEstimate} onClick={()=>void fetchEstimate()}><RefreshCw size={15}/> Recharger le chiffrage</button></div>
 <div className="quote-figures"><div><span>Prestations HT</span><strong>{formatEur(baseTotal)}</strong></div><div><span>Déplacements HT</span><strong>{includeTravel&&validTravel?formatEur(mileageCost):'—'}</strong></div><div className="quote-total"><span>Total devis HT</span><strong>{formatEur(totalHT)}</strong></div></div>
 {loadingEstimate?<p className="hint">Lecture des lignes de chiffrage…</p>:estimateError?<p className="quote-alert">{estimateError}</p>:!estimates?<p className="quote-alert">Aucun chiffrage serveur disponible. Clique sur « Créer le chiffrage » ci-dessus, puis recharge les lignes.</p>:<p className="hint">Chiffrage du {new Date(estimates.estimate.created_at).toLocaleDateString('fr-FR')} · {estimates.lines.length} poste(s) enregistrés · le devis réutilise exactement ces lignes.</p>}
 <div className="quote-section"><h4><CarFront size={17}/> Déplacements et indemnités kilométriques</h4>
 <div className="quote-grid"><label>Point d'attachement<select value={selectedCompany} onChange={e=>{setSelectedCompany(e.target.value as Company);setDistance('');setTripSource(null)}}><option value="RHOTOR">RHOTOR — Les Assions</option><option value="NALDEO">NALDEO — Lachapelle-sous-Aubenas</option></select></label><div className="quote-origin"><span>Adresse de départ</span><strong>{addresses[selectedCompany]}</strong></div></div>
 <p className="hint"><MapPin size={13}/> Destination : centre de l'emprise de {affaire.commune||'la mission'} {point?(`(${point[1].toFixed(5)}, ${point[0].toFixed(5)})`):'— emprise non renseignée'}.</p>
 <button type="button" className="ghost" disabled={!point||loadingRoute} onClick={()=>void autoRoute()}><Route size={16}/>{loadingRoute?'Recherche de l’itinéraire IGN…':'Calculer l’itinéraire routier IGN'}</button>
 {routeError&&<p className="quote-alert">{routeError}</p>}
 <div className="quote-grid quote-km"><label>Distance aller (km)<input type="number" min="0" step="0.1" value={distance} onChange={e=>{setDistance(e.target.value);setTripSource('manual')}} placeholder="Ex. 37,5"/></label>
 <label>Nombre d'allers-retours<input type="number" min="1" step="1" max="365" value={trips} onChange={e=>setTrips(e.target.value)}/></label>
 <label className="quote-checkbox"><input type="checkbox" checked={includeTravel} onChange={e=>setIncludeTravel(e.target.checked)}/> Ajouter les déplacements au devis</label></div>
 <p className="hint">Tarif kilométrique commercial fixé dans les barèmes administrateur : {formatEur(kmRate)}/km. Calcul : distance aller × 2 × nombre d'allers-retours × tarif. Ce prix ne correspond pas au barème fiscal officiel.</p>
 <div className="quote-trip-result"><span>Distance AR × déplacements : <b>{totalKm.toLocaleString('fr-FR',{maximumFractionDigits:1})} km</b></span><span>Montant de déplacement : <b>{validTravel?formatEur(mileageCost):'À calculer'}</b></span></div></div>
 <div className="quote-section"><h4><Calculator size={17}/> Postes complémentaires</h4><div className="quote-grid quote-extras"><label>Désignation<input value={extraLabel} onChange={e=>setExtraLabel(e.target.value)} placeholder="Ex. Coordination de mission"/></label><label>Quantité<input type="number" min="0.01" step="0.01" value={extraQty} onChange={e=>setExtraQty(e.target.value)}/></label><label>Prix unitaire HT (€)<input type="number" min="0" step="0.01" value={extraRate} onChange={e=>setExtraRate(e.target.value)}/></label><button type="button" onClick={addLine}>Ajouter un poste</button></div>
 {additional.map(l=><div className="quote-extra-row" key={l.id}><span>{l.label} · {l.quantity} × {formatEur(l.unit_price)}</span><strong>{formatEur(l.total_ht)}</strong><button className="ghost" onClick={()=>setAdditional(x=>x.filter(y=>y.id!==l.id))}>Retirer</button></div>)}</div>
 <div className="quote-section"><h4><FileText size={17}/> Identification et mentions du devis</h4><div className="quote-grid">
 <label>Date d'émission<input type="date" value={quoteDate} onChange={e=>setQuoteDate(e.target.value)}/></label><label>Validité (jours)<input type="number" min="1" max="365" value={validity} onChange={e=>setValidity(e.target.value)}/></label>
 <label>N° SIRET de l'émetteur<input value={issuerSiret} onChange={e=>setIssuerSiret(e.target.value)} placeholder="À renseigner"/></label>
 <label className="quote-file"><Upload size={14}/> Logo officiel {selectedCompany}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void uploadLogo(e)}/><small>{logo?'Logo chargé':selectedCompany==='RHOTOR'?'Logo RHOTOR du site utilisé par défaut':'Logo officiel NALDEO requis'}</small></label>
 <label>Adresse du client<textarea rows={3} value={clientAddress} onChange={e=>setClientAddress(e.target.value)} placeholder="Adresse de facturation complète"/></label>
 <label>Mentions fiscales / TVA<textarea rows={3} value={legalText} onChange={e=>setLegalText(e.target.value)} placeholder="Ex. TVA applicable et taux / franchise en base si légalement applicable"/></label>
 <label className="quote-full">Conditions de règlement<textarea rows={2} value={payment} onChange={e=>setPayment(e.target.value)}/></label>
 </div></div>
 <div className="quote-footer"><span><Download size={16}/> Export PDF A4 via la fenêtre d'impression</span><button disabled={!estimates} onClick={print}><FileText size={17}/> Générer le devis PDF</button></div>
 {printError&&<p className="quote-alert" role="alert">{printError}</p>}
 </section>
}
