import type {ZoneJson} from './exports'
import {downloadText} from './exports'
export type Crs='EPSG:2154'|'EPSG:3945'
// Lambert-93 (EPSG:2154) or RGF93 / CC45 (EPSG:3945), WGS84 geographic input.
// Formulas follow the Lambert Conformal Conic ellipsoidal projection parameters.
const e=Math.sqrt(0.00669438002290)
const params={
 'EPSG:2154':{lat1:44,lat2:49,lat0:46.5,lon0:3,x0:700000,y0:6600000},
 'EPSG:3945':{lat1:44.25,lat2:45.75,lat0:45,lon0:3,x0:1700000,y0:4200000}
}
function t(phi:number){return Math.tan(Math.PI/4-phi/2)/Math.pow((1-e*Math.sin(phi))/(1+e*Math.sin(phi)),e/2)}
function m(phi:number){return Math.cos(phi)/Math.sqrt(1-e*e*Math.sin(phi)**2)}
export function project(lon:number,lat:number,crs:Crs):[number,number]{
 const p=params[crs],rad=Math.PI/180,phi1=p.lat1*rad,phi2=p.lat2*rad
 const n=Math.log(m(phi1)/m(phi2))/Math.log(t(phi1)/t(phi2))
 const c=m(phi1)/(n*t(phi1)**n)
 const rho=6378137*c*t(lat*rad)**n, rho0=6378137*c*t(p.lat0*rad)**n
 return [p.x0+rho*Math.sin(n*(lon-p.lon0)*rad),p.y0+rho0-rho*Math.cos(n*(lon-p.lon0)*rad)]
}
export function exportProjectedDxf(zones:ZoneJson[],crs:Crs){
 const lines:string[]=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','6','0','ENDSEC','0','SECTION','2','ENTITIES']
 for(const [i,z] of zones.entries()){
  const layer='ZONE_'+String(i+1).padStart(3,'0')+'_'+z.name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,25)
  const polygons=(z.geometry.type==='Polygon'?[z.geometry.coordinates]:z.geometry.type==='MultiPolygon'?z.geometry.coordinates:[]) as number[][][][]
  for(const poly of polygons)for(const ring of poly){const vertices=ring.length>1&&ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1]?ring.slice(0,-1):ring
   lines.push('0','LWPOLYLINE','8',layer,'90',String(vertices.length),'70','1');for(const p of vertices){const [x,y]=project(p[0],p[1],crs);lines.push('10',x.toFixed(3),'20',y.toFixed(3))}
  }
 }
 lines.push('0','ENDSEC','0','EOF')
 downloadText(`emprises_${crs.replace(':','_')}.dxf`,lines.join('\n')+'\n','application/dxf')
}
