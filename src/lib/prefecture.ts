import type {ZoneJson} from './exports'

type Vertex=[number,number]
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]||c))
const polys=(z:ZoneJson):number[][][][]=> z.geometry.type==='Polygon'?[z.geometry.coordinates as number[][][]]:z.geometry.type==='MultiPolygon'?z.geometry.coordinates as number[][][][]:[]
const coords=(z:ZoneJson):Vertex[]=>polys(z).flat(2).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])).map(p=>[p[0],p[1]])
const lng2x=(lng:number,z:number)=>(lng+180)/360*2**z
const lat2y=(lat:number,z:number)=>(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*2**z
const palette=['#06a6a1','#e76f51','#497bd1','#b78825','#9b72c1','#378e69']
/** Creates a printable A4 cartographic report. No canvas screenshot, multi-zone retained.
 * Browser print dialog permits Save as PDF. External imagery can be blocked by print/privacy settings.
 */
export function printPrefecture(affaire:{reference:string,title:string,commune:string,client:string},zones:ZoneJson[],operator:{name:string,pilot:string,phone:string,email:string,start:string,end:string,drone:string,registration:string,notes:string},basemap:'osm'|'ortho'='osm'){
 if(!zones.length)throw new Error('Aucune zone à exporter.')
 const pts=zones.flatMap(coords)
 if(!pts.length)throw new Error('Géométries vides.')
 const width=1100,height=620,pad=70
 const minLon=Math.min(...pts.map(p=>p[0])),maxLon=Math.max(...pts.map(p=>p[0]));const minLat=Math.min(...pts.map(p=>p[1])),maxLat=Math.max(...pts.map(p=>p[1]))
 let zoom=17
 while(zoom>2){const dx=(lng2x(maxLon,zoom)-lng2x(minLon,zoom))*256;const dy=(lat2y(minLat,zoom)-lat2y(maxLat,zoom))*256;if(dx<width-pad*2&&dy<height-pad*2)break;zoom--}
 const cx=(lng2x((minLon+maxLon)/2,zoom))*256,cy=(lat2y((minLat+maxLat)/2,zoom))*256
 const px=(lng:number)=>lng2x(lng,zoom)*256-cx+width/2
 const py=(lat:number)=>lat2y(lat,zoom)*256-cy+height/2
 // IGN WMS GetMap: one render avoids 403 from the public OSM tile server.
 const merc=20037508.342789244
 const toMeters=(tile:number)=>((tile/2**zoom)*2-1)*merc
 const left=toMeters((cx-width/2)/256),right=toMeters((cx+width/2)/256)
 const top=-toMeters((cy-height/2)/256),bottom=-toMeters((cy+height/2)/256)
 const wms=new URL('https://data.geopf.fr/wms-r/wms')
 const params={SERVICE:'WMS',VERSION:'1.3.0',REQUEST:'GetMap',LAYERS:basemap==='osm'?'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2':'ORTHOIMAGERY.ORTHOPHOTOS',STYLES:'',FORMAT:basemap==='osm'?'image/png':'image/jpeg',CRS:'EPSG:3857',BBOX:[left,bottom,right,top].join(','),WIDTH:String(width),HEIGHT:String(height)}
 Object.entries(params).forEach(([key,value])=>wms.searchParams.set(key,value))
 const mapImage=esc(wms.toString())
 const shapes=zones.map((z,i)=>polys(z).map(poly=>poly.map((ring,j)=>`<path d="${ring.map((p,k)=>`${k?'L':'M'}${px(p[0]).toFixed(2)},${py(p[1]).toFixed(2)}`).join(' ')}Z" fill="${j?'white':palette[i%palette.length]}" fill-opacity="${j?0:.16}" stroke="${palette[i%palette.length]}" stroke-width="3" fill-rule="evenodd"/>`).join('')).join('')).join('')
 const labels=zones.map(z=>{const pp=coords(z);if(!pp.length)return '';const x=pp.reduce((s,p)=>s+px(p[0]),0)/pp.length;const y=pp.reduce((s,p)=>s+py(p[1]),0)/pp.length;return `<g><rect x="${x-70}" y="${y-17}" width="140" height="31" rx="6" fill="white" fill-opacity=".95"/><text x="${x}" y="${y+4}" font-size="15" font-family="Arial" font-weight="700" text-anchor="middle" fill="#172e3f">${esc(z.name.slice(0,24))}</text></g>`}).join('')
 const metersPerPixel=156543.03392*Math.cos((minLat+maxLat)/2*Math.PI/180)/2**zoom
 const scaleMeters=Math.max(10,Math.pow(10,Math.floor(Math.log10(160*metersPerPixel))));const barWidth=scaleMeters/metersPerPixel
 const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(affaire.reference)} — Dossier cartographique</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#142536;margin:0}header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #009e9a;padding-bottom:10px;margin-bottom:12px}h1{font-size:21px;margin:3px 0}.muted{color:#66788c;font-size:11px}.map{width:100%;height:155mm;position:relative;overflow:hidden;border:1px solid #aebcc7;background:#e6edf1}.map svg{position:absolute;width:100%;height:100%;inset:0}.legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px}.chip{display:inline-flex;align-items:center;gap:5px}.dot{height:11px;width:11px;display:inline-block;border-radius:2px}footer{font-size:10px;margin-top:9px;display:flex;justify-content:space-between}.meta{line-height:1.6}.tools{position:absolute;right:12px;top:12px;background:white;border-radius:5px;padding:8px;font-size:16px;font-weight:bold}.scalebox{position:absolute;bottom:10px;left:10px;background:#fff;padding:7px}.printbar{padding:12px;background:#e3f2f1;margin-bottom:8px}@media print{.printbar{display:none}}</style></head><body><div class="printbar">Contrôler les fonds et cliquer sur « Imprimer / Enregistrer en PDF ». <button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div><header><div><div class="muted">${esc(operator.name||'RHOTOR SOLUTIONS')} · Préparation cartographique de mission drone</div><h1>${esc(affaire.reference)} — ${esc(affaire.title)}</h1><div class="meta">Commune : ${esc(affaire.commune||'Non renseignée')} · Client : ${esc(affaire.client||'Non renseigné')}<br/>Télépilote : ${esc(operator.pilot||'À compléter')} · Contact : ${esc(operator.phone||'—')} / ${esc(operator.email||'—')} · Période : ${esc([operator.start,operator.end].filter(Boolean).join(' → ')||'À définir')}<br/>Drone : ${esc(operator.drone||'Non sélectionné')} · N° UAS : ${esc(operator.registration||'—')}</div></div><div style="text-align:right"><img src="${new URL(`${import.meta.env.BASE_URL}rhotor-logo.png`, window.location.origin).href}" alt="RHOTOR" style="max-width:125px;max-height:46px;object-fit:contain;background:#152536;padding:4px;border-radius:4px"/><br/><strong>EMPRISES</strong><br/><span class="muted">by RHOTOR SOLUTIONS</span><br/><span class="muted">${new Date().toLocaleDateString('fr-FR')}</span></div></header><div class="map"><img id="ign-basemap" src="${mapImage}" alt="Fond IGN" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill"/><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${shapes}${labels}</svg><div class="tools">N ↑</div><div class="scalebox"><div style="border-bottom:4px solid #1e293b;width:${barWidth}px;max-width:200px">&nbsp;</div>${scaleMeters>=1000?scaleMeters/1000+' km':scaleMeters+' m'}</div></div><div class="legend">${zones.map((z,i)=>`<span class="chip"><i class="dot" style="background:${palette[i%palette.length]}"></i>${esc(z.name)} : ${(z.surface_m2/10000).toLocaleString('fr-FR',{maximumFractionDigits:3})} ha</span>`).join('')}</div><footer><span>${esc(operator.notes||'Emprises indicatives. Les contraintes réglementaires et autorisations sont vérifiées séparément.')}</span><span>Fond © IGN Géoplateforme — ${basemap==='osm'?'PLAN IGN':'BD ORTHO'} · Échelle graphique indicative à l’impression 100 %</span></footer></body></html>`
 const blob=new Blob([html],{type:'text/html;charset=utf-8'});const url=URL.createObjectURL(blob);window.open(url,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(url),120000)
}
