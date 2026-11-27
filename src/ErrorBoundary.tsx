import {Component,type ErrorInfo,type ReactNode} from 'react'
type State={error:Error|null}
export class ErrorBoundary extends Component<{children:ReactNode},State>{
 state:State={error:null}
 static getDerivedStateFromError(error:Error):State{return {error}}
 componentDidCatch(error:Error,info:ErrorInfo){console.error('EMPRISES rendering error',error,info.componentStack)}
 render(){
  if(!this.state.error)return this.props.children
  return <main className="app-fatal" role="alert"><div><h1>EMPRISES — affichage interrompu</h1><p>Une erreur empêche l'affichage de cette page. Tes données déjà enregistrées dans Supabase ne sont pas effacées.</p><p className="hint">Détail technique : {this.state.error.message}</p><button onClick={()=>window.location.reload()}>Recharger EMPRISES</button></div></main>
 }
}
