import { useState } from 'react'
import { VenezuelaMap } from './components/VenezuelaMap'
import { LocationPicker, type LocationData } from './components/LocationPicker'
import type { StateData, TerritorialSummary } from './config/types'
import { MapPin, X } from 'lucide-react'

// =============================================
// DATOS DE EJEMPLO
// =============================================

const SAMPLE_STATES: StateData[] = [
  { id: '1', name: 'Distrito Capital', org_count: 7, person_count: 34, criminal_count: 4, paramilitar_count: 1, narco_count: 2, capital: 'Caracas', population: 2082000, geo_center: { lat: 10.4806, lng: -66.9036 } },
  { id: '2', name: 'Miranda', org_count: 5, person_count: 22, criminal_count: 3, paramilitar_count: 0, narco_count: 1, capital: 'Los Teques', population: 3228000, geo_center: { lat: 10.2894, lng: -66.8024 } },
  { id: '3', name: 'La Guaira', org_count: 2, person_count: 8, criminal_count: 1, paramilitar_count: 0, narco_count: 1, capital: 'La Guaira', population: 373000, geo_center: { lat: 10.6015, lng: -66.9294 } },
  { id: '4', name: 'Aragua', org_count: 6, person_count: 18, criminal_count: 4, paramilitar_count: 1, narco_count: 2, capital: 'Maracay', population: 1856000, geo_center: { lat: 10.2338, lng: -67.5949 } },
  { id: '5', name: 'Carabobo', org_count: 5, person_count: 16, criminal_count: 3, paramilitar_count: 0, narco_count: 2, capital: 'Valencia', population: 2487000, geo_center: { lat: 10.1579, lng: -68.0078 } },
  { id: '6', name: 'Yaracuy', org_count: 2, person_count: 5, criminal_count: 1, paramilitar_count: 0, narco_count: 0, capital: 'San Felipe', population: 637000, geo_center: { lat: 10.3390, lng: -68.7411 } },
  { id: '7', name: 'Zulia', org_count: 8, person_count: 28, criminal_count: 5, paramilitar_count: 3, narco_count: 3, capital: 'Maracaibo', population: 4100000, geo_center: { lat: 10.0667, lng: -71.6333 } },
  { id: '8', name: 'Lara', org_count: 4, person_count: 12, criminal_count: 2, paramilitar_count: 1, narco_count: 1, capital: 'Barquisimeto', population: 1984000, geo_center: { lat: 10.0678, lng: -69.3467 } },
  { id: '9', name: 'Falcon', org_count: 3, person_count: 9, criminal_count: 2, paramilitar_count: 0, narco_count: 2, capital: 'Coro', population: 985000, geo_center: { lat: 11.4135, lng: -69.6741 } },
  { id: '10', name: 'Apure', org_count: 3, person_count: 7, criminal_count: 2, paramilitar_count: 2, narco_count: 1, capital: 'San Fernando', population: 529000, geo_center: { lat: 7.3000, lng: -69.6000 } },
  { id: '11', name: 'Guarico', org_count: 2, person_count: 6, criminal_count: 1, paramilitar_count: 0, narco_count: 0, capital: 'San Juan', population: 806000, geo_center: { lat: 8.7500, lng: -66.2333 } },
  { id: '12', name: 'Barinas', org_count: 2, person_count: 5, criminal_count: 1, paramilitar_count: 1, narco_count: 0, capital: 'Barinas', population: 879000, geo_center: { lat: 8.6232, lng: -70.2372 } },
  { id: '13', name: 'Cojedes', org_count: 1, person_count: 3, criminal_count: 1, paramilitar_count: 0, narco_count: 0, capital: 'San Carlos', population: 356000, geo_center: { lat: 9.6500, lng: -68.5833 } },
  { id: '14', name: 'Portuguesa', org_count: 2, person_count: 4, criminal_count: 1, paramilitar_count: 0, narco_count: 1, capital: 'Guanare', population: 960000, geo_center: { lat: 9.0439, lng: -69.7422 } },
  { id: '15', name: 'Merida', org_count: 1, person_count: 4, criminal_count: 0, paramilitar_count: 0, narco_count: 0, capital: 'Mérida', population: 927000, geo_center: { lat: 8.5896, lng: -71.1558 } },
  { id: '16', name: 'Tachira', org_count: 5, person_count: 15, criminal_count: 3, paramilitar_count: 2, narco_count: 2, capital: 'San Cristóbal', population: 1272000, geo_center: { lat: 7.7667, lng: -72.2333 } },
  { id: '17', name: 'Trujillo', org_count: 1, person_count: 3, criminal_count: 0, paramilitar_count: 0, narco_count: 0, capital: 'Trujillo', population: 748000, geo_center: { lat: 9.3639, lng: -70.4267 } },
  { id: '18', name: 'Anzoategui', org_count: 4, person_count: 14, criminal_count: 2, paramilitar_count: 0, narco_count: 1, capital: 'Barcelona', population: 1657000, geo_center: { lat: 8.5919, lng: -63.9572 } },
  { id: '19', name: 'Monagas', org_count: 3, person_count: 9, criminal_count: 2, paramilitar_count: 0, narco_count: 1, capital: 'Maturín', population: 997000, geo_center: { lat: 9.7457, lng: -63.1830 } },
  { id: '20', name: 'Sucre', org_count: 2, person_count: 6, criminal_count: 1, paramilitar_count: 0, narco_count: 1, capital: 'Cumaná', population: 987000, geo_center: { lat: 10.4500, lng: -63.2333 } },
  { id: '21', name: 'Bolivar', org_count: 6, person_count: 20, criminal_count: 4, paramilitar_count: 1, narco_count: 2, capital: 'Ciudad Bolívar', population: 1824000, geo_center: { lat: 6.8000, lng: -63.5000 } },
  { id: '22', name: 'Amazonas', org_count: 2, person_count: 5, criminal_count: 1, paramilitar_count: 1, narco_count: 1, capital: 'Puerto Ayacucho', population: 181000, geo_center: { lat: 3.4167, lng: -65.8500 } },
  { id: '23', name: 'Delta Amacuro', org_count: 1, person_count: 3, criminal_count: 1, paramilitar_count: 0, narco_count: 0, capital: 'Tucupita', population: 187000, geo_center: { lat: 9.0583, lng: -62.0500 } },
  { id: '24', name: 'Nueva Esparta', org_count: 2, person_count: 7, criminal_count: 1, paramilitar_count: 0, narco_count: 1, capital: 'La Asunción', population: 491000, geo_center: { lat: 11.0000, lng: -63.9167 } },
  { id: '25', name: 'Guayana Esequiba', org_count: 0, person_count: 0, criminal_count: 0, paramilitar_count: 0, narco_count: 0, capital: '', region: 'REDI GUAYANA', geo_center: { lat: 5.5, lng: -59.2 } },
]

const SAMPLE_SUMMARY: TerritorialSummary = {
  total_orgs: 91,
  active_orgs: 68,
  criminal_orgs: 52,
  foreign_orgs: 12,
}

// =============================================
// APP DEMO
// =============================================

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
            summary={SAMPLE_SUMMARY}
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
