export type ZoneJson = {id:string,name:string,type:string,surface_m2:number,geometry:GeoJSONGeometry}
type GeoJSONGeometry={type:string;coordinates:unknown}
export function downloadText(name:string,content:string,mime:string){
 const url=URL.createObjectURL(new Blob([content],{type:mime}))
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)
}
export function exportGeojson(zones:ZoneJson[]){
 downloadText('emprises.geojson',JSON.stringify({type:'FeatureCollection',features:zones.map(z=>({type:'Feature',properties:{id:z.id,name:z.name,type:z.type,surface_m2:z.surface_m2},geometry:z.geometry}))},null,2),'application/geo+json')
}
function xmlEscape(v:string){return v.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]||c))}
export function exportKml(zones:ZoneJson[]){
 const placemarks=zones.map(z=>{
  const g=z.geometry
  if(g.type!=='Polygon' && g.type!=='MultiPolygon')return ''
  const polygons=(g.type==='Polygon'?[g.coordinates]:g.coordinates) as number[][][][]
  const polys=polygons.map(poly=>{
   const ring=(coords:number[][])=>coords.map(p=>`${p[0]},${p[1]},0`).join(' ')
   return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ring(poly[0])}</coordinates></LinearRing></outerBoundaryIs>${poly.slice(1).map(h=>`<innerBoundaryIs><LinearRing><coordinates>${ring(h)}</coordinates></LinearRing></innerBoundaryIs>`).join('')}</Polygon>`
  }).join('')
  return `<Placemark><name>${xmlEscape(z.name)}</name><ExtendedData><Data name="type"><value>${xmlEscape(z.type)}</value></Data></ExtendedData><MultiGeometry>${polys}</MultiGeometry></Placemark>`
 }).join('')
 downloadText('emprises.kml',`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`,'application/vnd.google-earth.kml+xml')
}

/** ASCII DXF compatible AutoCAD/QGIS. WGS84 geographic coordinates (EPSG:4326).
 * Importers should explicitly reproject to project CRS; do not silently treat degrees as metres. */
export function exportDxf(zones:ZoneJson[]){
 const pieces:string[]=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','0','ENDSEC','0','SECTION','2','TABLES','0','TABLE','2','LAYER','70',String(zones.length)]
 const layerNames=zones.map((z,i)=>'ZONE_'+String(i+1).padStart(3,'0')+'_'+z.name.normalize('NFKD').replace(/[^\w-]/g,'_').slice(0,28))
 layerNames.forEach(name=>pieces.push('0','LAYER','2',name,'70','0','62','7','6','CONTINUOUS'))
 pieces.push('0','ENDTAB','0','ENDSEC','0','SECTION','2','ENTITIES')
 zones.forEach((z,index)=>{
  const geom=z.geometry
  if(geom.type!=='Polygon'&&geom.type!=='MultiPolygon')return
  const polygons=(geom.type==='Polygon'?[geom.coordinates]:geom.coordinates) as number[][][][]
  for(const polygon of polygons){
   for(const ring of polygon){
    const pts=ring.length>1&&ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1]?ring.slice(0,-1):ring
    pieces.push('0','LWPOLYLINE','8',layerNames[index],'90',String(pts.length),'70','1')
    for(const pt of pts)pieces.push('10',String(pt[0]),'20',String(pt[1]))
   }
  }
 })
 pieces.push('0','ENDSEC','0','EOF')
 downloadText('emprises_WGS84_EPSG4326.dxf',pieces.join('\n')+'\n','application/dxf')
}
