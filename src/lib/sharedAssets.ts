import {supabase} from './supabase'

// Identical public brand assets for every user, browser and workstation.
// No per-browser storage or customer/private mission data is published.
export const BRAND_BUCKET='emprises-brand-assets'
export type BrandAsset='cover/illiwap-cover'|'logos/naldeo-logo'|'logos/rhotor-logo'

export async function getBrandAsset(path:BrandAsset):Promise<string|null>{
 if(!supabase)return null
 const {data}=supabase.storage.from(BRAND_BUCKET).getPublicUrl(path)
 if(!data?.publicUrl)return null
 try{
  // A public URL is returned even before a file exists; verify existence.
  const resp=await fetch(data.publicUrl,{method:'HEAD',cache:'no-store'})
  return resp.ok?data.publicUrl:null
 }catch{return null}
}

export async function saveBrandAsset(path:BrandAsset,file:File):Promise<string>{
 if(!supabase)throw new Error('Connexion à Supabase indisponible.')
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Fichier JPG, PNG ou WebP requis.')
 if(file.size>15*1024*1024)throw new Error('Image trop volumineuse (15 Mo maximum).')
 const {error}=await supabase.storage.from(BRAND_BUCKET).upload(path,file,{upsert:true,contentType:file.type,cacheControl:'60'})
 if(error)throw new Error(error.message)
 const {data}=supabase.storage.from(BRAND_BUCKET).getPublicUrl(path)
 return data.publicUrl+'?v='+Date.now()
}
