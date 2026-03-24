// Location Picker — Geolocalización interactiva con Leaflet + Nominatim

import { useState, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Search, MapPin, Crosshair, X, Loader2, Navigation } from 'lucide-react'

import { reverseGeocodeNominatim } from '../utils/nominatim'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

// ============================================
// TIPOS
// ============================================

export interface LocationCoordinates {
  lat: number
  lng: number
}

export interface LocationData {
  coordinates: LocationCoordinates | null
  address?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  displayName?: string
}

interface LocationPickerProps {
  value?: LocationData | null
  onChange: (location: LocationData | null) => void
  placeholder?: string
  height?: string
  defaultCenter?: LocationCoordinates
  defaultZoom?: number
  showSearch?: boolean
  showCurrentLocation?: boolean
  disabled?: boolean
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  address?: {
    road?: string
    house_number?: string
    city?: string
    town?: string
    village?: string
    state?: string
    country?: string
    postcode?: string
  }
}

function MapClickHandler({ onLocationSelect }: { onLocationSelect: (latlng: L.LatLng) => void }) {
  useMapEvents({ click(e) { onLocationSelect(e.latlng) } })
  return null
}

function MapCenterController({ center }: { center: LocationCoordinates | null }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.flyTo([center.lat, center.lng], map.getZoom(), { duration: 0.5 })
  }, [center, map])
  return null
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function LocationPicker({
  value,
  onChange,
  placeholder = 'Buscar dirección...',
  height = '300px',
  defaultCenter = { lat: 10.4806, lng: -66.9036 },
  defaultZoom = 5,
  showSearch = true,
  showCurrentLocation = true,
  disabled = false,
}: LocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [reverseGeocoding, setReverseGeocoding] = useState(false)
  const [locatingUser, setLocatingUser] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const searchAddress = useCallback(async (query: string) => {
    if (query.length < 3) { setSearchResults([]); return }
    setSearching(true)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'es',
            'User-Agent': 'VenezuelaStrategicMap/1.0 (https://github.com)',
          },
        },
      )
      const data: NominatimResult[] = await response.json()
      setSearchResults(data)
      setShowResults(true)
    } catch (error) {
      console.error('Error searching address:', error)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (searchQuery.length >= 3) {
      searchTimeoutRef.current = setTimeout(() => searchAddress(searchQuery), 500)
    } else {
      setSearchResults([])
    }
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [searchQuery, searchAddress])

  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<LocationData> => {
    setReverseGeocoding(true)
    try {
      const d = await reverseGeocodeNominatim(lat, lng)
      return {
        coordinates: { lat: d.lat, lng: d.lng },
        address: d.street,
        city: d.municipio,
        state: d.estado,
        country: d.pais,
        postalCode: d.codigoPostal,
        displayName: d.displayName,
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error)
      return { coordinates: { lat, lng } }
    } finally {
      setReverseGeocoding(false)
    }
  }, [])

  const handleMapClick = useCallback(async (latlng: L.LatLng) => {
    if (disabled) return
    const locationData = await reverseGeocode(latlng.lat, latlng.lng)
    onChange(locationData)
  }, [disabled, onChange, reverseGeocode])

  const handleSelectResult = useCallback((result: NominatimResult) => {
    const lat = parseFloat(result.lat)
    const lng = parseFloat(result.lon)
    const locationData: LocationData = {
      coordinates: { lat, lng },
      address: result.address?.road
        ? `${result.address.road}${result.address.house_number ? ' ' + result.address.house_number : ''}`
        : undefined,
      city: result.address?.city || result.address?.town || result.address?.village,
      state: result.address?.state,
      country: result.address?.country,
      postalCode: result.address?.postcode,
      displayName: result.display_name,
    }
    onChange(locationData)
    setSearchQuery('')
    setShowResults(false)
    setSearchResults([])
  }, [onChange])

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) { alert('Geolocalización no disponible'); return }
    setLocatingUser(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const locationData = await reverseGeocode(position.coords.latitude, position.coords.longitude)
        onChange(locationData)
        setLocatingUser(false)
      },
      (error) => {
        console.error('Error getting location:', error)
        alert('No se pudo obtener la ubicación actual')
        setLocatingUser(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [onChange, reverseGeocode])

  const clearLocation = useCallback(() => { onChange(null) }, [onChange])

  const mapCenter = value?.coordinates || defaultCenter

  return (
    <div className="space-y-2">
      {showSearch && (
        <div className="relative" ref={resultsRef}>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="input-dark w-full pl-10 pr-10 py-2 text-sm"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neon-blue animate-spin" />
            )}
          </div>
          {showResults && searchResults.length > 0 && (
            <div className="absolute z-[1000] w-full mt-1 bg-shadow-800 border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectResult(result)}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-shadow-700 hover:text-white transition-colors flex items-start gap-2 border-b border-white/5 last:border-0"
                >
                  <MapPin className="w-4 h-4 text-neon-blue flex-shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{result.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {showCurrentLocation && (
          <button
            type="button"
            onClick={getCurrentLocation}
            disabled={disabled || locatingUser}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-shadow-700 hover:bg-shadow-600 text-gray-300 hover:text-white rounded-lg text-xs font-mono transition-colors disabled:opacity-50"
          >
            {locatingUser ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
            Mi ubicación
          </button>
        )}
        {value?.coordinates && (
          <button
            type="button"
            onClick={clearLocation}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-red/10 hover:bg-neon-red/20 text-neon-red rounded-lg text-xs font-mono transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
        {reverseGeocoding && (
          <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Obteniendo dirección...
          </span>
        )}
      </div>

      <div className="rounded-lg overflow-hidden border border-white/10 relative" style={{ height }}>
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={value?.coordinates ? 15 : defaultZoom}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {!disabled && <MapClickHandler onLocationSelect={handleMapClick} />}
          <MapCenterController center={value?.coordinates || null} />
          {value?.coordinates && (
            <Marker position={[value.coordinates.lat, value.coordinates.lng]}>
              <Popup>
                <div className="text-sm">
                  <p className="font-bold text-gray-800">{value.displayName || 'Ubicación seleccionada'}</p>
                  <p className="text-gray-600 text-xs mt-1">
                    {value.coordinates.lat.toFixed(6)}, {value.coordinates.lng.toFixed(6)}
                  </p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
        {!disabled && !value?.coordinates && (
          <div className="absolute bottom-2 left-2 right-2 bg-black/70 text-white text-xs font-mono py-1.5 px-3 rounded flex items-center gap-2 z-[500]">
            <Crosshair className="w-3.5 h-3.5 text-neon-blue" />
            Haz clic en el mapa para seleccionar ubicación
          </div>
        )}
      </div>

      {value?.coordinates && (
        <div className="bg-shadow-800/50 rounded-lg p-3 border border-white/5">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-500 uppercase text-[10px]">Latitud</span>
              <p className="font-mono text-neon-blue">{value.coordinates.lat.toFixed(6)}</p>
            </div>
            <div>
              <span className="text-gray-500 uppercase text-[10px]">Longitud</span>
              <p className="font-mono text-neon-blue">{value.coordinates.lng.toFixed(6)}</p>
            </div>
          </div>
          {value.displayName && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <span className="text-gray-500 uppercase text-[10px]">Dirección</span>
              <p className="text-gray-300 text-xs mt-0.5 line-clamp-2">{value.displayName}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
