import {useEffect,useState} from 'react'
import {CalendarDays,FileImage,MapPinned,Printer,Upload} from 'lucide-react'
import type {ZoneJson} from '../lib/exports'
type Company='RHOTOR'|'NALDEO'
type Affaire={reference:string,title:string,commune:string}
type Props={affaire:Affaire,zones:ZoneJson[],company:Company,flightStart?:string,flightEnd?:string}
const contact:Record<Company,string>={RHOTOR:'06 15 04 46 21',NALDEO:'07 64 50 10 25'}
const htmlEsc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c))
const frenchDate=(s:string)=>s?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(new Date(s+'T12:00:00')):'DATE À COMPLÉTER'
const getPoints=(zones:ZoneJson[]):number[][]=>{
 const ps:number[][]=[]
 for(const z of zones){
  if(z.geometry.type!=='Polygon'&&z.geometry.type!=='MultiPolygon')continue
  const geoms=(z.geometry.type==='Polygon'?[z.geometry.coordinates]:z.geometry.coordinates) as number[][][][]
  for(const p of geoms)for(const ring of p)for(const xy of ring)if(Number.isFinite(xy[0])&&Number.isFinite(xy[1]))ps.push(xy)
 }
 return ps
}
function mapMarkup(zones:ZoneJson[],base:'plan'|'ortho'){
 const pts=getPoints(zones);if(!pts.length)return null
 const W=1050,H=570,margin=65
 const merc=20037508.342789244
 const lng2x=(lng:number,z:number)=>(lng+180)/360*2**z
 const lat2y=(lat:number,z:number)=>(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*2**z
 const lon0=Math.min(...pts.map(x=>x[0])),lon1=Math.max(...pts.map(x=>x[0]))
 const lat0=Math.min(...pts.map(x=>x[1])),lat1=Math.max(...pts.map(x=>x[1]))
 let zoom=17
 while(zoom>3){
  const dx=(lng2x(lon1,zoom)-lng2x(lon0,zoom))*256
  const dy=(lat2y(lat0,zoom)-lat2y(lat1,zoom))*256
  if(dx<W-margin*2&&dy<H-margin*2)break
  zoom--
 }
 const cx=lng2x((lon0+lon1)/2,zoom)*256,cy=lat2y((lat0+lat1)/2,zoom)*256
 const px=(lng:number)=>lng2x(lng,zoom)*256-cx+W/2
 const py=(lat:number)=>lat2y(lat,zoom)*256-cy+H/2
 const toM=(tile:number)=>((tile/2**zoom)*2-1)*merc
 const xmin=toM((cx-W/2)/256),xmax=toM((cx+W/2)/256)
 const ymax=-toM((cy-H/2)/256),ymin=-toM((cy+H/2)/256)
 const url=new URL('https://data.geopf.fr/wms-r/wms')
 const params={SERVICE:'WMS',VERSION:'1.3.0',REQUEST:'GetMap',LAYERS:base==='plan'?'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2':'ORTHOIMAGERY.ORTHOPHOTOS',STYLES:'',FORMAT:base==='plan'?'image/png':'image/jpeg',CRS:'EPSG:3857',BBOX:[xmin,ymin,xmax,ymax].join(','),WIDTH:String(W),HEIGHT:String(H)}
 Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v))
 const colors=['#087f87','#e87434','#4a63a8','#b98932']
 const polygons=zones.map((z,i)=>{
  if(z.geometry.type!=='Polygon'&&z.geometry.type!=='MultiPolygon')return ''
  const geoms=(z.geometry.type==='Polygon'?[z.geometry.coordinates]:z.geometry.coordinates) as number[][][][]
  return geoms.map(poly=>poly.map(ring=>'<path d="'+ring.map((p,k)=>(k?'L':'M')+px(p[0]).toFixed(1)+','+py(p[1]).toFixed(1)).join(' ')+' Z" fill="'+colors[i%4]+'" fill-opacity=".17" stroke="'+colors[i%4]+'" stroke-width="4" fill-rule="evenodd"/>').join('')).join('')
 }).join('')
 const midlat=(lat0+lat1)/2
 const metersPixel=156543.03392*Math.cos(midlat*Math.PI/180)/2**zoom
 const barM=Math.pow(10,Math.floor(Math.log10(170*metersPixel)))
 const barPX=Math.min(210,barM/metersPixel)
 return {image:url.toString(),svg:`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${polygons}</svg>`,scale:`<div class="map-scale"><div style="border-bottom:4px solid #122d3c;width:${barPX}px;height:9px"></div>${barM>=1000?barM/1000+' km':barM+' m'}</div>`}
}
const loadImage=(file:File):Promise<string>=>new Promise((resolve,reject)=>{
 if(!file.type.startsWith('image/')){reject(new Error('Choisis une image JPG ou PNG.'));return}
 if(file.size>15*1024*1024){reject(new Error('Image trop lourde (15 Mo maximum).'));return}
 const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Lecture impossible'));r.readAsDataURL(file)
})
export function IlliwapEditor({affaire,zones,company,flightStart='',flightEnd=''}:Props){
 const [org,setOrg]=useState<Company>(company)
 const [start,setStart]=useState(flightStart.slice(0,10))
 const [end,setEnd]=useState(flightEnd.slice(0,10))
 const [commune,setCommune]=useState(affaire.commune)
 const [notice,setNotice]=useState('Une opération de relevé aérien est programmée dans votre commune.')
 const [basemap,setBasemap]=useState<'plan'|'ortho'>('plan')
 const [photo,setPhoto]=useState(()=>{try{return localStorage.getItem('emprises_illiwap_cover_v1')??''}catch{return ''}})
 const [logo,setLogo]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 useEffect(()=>{setOrg(company)},[company])
 useEffect(()=>{if(flightStart)setStart(flightStart.slice(0,10));if(flightEnd)setEnd(flightEnd.slice(0,10))},[flightStart,flightEnd])
 useEffect(()=>{setCommune(affaire.commune)},[affaire.commune])
 async function upload(e:React.ChangeEvent<HTMLInputElement>,kind:'photo'|'logo'){
  const f=e.target.files?.[0];if(!f)return
  try{setError('');const data=await loadImage(f);if(kind==='photo'){setPhoto(data);try{localStorage.setItem('emprises_illiwap_cover_v1',data)}catch{setError('Photo chargée pour cette session, mais stockage local indisponible.')}}else setLogo(data)}
  catch(ex){setError(ex instanceof Error?ex.message:'Image invalide')}
  e.target.value=''
 }
 function print(){
  if(!start||!end){setError('Renseigne les dates de début et de fin.');return}
  if(end<start){setError('La date de fin doit être postérieure ou égale à la date de début.');return}
  if(org==='NALDEO'&&!logo){setError('Pour respecter la charte NALDEO, ajoute son fichier de logo officiel avant l’export.');return}
  const map=mapMarkup(zones,basemap)
  if(!map){setError('Enregistre une emprise polygonale avant de générer cette publication.');return}
  setError('');setBusy(true)
  const companyName=org==='NALDEO'?'NALDEO':'RHOTOR'
  const phone=contact[org]
  const header=org==='RHOTOR'?(logo||new URL(`${import.meta.env.BASE_URL}rhotor-logo.png`,window.location.origin).href):logo
  const photoHTML=photo?`<img src="${htmlEsc(photo)}" alt="Photographie drone" class="hero-img"/>`:'<div class="hero-placeholder"><div>MISSION DRONE</div><span>Photo à intégrer dans l’éditeur</span></div>'
  const title=`VOL DE DRONE`
  const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"/><title>${htmlEsc(affaire.reference)} — Publication Illiwap</title><style>
  @page{size:A5 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#132f40;background:#eef2f5}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bar{max-width:148mm;margin:0 auto;background:#e9f5f4;padding:12px;display:flex;gap:16px;align-items:center;justify-content:space-between;font:12px Arial}.bar button{border:0;border-radius:5px;background:#087c85;color:white;padding:11px 15px;font-weight:bold;cursor:pointer}
  .sheet{width:148mm;height:210mm;background:#fff;margin:0 auto;overflow:hidden;box-shadow:0 8px 28px #1233}
  .hero{position:relative;height:41mm;background:#d7e6ed;overflow:hidden}
  .hero-img{width:100%;height:100%;object-fit:cover;object-position:center 34%;display:block}
  .hero-placeholder{height:100%;background:linear-gradient(130deg,#12394a,#168e94);color:white;display:flex;flex-direction:column;justify-content:center;padding:15mm}.hero-placeholder div{font-size:20pt;font-weight:bold}.hero-placeholder span{font-size:9pt;margin-top:3mm}
  .hero:after{content:'';height:2mm;position:absolute;bottom:0;left:0;right:0;background:${org==='RHOTOR'?'#0c9697':'#176f94'}}
  .logo{position:absolute;right:7mm;top:5mm;padding:0;max-width:43mm;max-height:18mm;object-fit:contain;background:transparent;border-radius:0}
  .body{padding:6mm 9mm 0}.kicker{font-size:7pt;color:#16828b;font-weight:800;letter-spacing:1.6px}
  h1{margin:2mm 0 4mm;font-size:27pt;line-height:1.05;letter-spacing:-1.1px;font-weight:900}
  .lead{font-size:10pt;line-height:1.37;margin:0 0 4mm;font-weight:550}
  .date{display:flex;align-items:center;gap:3mm;padding:3mm 4mm;margin:4mm 0 4mm;background:#e9f4f4;border-left:1.1mm solid #008e94;font-size:9pt}
  .date strong{font-size:11pt}.subhead{display:flex;justify-content:space-between;align-items:center;margin:0 0 2mm;font-size:8pt;font-weight:800;text-transform:uppercase;letter-spacing:.7px}
  .subhead span{color:#547580;font-weight:500;text-transform:none;letter-spacing:0}
  .map{height:60mm;position:relative;overflow:hidden;background:#e3eaed;border:1px solid #bdd1d7}
  .map>img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
  .map>svg{position:absolute;inset:0;width:100%;height:100%}
  .north{position:absolute;right:3mm;top:3mm;background:white;border-radius:2px;padding:2mm;font-weight:800;font-size:11pt}
  .map-scale{position:absolute;bottom:2mm;left:2mm;background:#fffffff0;padding:2mm;font-size:7pt;font-weight:bold;display:grid;gap:1mm}
  .legal{font-size:6.7pt;line-height:1.28;color:#344f60;margin:4mm 0 0}
  .legal strong{color:#0c6f78}
  .foot{margin:2.5mm 9mm 0;border-top:1px solid #c9d9de;padding:2.5mm 0;display:flex;align-items:center;justify-content:space-between;gap:5mm;font-size:8pt}
  .foot strong{font-size:11pt;color:#0a5767;white-space:nowrap}
  .tiny{font-size:6.5pt;color:#748b94;margin:0.5mm 9mm}
  @media print{html,body{width:148mm;height:210mm;background:white}.bar{display:none}.sheet{box-shadow:none;margin:0;page-break-after:avoid}}
  </style></head><body><div class="bar"><span id="map-state">Chargement du fond cartographique IGN…</span><button id="print" disabled onclick="window.print()">Imprimer / Enregistrer en PDF A5</button></div><article class="sheet">
  <div class="hero">${photoHTML}<img class="logo" src="${htmlEsc(header)}" alt="Logo officiel ${companyName}"/></div>
  <div class="body"><div class="kicker">INFORMATION AUX HABITANTS · ${htmlEsc(commune||'VOTRE COMMUNE')}</div><h1>${title}</h1>
  <p class="lead">${htmlEsc(notice)}<br/>La société <strong>${companyName}</strong> a été missionnée pour réaliser un vol de drone dans votre commune, selon l’emprise définie sur la carte ci-dessous.</p>
  <div class="date">Période de vol : <strong>du ${htmlEsc(frenchDate(start))} au ${htmlEsc(frenchDate(end))}</strong></div>
  <div class="subhead">Périmètre prévisionnel de vol <span>${htmlEsc(affaire.reference)}</span></div>
  <div class="map"><img id="ign-map" src="${htmlEsc(map.image)}" alt="Fond cartographique IGN" onload="document.getElementById('map-state').textContent='Carte IGN prête';document.getElementById('print').disabled=false" onerror="document.getElementById('map-state').textContent='Carte IGN indisponible, ne pas imprimer'"/>${map.svg}<div class="north">N ↑</div>${map.scale}</div>
  <p class="legal"><strong>Professionnels qualifiés · Respect de la vie privée.</strong> La mission est réalisée par des télépilotes disposant des qualifications requises selon la réglementation applicable sous le contrôle de la DGAC. Les survols éventuels de propriétés privées sont soumis aux règles applicables. Aucune prise de vue ciblant l’intimité d’un espace privé ne sera volontairement réalisée sans l’accord préalable des personnes concernées.</p>
  </div><div class="foot"><span>Une question sur cette intervention ?<br/>Contactez le télépilote</span><strong>${htmlEsc(phone)}</strong></div>
  <p class="tiny">Emprise et période prévisionnelles · Fond © IGN / Géoplateforme · Les autorisations aériennes sont vérifiées séparément.</p>
  </article></body></html>`
  const object=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}))
  const w=window.open(object,'_blank')
  if(!w)setError('La fenêtre de publication a été bloquée : autorise les fenêtres pop-up pour EMPRISES.')
  setTimeout(()=>URL.revokeObjectURL(object),180000)
  setBusy(false)
 }
 return <section className="panel illiwap-editor"><div className="panel-head"><div><h3><FileImage size={18}/> Publication Illiwap · A5</h3><p className="hint">Avis aux habitants prêt à imprimer ou enregistrer en PDF. Le périmètre provient des emprises enregistrées.</p></div></div>
 <div className="illiwap-fields">
  <label>Société signataire<select value={org} onChange={e=>setOrg(e.target.value as Company)}><option value="RHOTOR">RHOTOR</option><option value="NALDEO">NALDEO</option></select></label>
  <label>Commune<input value={commune} onChange={e=>setCommune(e.target.value)}/></label>
  <label><CalendarDays size={14}/> Début du vol<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
  <label><CalendarDays size={14}/> Fin du vol<input type="date" min={start} value={end} onChange={e=>setEnd(e.target.value)}/></label>
  <label className="illiwap-wide">Phrase d’introduction<textarea value={notice} onChange={e=>setNotice(e.target.value)} rows={2} maxLength={240}/></label>
  <label>Fond de carte<select value={basemap} onChange={e=>setBasemap(e.target.value as 'plan'|'ortho')}><option value="plan">Plan IGN</option><option value="ortho">Orthophotographie IGN</option></select></label>
  <div className="illiwap-upload"><label><Upload size={14}/> Photo de couverture (JPG/PNG)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e,'photo')}/></label><small>{photo?'Photo de couverture mémorisée comme défaut':'Photo fixe réutilisable pour toutes les publications — ajoute-la une seule fois sur ce navigateur'}</small></div>
  <div className="illiwap-upload illiwap-wide"><label><Upload size={14}/> Logo officiel {org} (JPG/PNG)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e,'logo')}/></label><small>{logo?'Logo personnalisé chargé':org==='RHOTOR'?'Logo RHOTOR du site utilisé par défaut':'Logo officiel NALDEO requis pour préserver la charte graphique'}</small></div>
 </div>
 <div className="illiwap-actions"><span><MapPinned size={16}/> {zones.length} emprise(s) intégrée(s) · {contact[org]}</span><button disabled={busy||!zones.length} onClick={print}><Printer size={17}/> Générer la publication A5</button></div>
 {error&&<p className="illiwap-error" role="alert">{error}</p>}
 <p className="hint">Les photographies et logos sélectionnés sont utilisés localement dans le navigateur ; ils ne sont pas envoyés à GitHub. L'export comporte une carte réelle et non une emprise fictive.</p>
 </section>
}
