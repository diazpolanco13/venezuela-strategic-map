import { useState } from 'react'
import { VenezuelaMap } from './components/VenezuelaMap'
import { LocationPicker, type LocationData } from './components/LocationPicker'
import { SAMPLE_STATES } from './data/sampleStrategicMap'
import { MapPin, X } from 'lucide-react'

export default function App() {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerLocation, setPickerLocation] = useState<LocationData | null>(null)

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-shadow-800/80 border-b border-white/5 flex-shrink-0 min-w-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-neon-blue/20 border border-neon-blue/40 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neon-blue" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-display font-bold text-white tracking-wider truncate">VENEZUELA MAP</h1>
            <p className="text-[8px] sm:text-[9px] text-gray-600 font-mono hidden sm:block truncate">
              Mapa Estratégico Interactivo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            title="Location Picker"
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded text-[10px] sm:text-xs font-mono border transition-all
              ${showPicker
                ? 'bg-neon-green/20 border-neon-green/40 text-neon-green'
                : 'bg-shadow-700 border-white/10 text-gray-400 hover:text-white'}`}
          >
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">Location Picker</span>
            <span className="sm:hidden">Picker</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row relative min-w-0">
        <div className="flex-1 min-w-0 min-h-0 p-2 sm:p-3">
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
              className="fixed z-[3000] inset-x-0 bottom-0 top-[12%] sm:top-[18%] flex flex-col rounded-t-2xl border-t border-x border-white/10 bg-shadow-800/98 shadow-2xl overflow-hidden
                lg:static lg:z-auto lg:inset-auto lg:top-auto lg:rounded-none lg:border-t-0 lg:border-x-0 lg:border-l lg:shadow-none lg:w-96 lg:flex-shrink-0 lg:max-h-none lg:overflow-y-auto"
            >
              <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/5 flex-shrink-0">
                <h2 className="text-xs sm:text-sm font-display font-bold text-white">LOCATION PICKER</h2>
                <button type="button" onClick={() => setShowPicker(false)} className="text-gray-500 hover:text-white p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 pt-2">
                <p className="text-[10px] text-gray-500 font-mono mb-3 leading-relaxed">
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
    </div>
  )
}
