/** Parses KML polygon placemarks into validated GeoJSON polygons. All coordinates are WGS84. */
export type ImportedZone = {name:string;geometry:{type:'Polygon';coordinates:number[][][]}|{type:'MultiPolygon';coordinates:number[][][][]}}
export function parseKml(content:string):ImportedZone[]{
 const doc=new DOMParser().parseFromString(content,'application/xml')
 if(doc.querySelector('parsererror'))throw Error('Le fichier KML est invalide.')
 const placemarks=Array.from(doc.getElementsByTagName('*')).filter(e=>e.localName==='Placemark')
 const out:ImportedZone[]=[]
 const descendants=(el:Element, tag:string)=>Array.from(el.getElementsByTagName('*')).filter(e=>e.localName===tag)
 function ring(el:Element):number[][]{
  const text=descendants(el,'coordinates')[0]?.textContent||''
  const coords=text.trim().split(/\s+/).filter(Boolean).map(part=>part.split(',').slice(0,2).map(Number))
  if(coords.length<3||coords.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))||Math.abs(p[0])>180||Math.abs(p[1])>90))throw Error('Coordonnées KML invalides.')
  if(coords[0][0]!==coords[coords.length-1][0]||coords[0][1]!==coords[coords.length-1][1])coords.push([...coords[0]])
  if(coords.length<4)throw Error('Polygone KML incomplet.')
  return coords
 }
 for(const pm of placemarks){
  const polys=descendants(pm,'Polygon').map(poly=>{
   const outer=descendants(poly,'outerBoundaryIs')[0]
   if(!outer)throw Error('Polygone KML sans contour extérieur.')
   return [ring(outer),...descendants(poly,'innerBoundaryIs').map(ring)]
  })
  if(!polys.length)continue
  const name=descendants(pm,'name')[0]?.textContent?.trim().slice(0,160)||`Zone ${out.length+1}`
  out.push({name,geometry:polys.length===1?{type:'Polygon',coordinates:polys[0]}:{type:'MultiPolygon',coordinates:polys}})
 }
 if(!out.length)throw Error('Aucune emprise polygonale dans ce KML.')
 if(out.length>100)throw Error('Import limité à 100 emprises par fichier.')
 return out
}
