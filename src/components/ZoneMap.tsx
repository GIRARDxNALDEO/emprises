import {useEffect,useRef,useState} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type {ZoneJson} from '../lib/exports'
import {supabase} from '../lib/supabase'
import {parseKml} from '../lib/importKml'
type Props={affaireId:string,zones:ZoneJson[],onSaved:()=>void,canEdit:boolean}
export function ZoneMap({affaireId,zones,onSaved,canEdit}:Props){
 const host=useRef<HTMLDivElement|null>(null)
 const map=useRef<L.Map|null>(null)
 const drawing=useRef<L.LatLng[]>([])
 const draft=useRef<L.Polyline|null>(null)
 const vertexLayer=useRef<L.LayerGroup|null>(null)
 const liveLine=useRef<L.Polyline|null>(null)
 const searchMarker=useRef<L.CircleMarker|null>(null)
 const group=useRef<L.FeatureGroup|null>(null)
 const parcelLayer=useRef<L.TileLayer.WMS|null>(null)
 const baseLayer=useRef<L.TileLayer|null>(null)
 const [showParcels,setShowParcels]=useState(false)
 const [drawingMode,setDrawingMode]=useState(false)
 const [points,setPoints]=useState(0)
 const [name,setName]=useState('Zone 1')
 const [tech,setTech]=useState<'lidar'|'photogrammetrie'>('lidar')
 const [message,setMessage]=useState('')
 const [base,setBase]=useState<'osm'|'ortho'>('osm')
 const [busy,setBusy]=useState(false)
 const [query,setQuery]=useState('')
 const [searching,setSearching]=useState(false)
 const [places,setPlaces]=useState<{label:string,lat:number,lng:number}[]>([])
 const active=useRef(false)
 useEffect(()=>{active.current=drawingMode;const m=map.current;if(!m)return;const el=m.getContainer();el.classList.toggle('emprises-drawing',drawingMode);if(drawingMode){m.dragging.disable();m.doubleClickZoom.disable()}else{m.dragging.enable();m.doubleClickZoom.enable();liveLine.current?.remove();liveLine.current=null}},[drawingMode])
 useEffect(()=>{
  if(!host.current || map.current)return
  const m=L.map(host.current).setView([44.45,4.2],11)
  baseLayer.current=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(m)
  const layer=L.featureGroup().addTo(m);group.current=layer;map.current=m
  vertexLayer.current=L.layerGroup().addTo(m)
  m.on('click',(evt:L.LeafletMouseEvent)=>{
   if(!active.current)return
   drawing.current.push(evt.latlng);setPoints(drawing.current.length)
   if(draft.current)draft.current.remove()
   draft.current=L.polyline(drawing.current,{color:'#22c7c1',weight:3,dashArray:'7 5'}).addTo(m)
   L.circleMarker(evt.latlng,{radius:7,color:'#07363a',weight:2,fillColor:'#37e2d5',fillOpacity:1,interactive:false}).addTo(vertexLayer.current!)
   if(drawing.current.length>=3){draft.current.remove();draft.current=L.polygon(drawing.current,{color:'#22c7c1',weight:3,fillColor:'#22c7c1',fillOpacity:.17,dashArray:'7 5',interactive:false}).addTo(m) as L.Polyline}
  })
  m.on('mousemove',(evt:L.LeafletMouseEvent)=>{
   if(!active.current||!drawing.current.length)return
   const last=drawing.current[drawing.current.length-1]
   if(!liveLine.current)liveLine.current=L.polyline([last,evt.latlng],{color:'#45e7de',weight:2,dashArray:'4 6',interactive:false}).addTo(m)
   else liveLine.current.setLatLngs([last,evt.latlng])
  })
  return()=>{m.remove();map.current=null;group.current=null;draft.current=null;vertexLayer.current=null;liveLine.current=null;searchMarker.current=null}
 },[])
 useEffect(()=>{
  if(!map.current)return
  baseLayer.current?.remove()
  baseLayer.current=base==='osm'
    ?L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map.current)
    :L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg',{attribution:'© IGN Géoplateforme',maxZoom:19}).addTo(map.current)
 },[base])
 useEffect(()=>{
  const m=map.current
  if(!m)return
  if(showParcels){
   const cadastral=L.tileLayer.wms('https://data.geopf.fr/wms-r/wms',{layers:'CADASTRALPARCELS.PARCELLAIRE_EXPRESS',format:'image/png',transparent:true,version:'1.3.0',attribution:'© IGN — Parcellaire Express',opacity:.8})
   cadastral.addTo(m)
   parcelLayer.current=cadastral
  } else if(parcelLayer.current){parcelLayer.current.remove();parcelLayer.current=null}
  return()=>{parcelLayer.current?.remove();parcelLayer.current=null}
 },[showParcels])
 useEffect(()=>{
  if(!group.current)return
  group.current.clearLayers()
  for(const z of zones){
   const feature={type:'Feature',properties:{name:z.name},geometry:z.geometry} as GeoJSON.Feature
   L.geoJSON(feature,{style:{color:'#009d98',weight:3,fillOpacity:.16}}).bindTooltip(z.name).addTo(group.current)
  }
  if(zones.length && map.current){
   const bounds=group.current.getBounds()
   if(bounds?.isValid())map.current.fitBounds(bounds.pad(.2))
  }
 },[zones])
 async function importKmlFile(file:File){
  if(!supabase||!canEdit)return
  setBusy(true)
  try{
   if(file.size>5_000_000)throw Error('Fichier KML trop volumineux (5 Mo maximum).')
   const entries=parseKml(await file.text())
   let imported=0
   for(const zone of entries){
    const {error}=await supabase.rpc('save_zone',{p_affaire:affaireId,p_name:zone.name,p_survey_type:tech,p_geojson:zone.geometry})
    if(error)throw Error(`${imported} zone(s) enregistrée(s). ${error.message}`)
    imported++
   }
   setMessage(`${imported} emprise(s) importée(s).`)
   onSaved()
  }catch(e){setMessage(e instanceof Error?e.message:'Erreur d’import KML.')}
  finally{setBusy(false)}
 }
 function reset(){drawing.current=[];draft.current?.remove();draft.current=null;liveLine.current?.remove();liveLine.current=null;vertexLayer.current?.clearLayers();setPoints(0);setDrawingMode(false)}
 function undoPoint(){if(!drawing.current.length)return;drawing.current.pop();draft.current?.remove();draft.current=null;liveLine.current?.remove();liveLine.current=null;vertexLayer.current?.clearLayers();const m=map.current;if(m){drawing.current.forEach(p=>L.circleMarker(p,{radius:7,color:'#07363a',weight:2,fillColor:'#37e2d5',fillOpacity:1,interactive:false}).addTo(vertexLayer.current!));if(drawing.current.length)draft.current=(drawing.current.length>=3?L.polygon(drawing.current,{color:'#22c7c1',weight:3,fillColor:'#22c7c1',fillOpacity:.17,dashArray:'7 5',interactive:false}):L.polyline(drawing.current,{color:'#22c7c1',weight:3,dashArray:'7 5',interactive:false})).addTo(m) as L.Polyline}setPoints(drawing.current.length)}
 async function searchPlace(e:React.FormEvent){e.preventDefault();const value=query.trim();if(value.length<2){setMessage('Saisis au moins 2 caractères pour chercher une adresse ou une commune.');return}setSearching(true);setPlaces([]);try{const response=await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(value)}&limit=6`);if(!response.ok)throw Error('Le service de recherche IGN est indisponible.');const data=await response.json() as {features?:Array<{geometry?:{coordinates?:number[]},properties?:{label?:string,name?:string}}>};const items=(data.features??[]).flatMap(f=>{const coords=f.geometry?.coordinates;return coords&&coords.length>=2?[{lng:coords[0],lat:coords[1],label:f.properties?.label??f.properties?.name??value}]:[]});setPlaces(items);if(!items.length)setMessage('Aucun lieu trouvé. Précise la commune ou le code postal.')}catch(err){setMessage(err instanceof Error?err.message:'Recherche impossible.')}finally{setSearching(false)}}
 function goToPlace(place:{label:string,lat:number,lng:number}){const m=map.current;if(!m)return;m.setView([place.lat,place.lng],Math.max(m.getZoom(),16));searchMarker.current?.remove();searchMarker.current=L.circleMarker([place.lat,place.lng],{radius:8,color:'#fff',weight:2,fillColor:'#009b98',fillOpacity:1}).addTo(m).bindPopup(place.label).openPopup();setQuery(place.label);setPlaces([])}
 async function save(){
  if(!supabase || drawing.current.length<3)return
  const ring=drawing.current.map(p=>[p.lng,p.lat]);ring.push(ring[0])
  const {error}=await supabase.rpc('save_zone',{p_affaire:affaireId,p_name:name,p_survey_type:tech,p_geojson:{type:'Polygon',coordinates:[ring]}})
  if(error){setMessage(error.message);return}
  setMessage('Zone enregistrée');reset();onSaved()
 }
 return <section className="panel map-panel">
  <div className="panel-head"><h3>Carte et emprises</h3><span className="hint">Dessin simplifié de polygones · EPSG:4326</span></div>
  <form className="map-search" onSubmit={searchPlace}><input aria-label="Rechercher une adresse ou une commune" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher une adresse, commune, lieu-dit…"/><button type="submit" disabled={searching}>{searching?'Recherche…':'Rechercher'}</button></form>
  {places.length>0&&<div className="map-search-results" role="listbox" aria-label="Résultats de recherche">{places.map((p,i)=><button type="button" key={`${p.lng}-${p.lat}-${i}`} className="ghost" onClick={()=>goToPlace(p)}>{p.label}</button>)}</div>}
  <div className="map-toolbar"><select aria-label="Fond cartographique" value={base} onChange={e=>setBase(e.target.value as typeof base)}><option value="osm">Plan OpenStreetMap</option><option value="ortho">Orthophoto IGN</option></select><label className="parcel-toggle"><input type="checkbox" checked={showParcels} onChange={e=>setShowParcels(e.target.checked)}/> Contours cadastraux</label>
    {canEdit&&<><input aria-label="Nom de zone" value={name} onChange={e=>setName(e.target.value)} placeholder="Nom de zone"/>
    <select aria-label="Type de levé" value={tech} onChange={e=>setTech(e.target.value as typeof tech)}><option value="lidar">LiDAR</option><option value="photogrammetrie">Photogrammétrie</option></select>
    <label className="file-import">Importer KML<input type="file" accept=".kml,application/vnd.google-earth.kml+xml" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void importKmlFile(file);e.target.value=""}}/></label>
    <button onClick={()=>setDrawingMode(!drawingMode)}>{drawingMode?'Pause dessin':'Dessiner une zone'}</button>
    <button className="ghost" disabled={!points} onClick={undoPoint}>Retirer dernier point</button>
    <button disabled={points<3} onClick={save}>Enregistrer ({points} points)</button><button className="ghost" onClick={reset}>Annuler</button></>}
  </div>
  {drawingMode&&<p className="hint map-drawing-hint">Mode dessin actif : clique pour placer chaque sommet ({points} point{points>1?'s':''}). Utilise « Retirer dernier point » pour corriger.</p>}
  <div ref={host} className="map-canvas"/>
  {message&&<p className="hint">{message}</p>}
  <p className="hint">Clique sur « Dessiner une zone », place au moins trois sommets visibles et enregistre la zone. L'édition des sommets n'est pas encore disponible. L'import KML accepte les polygones et multipolygones, sans les trajectoires. Le parcellaire est une représentation cartographique, pas un bornage légal.</p>
 </section>
}
