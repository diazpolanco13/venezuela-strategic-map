import { useState } from 'react'
import { VenezuelaMap } from './components/VenezuelaMap'
import { LocationPicker, type LocationData } from './components/LocationPicker'
import { SAMPLE_STATES } from './data/sampleStrategicMap'
import { MapPin, X, Search, Bell, Settings, CircleUser } from 'lucide-react'
import { TacticalHudProvider, useTacticalHud } from './context/TacticalHudContext'

type AppHeaderProps = {
  showPicker: boolean
  setShowPicker: (v: boolean) => void
  pickerLocation: LocationData | null
  setPickerLocation: (v: LocationData | null) => void
}

function AppHeader({ showPicker, setShowPicker, pickerLocation, setPickerLocation }: AppHeaderProps) {
  const hud = useTacticalHud()

  return (
    <>
      <header className="tactical-web-strip flex min-w-0 flex-shrink-0 flex-col backdrop-blur-md">
        {/* Móvil / tablet */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 sm:px-4 sm:py-2 lg:hidden">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-cyan-400/35 bg-black/50 shadow-[0_0_16px_rgba(34,211,238,0.12)] sm:h-8 sm:w-8">
              <MapPin className="h-3.5 w-3.5 text-cyan-300 sm:h-4 sm:w-4 tactical-title-glow" />
            </div>
            <div className="min-w-0">
              <h1 className="tactical-title-glow truncate text-xs font-display font-bold uppercase tracking-[0.14em] text-white sm:text-sm">
                VENEZUELA MAP
              </h1>
              <p className="hidden truncate font-mono text-[8px] uppercase tracking-widest text-cyan-500/55 sm:block sm:text-[9px]">
                Mapa estratégico interactivo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            title="Location Picker"
            className={`flex items-center gap-1.5 rounded border px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-all sm:px-3 sm:text-xs
              ${showPicker
                ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.2)]'
                : 'tactical-toggle-idle border-cyan-500/15 hover:text-gray-200'}`}
          >
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">Location Picker</span>
            <span className="sm:hidden">Picker</span>
          </button>
        </div>

        {/* Escritorio — referencia VENEZUELA_TACTICAL_GEO */}
        <div className="hidden min-h-[3.25rem] items-center gap-4 px-4 py-2 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-6">
          <div className="flex min-w-0 items-center gap-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded border border-cyan-400/35 bg-black/55 shadow-[0_0_20px_rgba(0,242,255,0.12)]">
                <MapPin className="h-4 w-4 text-cyan-300 tactical-title-glow" aria-hidden />
              </div>
              <div className="min-w-0">
                <h1 className="tactical-title-glow truncate font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">
                  VENEZUELA_TACTICAL_GEO
                </h1>
                <p className="truncate font-mono text-[8px] uppercase tracking-[0.18em] text-slate-500">
                  Mapa estratégico · consola C2
                </p>
              </div>
            </div>
            <nav
              className="hidden min-w-0 flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500 xl:flex"
              aria-label="Estado del sistema"
            >
              <span className="whitespace-nowrap text-emerald-500/80" title="Subsistemas">
                System_status · nominal
              </span>
              <span className="max-w-[11rem] truncate text-cyan-500/70" title="Cursor sobre el mapa">
                Coordinates ·{' '}
                {hud?.cursor != null
                  ? `${hud.cursor.lat.toFixed(5)} · ${hud.cursor.lng.toFixed(5)}`
                  : '—'}
              </span>
              <span className="whitespace-nowrap text-slate-600">Uptime · {hud?.uptime ?? '—'}</span>
            </nav>
          </div>

          <div className="flex min-w-0 items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => hud?.focusDesktopSearch()}
              className="tactical-hud-glass flex max-w-md min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:border-cyan-400/35 hover:bg-black/40"
              title="Enfocar búsqueda en el mapa"
            >
              <Search className="h-3.5 w-3.5 flex-shrink-0 text-cyan-400/80" aria-hidden />
              <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                Buscar zonas operativas…
              </span>
            </button>
            <span className="tactical-hud-glass hidden items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 font-mono text-[8px] uppercase tracking-wider text-cyan-300 shadow-[0_0_14px_rgba(0,242,255,0.15)] sm:inline-flex">
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(0,242,255,0.95)]"
                aria-hidden
              />
              System_online
            </span>
          </div>

          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              className="rounded-md border border-transparent p-2 text-cyan-500/50 transition-colors hover:border-cyan-500/25 hover:bg-white/[0.04] hover:text-cyan-300"
              title="Alertas (próximamente)"
              aria-label="Alertas"
            >
              <Bell className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-md border border-transparent p-2 text-cyan-500/50 transition-colors hover:border-cyan-500/25 hover:bg-white/[0.04] hover:text-cyan-300"
              title="Ajustes (próximamente)"
              aria-label="Ajustes"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-md border border-transparent p-2 text-cyan-500/50 transition-colors hover:border-cyan-500/25 hover:bg-white/[0.04] hover:text-cyan-300"
              title="Perfil (próximamente)"
              aria-label="Perfil"
            >
              <CircleUser className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowPicker(!showPicker)}
              title="Location Picker"
              className={`ml-1 flex items-center gap-1.5 rounded border px-2.5 py-2 font-mono text-[9px] uppercase tracking-wider transition-all
                ${showPicker
                  ? 'border-cyan-400/55 bg-cyan-500/15 text-cyan-100 shadow-[0_0_16px_rgba(0,242,255,0.18)]'
                  : 'border-cyan-500/20 bg-black/40 text-cyan-500/70 hover:border-cyan-400/40 hover:text-cyan-200'}`}
            >
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              Geo_pick
            </button>
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 p-2 sm:p-3">
          <VenezuelaMap
            stateData={SAMPLE_STATES}
            onStateClick={(state) => console.log('State clicked:', state.name)}
          />
        </div>

        {showPicker && (
          <>
            <button
              type="button"
              aria-label="Cerrar panel"
              className="fixed inset-0 z-[2990] bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={() => setShowPicker(false)}
            />
            <div
              className="fixed inset-x-0 bottom-0 top-[12%] z-[3000] flex flex-col overflow-hidden rounded-t-2xl border-x border-t border-white/10 bg-shadow-800/98 shadow-2xl sm:top-[18%]
                lg:static lg:z-auto lg:inset-auto lg:top-auto lg:max-h-none lg:w-96 lg:flex-shrink-0 lg:overflow-y-auto lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-l lg:border-cyan-500/20 lg:bg-[linear-gradient(180deg,rgba(8,10,14,0.96)_0%,rgba(5,7,11,0.98)_100%)] lg:shadow-[-8px_0_40px_rgba(0,0,0,0.35)]"
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-cyan-500/15 bg-black/30 p-3 sm:p-4 lg:border-white/10">
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-200 sm:text-sm">Location picker</h2>
                <button type="button" onClick={() => setShowPicker(false)} className="p-1 text-gray-500 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pt-2 sm:p-4">
                <p className="mb-3 font-mono text-[10px] leading-relaxed text-gray-500">
                  Geolocalización con búsqueda, clic en mapa y reverse geocoding.
                </p>
                <LocationPicker
                  value={pickerLocation}
                  onChange={setPickerLocation}
                  height="min(40vh,320px)"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

export default function App() {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerLocation, setPickerLocation] = useState<LocationData | null>(null)

  return (
    <TacticalHudProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <AppHeader
          showPicker={showPicker}
          setShowPicker={setShowPicker}
          pickerLocation={pickerLocation}
          setPickerLocation={setPickerLocation}
        />
      </div>
    </TacticalHudProvider>
  )
}
