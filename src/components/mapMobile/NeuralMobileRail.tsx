import type { ReactNode } from 'react'
import { Menu, Layers, Waypoints, Settings, ChevronLeft } from 'lucide-react'

type NeuralMobileRailProps = {
  /** Carril expandido (por defecto oculto en el padre). */
  open: boolean
  onOpenChange: (open: boolean) => void
  showTerritoryPanel: boolean
  onMenu: () => void
  onLayers: () => void
  onToggleRedi: () => void
  onSettings: () => void
  rediActive: boolean
  /** Panel territorios (sidebar) visible — resalta el menú hamburguesa. */
  territorySidebarOpen: boolean
  layersButtonVisible: boolean
}

function RailBtn({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void
  title: string
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex w-full flex-col items-center justify-center gap-1 border-0 bg-transparent py-2.5 px-0.5 transition-colors
        ${active ? 'bg-cyan-500/15 text-cyan-100' : 'text-gray-400 hover:bg-white/[0.06] hover:text-cyan-200/90'}
        border-l-[3px] ${active ? 'border-l-cyan-400' : 'border-l-transparent'}`}
    >
      {children}
    </button>
  )
}

/** Carril izquierdo (solo &lt;lg): colapsado por defecto; se despliega con el botón flotante. */
export function NeuralMobileRail({
  open,
  onOpenChange,
  showTerritoryPanel,
  onMenu,
  onLayers,
  onToggleRedi,
  onSettings,
  rediActive,
  territorySidebarOpen,
  layersButtonVisible,
}: NeuralMobileRailProps) {
  /** Colapsado: sin pestaña flotante; se abre desde la barra inferior «Explorar». */
  if (!open) return null

  return (
    <nav
      id="neural-map-rail"
      className="pointer-events-auto absolute left-0 top-0 z-[2190] hidden h-[calc(100%-3.5rem)] w-12 flex-col border-r border-cyan-500/20 bg-shadow-900/98 shadow-[4px_0_24px_rgba(0,0,0,0.35)] backdrop-blur-md max-lg:flex"
      aria-label="Navegación del mapa"
    >
      <div className="flex flex-shrink-0 flex-col items-center gap-1 border-b border-white/10 py-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          title="Ocultar barra lateral"
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-cyan-300"
          aria-label="Ocultar barra lateral"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onMenu}
          disabled={!showTerritoryPanel}
          title={showTerritoryPanel ? 'Lista de territorios' : 'Territorios no disponible'}
          aria-pressed={territorySidebarOpen}
          className={`rounded-md p-2 transition-colors disabled:pointer-events-none disabled:opacity-35
            ${territorySidebarOpen ? 'bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/40' : 'text-cyan-200/90 hover:bg-white/10'}`}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-0.5 py-1">
        {layersButtonVisible && (
          <RailBtn onClick={onLayers} title="Capas del mapa" active={false}>
            <Layers className="h-4 w-4 flex-shrink-0 text-sky-300" aria-hidden />
            <span
              className="max-h-[4.5rem] text-[8px] font-mono font-bold uppercase leading-tight tracking-wider text-sky-200/90"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              Capas
            </span>
          </RailBtn>
        )}
        <RailBtn onClick={onToggleRedi} title="Capa REDI" active={rediActive}>
          <Waypoints className="h-4 w-4 flex-shrink-0 text-neon-blue" aria-hidden />
          <span
            className="max-h-[5rem] text-[7px] font-mono font-bold uppercase leading-tight tracking-wider text-neon-blue/90"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            REDI
          </span>
        </RailBtn>
      </div>

      <div className="flex flex-shrink-0 flex-col items-center border-t border-white/10 py-2">
        <button
          type="button"
          onClick={onSettings}
          title="Ajustes rápidos de capas"
          className="rounded-md p-2 text-gray-500 transition-colors hover:bg-white/10 hover:text-cyan-300"
        >
          <Settings className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </nav>
  )
}
