import { Compass, Layers, BarChart3, Navigation } from 'lucide-react'

export type NeuralMobileNavTab = 'explore' | 'legend' | 'analytics' | 'vital'

type NeuralMobileBottomNavProps = {
  active: NeuralMobileNavTab
  onChange: (tab: NeuralMobileNavTab) => void
  showAnalytics: boolean
  showVital: boolean
}

const item = (isActive: boolean) =>
  `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[8px] font-mono font-semibold uppercase tracking-wide transition-colors
  ${isActive ? 'text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.45)]' : 'text-gray-500 hover:text-gray-300'}`

/** Barra inferior fija (solo &lt;lg), estilo propuesta NEURAL_MAP. */
export function NeuralMobileBottomNav({ active, onChange, showAnalytics, showVital }: NeuralMobileBottomNavProps) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[2195] hidden h-14 flex-shrink-0 border-t border-cyan-500/25 bg-shadow-900/98 shadow-[0_-8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md max-lg:flex"
      role="tablist"
      aria-label="Modos del mapa"
    >
      <button type="button" role="tab" aria-selected={active === 'explore'} className={item(active === 'explore')} onClick={() => onChange('explore')}>
        <Compass className={`h-5 w-5 ${active === 'explore' ? 'text-cyan-400' : ''}`} aria-hidden />
        Explorar
      </button>
      <button type="button" role="tab" aria-selected={active === 'legend'} className={item(active === 'legend')} onClick={() => onChange('legend')}>
        <Layers className={`h-5 w-5 ${active === 'legend' ? 'text-cyan-400' : ''}`} aria-hidden />
        Leyenda
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'analytics'}
        disabled={!showAnalytics}
        title={showAnalytics ? 'Resumen de métricas' : 'Sin métricas globales'}
        className={`${item(active === 'analytics')} ${!showAnalytics ? 'opacity-40 pointer-events-none' : ''}`}
        onClick={() => showAnalytics && onChange('analytics')}
      >
        <BarChart3 className={`h-5 w-5 ${active === 'analytics' ? 'text-cyan-400' : ''}`} aria-hidden />
        Datos
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'vital'}
        disabled={!showVital}
        title={showVital ? 'Ver geolocalización y tu posición en el mapa' : 'Geolocalización no disponible'}
        className={`${item(active === 'vital')} ${!showVital ? 'opacity-40 pointer-events-none' : ''}`}
        onClick={() => showVital && onChange('vital')}
      >
        <Navigation className={`h-5 w-5 ${active === 'vital' ? 'text-cyan-400' : ''}`} aria-hidden />
        Ubicación
      </button>
    </div>
  )
}
