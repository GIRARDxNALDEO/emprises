import {useEffect,useMemo,useState} from 'react'
import {AlertTriangle,CalendarDays,Cloud,CloudDrizzle,CloudRain,CloudSun,Compass,MapPin,RefreshCw,Sun,Wind} from 'lucide-react'
import type {ZoneJson} from '../lib/exports'

type Daily={time:string[],weather_code:number[],temperature_2m_max:number[],temperature_2m_min:number[],precipitation_probability_max:number[],precipitation_sum:number[],wind_speed_10m_max:number[],wind_gusts_10m_max:number[],sunrise:string[],sunset:string[]}
type Hourly={time:string[],temperature_2m:number[],wind_speed_10m:number[],wind_gusts_10m:number[],precipitation_probability:number[],precipitation:number[]}
type Forecast={daily:Daily,hourly:Hourly}
type Day={day:string,code:number,max:number,min:number,rainChance:number,rain:number,wind:number,gust:number,sunrise:string,sunset:string}
const weatherLabel=(code:number)=> code===0?'Ensoleillé':code<=2?'Éclaircies':code===3?'Couvert':code===45||code===48?'Brouillard':code>=95?'Orages':code>=71&&code<=86?'Neige':code>=51&&code<=67?'Pluie':code>=80&&code<=82?'Averses':'Variable'
function WeatherIcon({code,size=26}:{code:number,size?:number}){
 if(code===0)return <Sun size={size}/>
 if(code<=2)return <CloudSun size={size}/>
 if(code===3||code===45||code===48)return <Cloud size={size}/>
 if(code>=51&&code<=86)return <CloudRain size={size}/>
 if(code>=95)return <CloudDrizzle size={size}/>
 return <CloudSun size={size}/>
}
function zoneCenter(zones:ZoneJson[]):{lat:number,lon:number}|null{
 const points:number[][]=[]
 zones.forEach(z=>{
  const g=z.geometry
  if(g.type!=='Polygon'&&g.type!=='MultiPolygon')return
  const polygons=(g.type==='Polygon'?[g.coordinates]:g.coordinates) as number[][][][]
  polygons.forEach(p=>p[0]?.forEach(pt=>{if(Number.isFinite(pt[0])&&Number.isFinite(pt[1]))points.push(pt)}))
 })
 if(!points.length)return null
 const lat=(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2
 const lon=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2
 return {lat,lon}
}
function num(v:number){return Number.isFinite(v)?Math.round(v):0}
function dayLabel(date:string){return new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'short'}).format(new Date(date+'T12:00:00'))}
export function MissionWeather({zones,commune}:{zones:ZoneJson[],commune:string}){
 const position=useMemo(()=>zoneCenter(zones),[zones])
 const [forecast,setForecast]=useState<Forecast|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [selectedDay,setSelectedDay]=useState(0)
 const [reload,setReload]=useState(0)
 useEffect(()=>{
  if(!position){setForecast(null);setError('');return}
  const controller=new AbortController()
  const load=async()=>{
   setLoading(true);setError('');setForecast(null)
   try{
    const url=new URL('https://api.open-meteo.com/v1/forecast')
    const params={
     latitude:position.lat.toFixed(5),longitude:position.lon.toFixed(5),timezone:'Europe/Paris',forecast_days:'5',
     daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset',
     hourly:'temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability,precipitation',
     wind_speed_unit:'kmh'
    }
    Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v))
    const response=await fetch(url.toString(),{signal:controller.signal})
    if(!response.ok)throw new Error('Service météo momentanément indisponible')
    const data=await response.json() as Forecast
    if(!data.daily?.time?.length||!data.hourly?.time?.length)throw new Error('Prévisions indisponibles pour cette zone')
    if(!controller.signal.aborted){setForecast(data);setSelectedDay(0)}
   }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Impossible de charger la météo')}
   finally{if(!controller.signal.aborted)setLoading(false)}
  }
  void load()
  return()=>controller.abort()
 },[position?.lat,position?.lon,reload])
 const days:Day[]=forecast?.daily.time.slice(0,5).map((day,i)=>({
  day,code:forecast.daily.weather_code[i],max:forecast.daily.temperature_2m_max[i],min:forecast.daily.temperature_2m_min[i],
  rainChance:forecast.daily.precipitation_probability_max[i],rain:forecast.daily.precipitation_sum[i],wind:forecast.daily.wind_speed_10m_max[i],
  gust:forecast.daily.wind_gusts_10m_max[i],sunrise:forecast.daily.sunrise[i],sunset:forecast.daily.sunset[i]
 }))??[]
 const today=days[selectedDay]
 const hours=forecast&&today?forecast.hourly.time.map((time,i)=>({
  time,wind:forecast.hourly.wind_speed_10m[i],gust:forecast.hourly.wind_gusts_10m[i],
  rain:forecast.hourly.precipitation_probability[i],temp:forecast.hourly.temperature_2m[i]
 })).filter(h=>h.time.slice(0,10)===today.day&&Number(h.time.slice(11,13))>=7&&Number(h.time.slice(11,13))<=20):[]
 return <section className="panel flight-weather">
  <div className="flight-weather-head">
   <div><span className="weather-kicker"><CloudSun size={15}/> CONDITIONS MÉTÉO · MISSION DRONE</span><h3>Prévisions sur 5 jours</h3><p className="hint">{position?<><MapPin size={13}/> {commune||'Centre des emprises'} · {position.lat.toFixed(4)}°, {position.lon.toFixed(4)}°</>:'Dessine ou importe une emprise pour obtenir les prévisions à cet endroit.'}</p></div>
   <button className="weather-refresh" type="button" disabled={!position||loading} onClick={()=>setReload(n=>n+1)} title="Actualiser les prévisions"><RefreshCw size={17}/><span>Actualiser</span></button>
  </div>
  {!position?<div className="weather-empty"><MapPin size={24}/><span>La météo apparaîtra ici dès qu’une zone de vol sera enregistrée.</span></div>
  :loading?<div className="weather-empty"><RefreshCw size={22} className="weather-spin"/><span>Chargement des prévisions météo…</span></div>
  :error?<div className="weather-error"><AlertTriangle size={18}/><span>{error}</span><button onClick={()=>setReload(n=>n+1)}>Réessayer</button></div>
  :today&&<><div className="weather-days" role="group" aria-label="Choisir un jour de prévision">
    {days.map((d,i)=><button type="button" key={d.day} className={'weather-day '+(selectedDay===i?'is-active':'')} aria-pressed={selectedDay===i} onClick={()=>setSelectedDay(i)}>
      <span className="weather-day-name">{i===0?"Aujourd'hui":dayLabel(d.day)}</span>
      <span className="weather-day-icon"><WeatherIcon code={d.code} size={30}/></span>
      <span className="weather-day-temp">{num(d.max)}° <small>{num(d.min)}°</small></span>
      <span className="weather-day-desc">{weatherLabel(d.code)}</span>
      <span className="weather-day-wind"><Wind size={13}/> {num(d.wind)} <small>km/h</small></span>
      <span className="weather-day-rain"><CloudRain size={13}/> {num(d.rainChance)} %</span>
    </button>)}
   </div>
   <div className="weather-summary">
    <div className="weather-metric"><span><Wind size={16}/> Vent max à 10 m</span><strong>{num(today.wind)} <small>km/h</small></strong></div>
    <div className="weather-metric"><span><Compass size={16}/> Rafales max</span><strong>{num(today.gust)} <small>km/h</small></strong></div>
    <div className="weather-metric"><span><CloudRain size={16}/> Précipitations</span><strong>{num(today.rainChance)} <small>%</small></strong><small>{today.rain.toLocaleString('fr-FR',{maximumFractionDigits:1})} mm prévus</small></div>
    <div className="weather-metric"><span><Sun size={16}/> Lumière du jour</span><strong className="weather-sun">{today.sunrise.slice(11,16)} – {today.sunset.slice(11,16)}</strong></div>
   </div>
   <div className="weather-hours-head"><span><CalendarDays size={15}/> Évolution horaire · {dayLabel(today.day)}</span><span className="hint">07 h – 20 h · heure de Paris</span></div>
   <div className="weather-hour-scroll"><div className="weather-hours">
    {hours.map(h=><div key={h.time} className="weather-hour"><span>{h.time.slice(11,16)}</span><strong>{num(h.temp)}°</strong><span><Wind size={13}/> {num(h.wind)}</span><small>Raf. {num(h.gust)}</small><span className="weather-hour-rain"><CloudRain size={12}/> {num(h.rain)}%</span></div>)}
   </div></div>
   <p className="weather-disclaimer"><AlertTriangle size={13}/> Prévisions indicatives à 10 m au-dessus du sol (vent). Ne constituent ni une autorisation de vol ni une validation de faisabilité. Vérifier les limites de l’aéronef et les bulletins actualisés. <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Données Open-Meteo</a>.</p>
  </>}
 </section>
}
