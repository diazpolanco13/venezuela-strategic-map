// Mapa Estratégico de Venezuela
// Leaflet + GeoJSON: estados (ADM1) + municipios (ADM2) + parroquias (ADM3) + Guayana Esequiba

import { useState, useEffect, useCallback, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Users, ChevronRight, ChevronLeft, ChevronDown,
  Eye, X, Loader2, Layers, LayoutGrid, Search,
  Navigation, Clipboard, Share2, Globe2, Map as MapIcon, Waypoints, BarChart3,
  Crosshair, Filter, Plus, LogOut, MapPinned,
} from 'lucide-react'
import { NeuralMobileRail } from './mapMobile/NeuralMobileRail'
import { NeuralMobileBottomNav, type NeuralMobileNavTab } from './mapMobile/NeuralMobileBottomNav'
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import type { Layer } from 'leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { DEFAULT_VENEZUELA_GEO_URLS } from '../config/mapAssets'
import { REDI_COLORS, REDI_ORDER, getStateRedi, normalizeName } from '../config/redi'
import { ESEQUIBO_GEOJSON } from '../config/esequibo'
import type { StateData, MapMarker, VenezuelaMapProps } from '../config/types'
import type { ReverseGeoDetail } from '../utils/nominatim'
import {
  formatDeviceCaptureDateTime,
  formatLocationForClipboard,
  openStreetMapUrl,
  reverseGeocodeNominatim,
} from '../utils/nominatim'
import {
  findMunicipalityContaining,
  findParishContaining,
  municipalityGidFromParishParent,
} from '../utils/geoHitTest'
import {
  computePaneZIndices,
  DEFAULT_MAP_LAYER_ORDER,
  normalizeLayerOrder,
  type StackableMapLayerId,
} from '../config/mapLayerStack'
import { MapLayerManager, type MapLayerVisibility } from './MapLayerManager'
import { useTacticalHud, type TacticalCursor } from '../context/TacticalHudContext'
import {
  buildTerritoryIndex,
  searchTerritory,
  stateTerritoryKey,
  territorySearchQueryNorm,
  type MunicipioIndexItem,
  type ParishIndexItem,
  type SearchHit,
} from '../utils/territoryIndex'

/** Vuelo del mapa: punto o encuadre por límites (menos zoom “violento”). */
type MapFlyRequest =
  | { kind: 'point'; center: [number, number]; zoom: number; duration?: number }
  | {
      kind: 'bounds'
      southWest: [number, number]
      northEast: [number, number]
      padding?: [number, number]
      maxZoom?: number
      duration?: number
    }

const REDI_GUAYANA_COLOR = REDI_COLORS['REDI GUAYANA']

function muniExpandKey(stateId: string, muniNorm: string) {
  return `${stateId}::${muniNorm}`
}

const geoCache: Record<string, any> = {}
async function fetchGeoJSON(url: string) {
  if (geoCache[url]) return geoCache[url]
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed: ${res.status}`)
  const data = await res.json()
  geoCache[url] = data
  return data
}

function MapController({ fly }: { fly: MapFlyRequest | null }) {
  const map = useMap()
  useEffect(() => {
    if (!fly) return
    if (fly.kind === 'bounds') {
      const b = L.latLngBounds(fly.southWest, fly.northEast)
      map.flyToBounds(b, {
        padding: fly.padding ?? [56, 56],
        duration: fly.duration ?? 1.5,
        maxZoom: fly.maxZoom ?? 10,
      })
      return
    }
    map.flyTo(fly.center, fly.zoom, { duration: fly.duration ?? 1.15 })
  }, [fly, map])
  return null
}

function MapZoomSync({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap()
  useEffect(() => {
    const fn = () => onZoom(map.getZoom())
    map.on('zoomend', fn)
    fn()
    return () => {
      map.off('zoomend', fn)
    }
  }, [map, onZoom])
  return null
}

/** Leaflet guarda ancho al montar; al cerrar el panel hay que recalcular o queda un vacío negro. */
function MapInvalidateWhenSidebarChanges({ sidebarOpen }: { sidebarOpen: boolean }) {
  const map = useMap()
  useEffect(() => {
    const refresh = () => {
      map.invalidateSize()
    }
    refresh()
    const t1 = window.setTimeout(refresh, 80)
    const t2 = window.setTimeout(refresh, 350)
    window.addEventListener('resize', refresh)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('resize', refresh)
    }
  }, [map, sidebarOpen])
  return null
}

/** Aplica z-index por pane según el orden de capas definido por el usuario. */
function MapLayerPanes({ zByPane }: { zByPane: Record<string, string> }) {
  const map = useMap()
  useEffect(() => {
    const names = ['venCountry', 'venStates', 'venEsequibo', 'venMuni', 'venParish', 'venRedi'] as const
    for (const name of names) {
      const el = map.getPane(name) ?? map.createPane(name)
      const z = zByPane[name]
      if (z != null) el.style.zIndex = z
      if (name === 'venCountry') el.style.pointerEvents = 'none'
      else el.style.pointerEvents = ''
    }
  }, [map, zByPane])
  return null
}

/** Cursor + centro del mapa → cabecera HUD / barra inferior. */
function MapHudBridges() {
  const hud = useTacticalHud()
  const map = useMap()
  /** No incluir `hud` en deps del efecto: el valor del contexto cambia identidad en cada setState y re-dispararía el efecto en bucle. */
  const setCursorRef = useRef(hud?.setCursor)
  const setMapCenterRef = useRef(hud?.setMapCenter)
  setCursorRef.current = hud?.setCursor
  setMapCenterRef.current = hud?.setMapCenter

  const lastCursorRef = useRef<TacticalCursor | null>(null)
  useMapEvents({
    mousemove(e) {
      const setC = setCursorRef.current
      if (!setC) return
      const lat = e.latlng.lat
      const lng = e.latlng.lng
      const p = lastCursorRef.current
      if (p != null && Math.abs(p.lat - lat) < 1e-5 && Math.abs(p.lng - lng) < 1e-5) return
      lastCursorRef.current = { lat, lng }
      setC({ lat, lng })
    },
    mouseout() {
      lastCursorRef.current = null
      setCursorRef.current?.(null)
    },
  })

  const lastCenterRef = useRef<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    const setMapCenter = setMapCenterRef.current
    if (!setMapCenter) return
    const sync = () => {
      const c = map.getCenter()
      const lat = c.lat
      const lng = c.lng
      const p = lastCenterRef.current
      if (p != null && Math.abs(p.lat - lat) < 1e-7 && Math.abs(p.lng - lng) < 1e-7) return
      lastCenterRef.current = { lat, lng }
      setMapCenter({ lat, lng })
    }
    sync()
    map.on('moveend', sync)
    return () => {
      map.off('moveend', sync)
    }
  }, [map])
  return null
}

/**
 * Móvil: desplaza el mapa para que el marcador GPS quede más arriba en el viewport
 * (mejor centrado visual sobre el área libre encima de la tarjeta «Tu ubicación»).
 */
function MapMyLocationMobileFraming({ lat, lng, active }: { lat: number; lng: number; active: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (!active) return
    if (typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches) return

    let cancelled = false
    const nudge = () => {
      if (cancelled) return
      const ll = L.latLng(lat, lng)
      if (!map.getBounds().contains(ll)) return
      const pt = map.latLngToContainerPoint(ll)
      const h = map.getSize().y
      const w = map.getSize().x
      if (w < 80 || h < 120) return
      const targetY = h * 0.33
      const dy = pt.y - targetY
      if (Math.abs(dy) < 16) return
      map.panBy(L.point(0, dy), { animate: true, duration: 0.38 })
    }

    const t1 = window.setTimeout(nudge, 480)
    const t2 = window.setTimeout(nudge, 1100)
    const t3 = window.setTimeout(nudge, 1900)

    return () => {
      cancelled = true
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [active, lat, lng, map])

  return null
}

type TacticalRailMode = 'map' | 'layers' | 'nodes'

function TacticalDesktopRail({
  mode,
  showTerritoryPanel,
  onSelectMap,
  onSelectLayers,
  onSelectNodes,
  onHome,
}: {
  mode: TacticalRailMode
  showTerritoryPanel: boolean
  onSelectMap: () => void
  onSelectLayers: () => void
  onSelectNodes: () => void
  onHome: () => void
}) {
  const railBtn = (active: boolean) =>
    `group flex w-full items-center justify-center border-l-2 py-3 transition-all ${
      active
        ? 'border-cyan-400 bg-cyan-500/[0.07] text-cyan-200 shadow-[inset_0_0_24px_rgba(0,242,255,0.07)]'
        : 'border-transparent text-cyan-600/45 hover:border-cyan-500/30 hover:bg-white/[0.03] hover:text-cyan-300/90'
    }`
  return (
    <aside
      className="hidden w-[50px] flex-shrink-0 flex-col border-r border-cyan-500/20 bg-[rgba(3,5,9,0.94)] backdrop-blur-md lg:flex"
      aria-label="Módulos tácticos"
    >
      <div className="flex flex-1 flex-col gap-0.5 py-2">
        <button
          type="button"
          className={railBtn(mode === 'map')}
          onClick={onSelectMap}
          title="Vista mapa"
          aria-label="Vista mapa"
        >
          <MapIcon className="h-5 w-5" strokeWidth={1.35} />
        </button>
        <button
          type="button"
          className={railBtn(mode === 'layers')}
          onClick={onSelectLayers}
          title="Capas y orden"
          aria-label="Capas"
        >
          <Layers className="h-5 w-5" strokeWidth={1.35} />
        </button>
        {showTerritoryPanel && (
          <button
            type="button"
            className={railBtn(mode === 'nodes')}
            onClick={onSelectNodes}
            title="Lista de territorios"
            aria-label="Territorios"
          >
            <MapPinned className="h-5 w-5" strokeWidth={1.35} />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5 border-t border-cyan-500/15 py-2">
        <button type="button" className={railBtn(false)} onClick={onHome} title="Encuadre Venezuela" aria-label="Encuadre Venezuela">
          <Plus className="h-5 w-5" strokeWidth={1.35} />
        </button>
        <button type="button" className={railBtn(false)} onClick={onHome} title="Restablecer vista" aria-label="Restablecer vista">
          <LogOut className="h-4 w-4" strokeWidth={1.35} />
        </button>
      </div>
    </aside>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function metricValue(state: StateData, metricId: string): number {
  return state.metrics?.find(m => m.id === metricId)?.value ?? 0
}

/** Nombres GADM (p. ej. AltoOrinoco) → texto legible */
function formatMunicipalityName(raw: string): string {
  if (!raw || raw === 'NA') return 'Sin nombre'
  let t = raw.replace(/_/g, ' ')
  t = t.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
  return t.replace(/\s+/g, ' ').trim()
}

function RediLegendInner({
  showRediLayer,
  showMunicipalities,
  showParishes,
}: {
  showRediLayer: boolean
  showMunicipalities: boolean
  showParishes: boolean
}) {
  return (
    <>
      {showRediLayer && (
        <>
          <span className="text-[9px] text-gray-500 font-mono block mb-1.5">REDI — Regiones Estratégicas</span>
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-x-3 gap-y-1.5">
            {REDI_ORDER.map(redi => (
              <div key={redi} className="flex items-start gap-1.5 min-w-0">
                <div
                  className="w-2 h-2 rounded-sm flex-shrink-0 mt-0.5"
                  style={{ background: REDI_COLORS[redi], boxShadow: `0 0 4px ${REDI_COLORS[redi]}66` }}
                />
                <span className="text-[8px] text-gray-400 leading-snug break-words">{redi}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {showMunicipalities && (
        <div className="mt-1.5 pt-1.5 border-t border-white/5 space-y-1">
          <div className="text-[8px] text-neon-purple font-mono">Capa municipios · clic o hover</div>
          <div className="text-[7px] text-gray-500 font-mono leading-snug">
            Zoom ≥ 10: nombres en mapa. Menos zoom: tooltip al pasar el cursor.
          </div>
        </div>
      )}
      {showParishes && (
        <div className="mt-1.5 pt-1.5 border-t border-white/5 space-y-1">
          <div className="text-[8px] text-cyan-400/90 font-mono">Capa parroquias (ADM3)</div>
          <div className="text-[7px] text-gray-500 font-mono leading-snug">
            Zoom ≥ 11: nombres en mapa. Capa encima de municipios si ambas activas.
          </div>
        </div>
      )}
      {showRediLayer && (
        <div className="mt-1.5 pt-1.5 border-t border-white/5 flex items-start gap-1.5">
          <div
            className="w-3 h-2 rounded-sm flex-shrink-0 mt-0.5"
            style={{ background: REDI_GUAYANA_COLOR, boxShadow: `0 0 6px ${REDI_GUAYANA_COLOR}66` }}
          />
          <span
            className="text-[7px] sm:text-[8px] font-mono leading-snug break-words"
            style={{ color: REDI_GUAYANA_COLOR }}
          >
            Guayana Esequiba · REDI GUAYANA
          </span>
        </div>
      )}
      {!showRediLayer && !showMunicipalities && !showParishes && (
        <p className="text-[8px] text-gray-500 font-mono leading-snug mt-1">
          Activa «REDI» para ver la agrupación estratégica. «Estados» muestra límites sin colores REDI.
        </p>
      )}
    </>
  )
}

export function VenezuelaMap({
  stateData,
  summaryMetrics,
  markers = [],
  onStateClick,
  onStateNavigate,
  showCountrySilhouetteDefault = true,
  showStatesLayerDefault = false,
  showRediLayerDefault = false,
  showMunicipalitiesDefault = false,
  showMarkersDefault = true,
  className = '',
  mapTitle = 'TERRITORIO VENEZUELA',
  mapSubtitle = 'Mapa estratégico',
  geoUrls: geoUrlsProp,
  ui = {},
}: VenezuelaMapProps) {
  const geo = useMemo(
    () => ({
      countryOutline:
        geoUrlsProp?.countryOutline ?? DEFAULT_VENEZUELA_GEO_URLS.countryOutline,
      states: geoUrlsProp?.states ?? DEFAULT_VENEZUELA_GEO_URLS.states,
      municipalities: geoUrlsProp?.municipalities ?? DEFAULT_VENEZUELA_GEO_URLS.municipalities,
      parishes: geoUrlsProp?.parishes ?? DEFAULT_VENEZUELA_GEO_URLS.parishes,
    }),
    [
      geoUrlsProp?.countryOutline,
      geoUrlsProp?.states,
      geoUrlsProp?.municipalities,
      geoUrlsProp?.parishes,
    ],
  )

  const summaryToolbarItems = summaryMetrics ?? []

  const showSummaryToolbar =
    summaryToolbarItems.length > 0 && ui.showSummaryToolbar !== false
  const showTerritoryPanel = ui.showTerritoryPanel !== false
  const showMapSearch = ui.showMapSearch !== false
  const showGeolocation = ui.showGeolocation !== false

  const metricSortOptions = useMemo(() => {
    const labels = new Map<string, string>()
    for (const s of stateData) {
      for (const m of s.metrics ?? []) {
        if (!labels.has(m.id)) labels.set(m.id, m.label)
      }
    }
    return [...labels.entries()]
  }, [stateData])

  useEffect(() => {
    if (!showTerritoryPanel) setSidebarOpen(false)
  }, [showTerritoryPanel])

  const [selectedState, setSelectedState] = useState<StateData | null>(null)
  const [selectedMunicipality, setSelectedMunicipality] = useState<{
    gid: string
    municipality: string
    state: string
  } | null>(null)
  const [selectedParish, setSelectedParish] = useState<{
    pcode: string
    parish: string
    municipality: string
    state: string
  } | null>(null)
  const [mapZoom, setMapZoom] = useState(5.5)
  const selectedMunicipalityRef = useRef(selectedMunicipality)
  selectedMunicipalityRef.current = selectedMunicipality
  const selectedParishRef = useRef(selectedParish)
  selectedParishRef.current = selectedParish
  /** Un solo tooltip hover a la vez (mouseout entre polígonos adyacentes no siempre llega a tiempo). */
  const parishHoverTooltipLayerRef = useRef<Layer | null>(null)
  const municipalityHoverTooltipLayerRef = useRef<Layer | null>(null)
  const [sortBy, setSortBy] = useState<string>('name')

  useEffect(() => {
    if (sortBy.startsWith('metric:')) {
      const id = sortBy.slice('metric:'.length)
      if (!metricSortOptions.some(([mid]) => mid === id)) setSortBy('name')
    }
  }, [metricSortOptions, sortBy])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [territorialSearchQuery, setTerritorialSearchQuery] = useState('')
  const [mapSearchOpen, setMapSearchOpen] = useState(false)
  const [searchHighlightIdx, setSearchHighlightIdx] = useState(0)
  const mapSearchRef = useRef<HTMLDivElement>(null)
  const [expandedStateIds, setExpandedStateIds] = useState<Record<string, boolean>>({})
  const [expandedMuniKeys, setExpandedMuniKeys] = useState<Record<string, boolean>>({})
  const [parishIndexWanted, setParishIndexWanted] = useState(false)
  /** Leyenda REDI: en móvil colapsada por defecto */
  const [rediLegendMobileOpen, setRediLegendMobileOpen] = useState(false)
  const [mobileNavTab, setMobileNavTab] = useState<NeuralMobileNavTab>('explore')
  const [mobileSearchExpanded, setMobileSearchExpanded] = useState(false)
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false)
  /** Carril neural izquierdo: oculto por defecto para ganar área de mapa. */
  const [mobileRailOpen, setMobileRailOpen] = useState(false)
  const mobileMapSearchRef = useRef<HTMLDivElement>(null)

  const [statesGeo, setStatesGeo] = useState<any>(null)
  const [countryOutlineGeo, setCountryOutlineGeo] = useState<any>(null)
  const [muniGeo, setMuniGeo] = useState<any>(null)
  const [geoLoading, setGeoLoading] = useState(true)
  const [showCountrySilhouette, setShowCountrySilhouette] = useState(showCountrySilhouetteDefault)
  const [showStatesLayer, setShowStatesLayer] = useState(showStatesLayerDefault)
  const [showRediLayer, setShowRediLayer] = useState(showRediLayerDefault)
  const [showMunicipalities, setShowMunicipalities] = useState(showMunicipalitiesDefault)
  const [showParishes, setShowParishes] = useState(false)
  const [layerOrder, setLayerOrder] = useState<StackableMapLayerId[]>(() => [...DEFAULT_MAP_LAYER_ORDER])
  const [layersPanelOpen, setLayersPanelOpen] = useState(false)
  const [parishGeo, setParishGeo] = useState<any>(null)
  const [parishesLoading, setParishesLoading] = useState(false)

  const [flyTarget, setFlyTarget] = useState<MapFlyRequest | null>(null)
  const hud = useTacticalHud()

  const flyOperationalHome = useCallback(() => {
    setFlyTarget({ kind: 'point', center: [7.5, -66.58], zoom: 5.5, duration: 1.25 })
  }, [])

  const tacticalRailMode = useMemo((): TacticalRailMode => {
    if (layersPanelOpen) return 'layers'
    if (sidebarOpen && showTerritoryPanel) return 'nodes'
    return 'map'
  }, [layersPanelOpen, sidebarOpen, showTerritoryPanel])

  /** Resaltado solo municipio+parroquia del GPS (resto atenuado). */
  const [myLocMuniGid, setMyLocMuniGid] = useState<string | null>(null)
  const [myLocParishPcode, setMyLocParishPcode] = useState<string | null>(null)
  const [showMarkers, setShowMarkers] = useState(showMarkersDefault)
  const [geoKey, setGeoKey] = useState(0)

  const [myLocation, setMyLocation] = useState<{
    lat: number
    lng: number
    accuracy?: number
    /** Epoch ms: instante del arreglo GPS (API o reloj del dispositivo) */
    capturedAtMs: number
  } | null>(null)
  const [myLocationDetail, setMyLocationDetail] = useState<ReverseGeoDetail | null>(null)
  const [myLocGeoPending, setMyLocGeoPending] = useState(false)
  const [myLocReversePending, setMyLocReversePending] = useState(false)
  const [myLocError, setMyLocError] = useState<string | null>(null)
  const [myLocationCardVisible, setMyLocationCardVisible] = useState(true)
  const [myLocActionMsg, setMyLocActionMsg] = useState<string | null>(null)

  const myLocVisualIsolate = useMemo(
    () => Boolean(myLocation && (myLocParishPcode || myLocMuniGid)),
    [myLocation, myLocParishPcode, myLocMuniGid],
  )

  const safeLayerOrder = useMemo(() => normalizeLayerOrder(layerOrder), [layerOrder])

  useEffect(() => {
    const fixed = normalizeLayerOrder(layerOrder)
    if (
      fixed.length !== layerOrder.length ||
      fixed.some((id, i) => id !== layerOrder[i])
    ) {
      setLayerOrder(fixed)
    }
  }, [layerOrder])

  const paneZIndices = useMemo(() => computePaneZIndices(safeLayerOrder), [safeLayerOrder])

  const layerVisibility = useMemo<MapLayerVisibility>(
    () => ({
      country: showCountrySilhouette,
      states: showStatesLayer,
      municipalities: showMunicipalities,
      parishes: showParishes,
      redi: showRediLayer,
    }),
    [showCountrySilhouette, showStatesLayer, showMunicipalities, showParishes, showRediLayer],
  )

  const onLayerVisibilityChange = useCallback((key: keyof MapLayerVisibility, visible: boolean) => {
    switch (key) {
      case 'country':
        setShowCountrySilhouette(visible)
        break
      case 'states':
        setShowStatesLayer(visible)
        break
      case 'municipalities':
        setShowMunicipalities(visible)
        break
      case 'parishes':
        setShowParishes(visible)
        break
      case 'redi':
        setShowRediLayer(visible)
        break
    }
  }, [])

  useEffect(() => {
    if (stateData.length === 0) return
    setGeoLoading(true)
    Promise.all([
      fetchGeoJSON(geo.states),
      fetchGeoJSON(geo.countryOutline).catch(err => {
        console.warn('Silueta país (ven-outline.json). Ejecuta npm run build:outline —', err)
        return null
      }),
    ])
      .then(([statesData, outlineData]) => {
        setStatesGeo(statesData)
        setCountryOutlineGeo(outlineData)
        setGeoKey(k => k + 1)
      })
      .catch(err => console.error('Error GeoJSON estados:', err))
      .finally(() => setGeoLoading(false))
  }, [stateData.length, geo.states, geo.countryOutline])

  useEffect(() => {
    if (muniGeo) return
    fetchGeoJSON(geo.municipalities)
      .then(setMuniGeo)
      .catch(err => console.error('Error GeoJSON municipios:', err))
  }, [muniGeo, geo.municipalities])

  const wantParishGeo = showParishes || parishIndexWanted

  useEffect(() => {
    if (showParishes) setParishIndexWanted(true)
  }, [showParishes])

  useEffect(() => {
    if (!wantParishGeo || parishGeo) return
    setParishesLoading(true)
    fetchGeoJSON(geo.parishes)
      .then(setParishGeo)
      .catch(err => console.error('Error GeoJSON parroquias:', err))
      .finally(() => setParishesLoading(false))
  }, [wantParishGeo, parishGeo, geo.parishes])

  const territoryIndex = useMemo(() => buildTerritoryIndex(muniGeo, parishGeo), [muniGeo, parishGeo])

  useEffect(() => {
    if (territorialSearchQuery.trim().length >= 2) setParishIndexWanted(true)
  }, [territorialSearchQuery])

  const searchHits = useMemo(
    () => searchTerritory(stateData, territoryIndex, territorialSearchQuery),
    [stateData, territoryIndex, territorialSearchQuery],
  )

  useEffect(() => {
    setSearchHighlightIdx(0)
  }, [territorialSearchQuery, searchHits.length])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node
      if (mapSearchRef.current?.contains(t)) return
      if (mobileMapSearchRef.current?.contains(t)) return
      setMapSearchOpen(false)
      setMobileSearchExpanded(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (!showMunicipalities) setSelectedMunicipality(null)
  }, [showMunicipalities])

  useEffect(() => {
    if (!showParishes) setSelectedParish(null)
  }, [showParishes])

  const findStat = useCallback((geoName: string) => {
    return stateData.find(s => normalizeName(s.name) === normalizeName(geoName))
  }, [stateData])

  const stateStyle = useCallback((feature: any) => {
    const name = feature?.properties?.NAME_1 || ''
    const stat = findStat(name)
    const redi = stat ? getStateRedi(stat.name) : getStateRedi(name)
    const color = REDI_COLORS[redi] || '#6b7280'
    const baseOp = stat ? 0.25 : 0.15
    return {
      fillColor: color,
      fillOpacity: myLocVisualIsolate ? baseOp * 0.22 : baseOp,
      color: color,
      weight: 1.5,
      opacity: myLocVisualIsolate ? 0.38 : 0.7,
    }
  }, [findStat, myLocVisualIsolate])

  const neutralStateStyle = useCallback(
    (_feature: any) => ({
      fillColor: '#64748b',
      fillOpacity: myLocVisualIsolate ? 0.04 : 0.15,
      color: 'rgba(226, 232, 240, 0.38)',
      weight: 1.1,
      opacity: myLocVisualIsolate ? 0.4 : 0.8,
    }),
    [myLocVisualIsolate],
  )

  const bindStateLayerEvents = useCallback(
    (
      feature: any,
      layer: Layer,
      resetStyle: (f: any) => Record<string, unknown>,
    ) => {
      const name = feature?.properties?.NAME_1 || ''
      const stat = findStat(name)

      if (stat) {
        const lines = [`<strong>${escapeHtml(stat.name)}</strong>`]
        for (const m of stat.metrics ?? []) {
          if (m.value > 0) {
            lines.push(
              `<br/><span style="color:#94a3b8">${escapeHtml(m.label)}: ${m.value}</span>`,
            )
          }
        }
        layer.bindTooltip(
          `<div style="font-family:monospace;font-size:11px">${lines.join('')}</div>`,
          { sticky: true, className: 'centinela-tooltip' },
        )
      }

      layer.on('mouseover', () => {
        ;(layer as any).setStyle?.({
          fillOpacity: 0.42,
          weight: 2.35,
          color: '#f8fafc',
          opacity: 1,
        })
        ;(layer as L.Path).bringToFront()
      })
      layer.on('mouseout', () => {
        ;(layer as any).setStyle?.(resetStyle(feature))
      })
      layer.on('click', () => {
        if (stat) {
          setSelectedParish(null)
          setSelectedMunicipality(null)
          setSelectedState(stat)
          onStateClick?.(stat)
          if (stat.geo_center) {
            setFlyTarget({ kind: 'point', center: [stat.geo_center.lat, stat.geo_center.lng], zoom: 7 })
          }
        }
      })
    },
    [findStat, onStateClick],
  )

  const onEachStateNeutral = useCallback(
    (feature: any, layer: Layer) => bindStateLayerEvents(feature, layer, neutralStateStyle),
    [bindStateLayerEvents, neutralStateStyle],
  )

  const onEachStateRedi = useCallback(
    (feature: any, layer: Layer) => bindStateLayerEvents(feature, layer, stateStyle),
    [bindStateLayerEvents, stateStyle],
  )

  const onEachEsequiboNeutral = useCallback((_feature: any, layer: Layer) => {
    const eseqStat = stateData.find(s => s.name === 'Guayana Esequiba')
    const eseqMetricLines = (eseqStat?.metrics ?? [])
      .filter(m => m.value > 0)
      .map(
        m =>
          `<br/><span style="color:#94a3b8">${escapeHtml(m.label)}: ${m.value}</span>`,
      )
      .join('')
    layer.bindTooltip(
      `<div style="font-family:monospace;font-size:11px">
        <strong>Guayana Esequiba</strong><br/>
        <span style="color:#94a3b8;font-size:10px">Zona en reclamación · mismo estilo que estados</span>${eseqMetricLines}<br/>
        <span style="color:#64748b;font-size:10px">159.542 km²</span>
      </div>`,
      { sticky: true, className: 'centinela-tooltip' },
    )
    layer.on('mouseover', () => {
      ;(layer as any).setStyle({
        fillColor: '#94a3b8',
        fillOpacity: 0.35,
        weight: 2,
        color: '#e2e8f0',
        opacity: 1,
      })
      ;(layer as L.Path).bringToFront()
    })
    layer.on('mouseout', () => {
      ;(layer as any).setStyle({
        fillColor: '#64748b',
        fillOpacity: 0.14,
        weight: 1.2,
        color: 'rgba(226, 232, 240, 0.45)',
        opacity: 0.85,
      })
    })
    layer.on('click', () => {
      if (eseqStat) {
        setSelectedParish(null)
        setSelectedMunicipality(null)
        setSelectedState(eseqStat)
        onStateClick?.(eseqStat)
        setFlyTarget({ kind: 'point', center: [5.5, -59.2], zoom: 6 })
      }
    })
  }, [stateData, onStateClick])

  const onEachEsequiboRedi = useCallback((_feature: any, layer: Layer) => {
    const eseqStat = stateData.find(s => s.name === 'Guayana Esequiba')
    const eseqMetricLines = (eseqStat?.metrics ?? [])
      .filter(m => m.value > 0)
      .map(
        m =>
          `<br/><span style="color:#94a3b8">${escapeHtml(m.label)}: ${m.value}</span>`,
      )
      .join('')
    layer.bindTooltip(
      `<div style="font-family:monospace;font-size:11px">
        <strong style="color:${REDI_GUAYANA_COLOR}">Guayana Esequiba</strong><br/>
        <span style="color:#6ee7b7;font-size:10px">REDI GUAYANA</span>${eseqMetricLines}<br/>
        <span style="color:#64748b;font-size:10px">159.542 km²</span>
      </div>`,
      { sticky: true, className: 'centinela-tooltip' }
    )
    layer.on('mouseover', () => {
      ;(layer as any).setStyle({
        fillColor: REDI_GUAYANA_COLOR,
        fillOpacity: 0.4,
        weight: 2.5,
        color: '#34d399',
        opacity: 1,
      })
      ;(layer as L.Path).bringToFront()
    })
    layer.on('mouseout', () => {
      ;(layer as any).setStyle({
        fillColor: REDI_GUAYANA_COLOR,
        fillOpacity: 0.22,
        weight: 1.5,
        color: REDI_GUAYANA_COLOR,
        opacity: 0.85,
      })
    })
    layer.on('click', () => {
      if (eseqStat) {
        setSelectedParish(null)
        setSelectedMunicipality(null)
        setSelectedState(eseqStat)
        onStateClick?.(eseqStat)
        setFlyTarget({ kind: 'point', center: [5.5, -59.2], zoom: 6 })
      }
    })
  }, [stateData, onStateClick])

  /** Misma paleta que municipios (ADM2) para silueta Esequiba sin GeoJSON municipal. */
  const getEsequiboMunicipalitySilhouetteStyle = useCallback(() => {
    if (myLocVisualIsolate) {
      return {
        fillColor: 'rgba(88, 28, 135, 0.04)',
        fillOpacity: 0.4,
        color: 'rgba(167, 139, 250, 0.12)',
        weight: 0.35,
        opacity: 0.42,
      }
    }
    return {
      fillColor: 'rgba(168, 85, 247, 0.06)',
      fillOpacity: 1,
      color: 'rgba(167, 139, 250, 0.42)',
      weight: 0.9,
      opacity: 0.88,
    }
  }, [myLocVisualIsolate])

  const getEsequiboMuniStyleRef = useRef(getEsequiboMunicipalitySilhouetteStyle)
  getEsequiboMuniStyleRef.current = getEsequiboMunicipalitySilhouetteStyle

  const onEachEsequiboAsMunicipality = useCallback((_feature: any, layer: Layer) => {
    const eseqStat = stateData.find(s => s.name === 'Guayana Esequiba')
    const eseqMetricLines = (eseqStat?.metrics ?? [])
      .filter(m => m.value > 0)
      .map(
        m =>
          `<br/><span style="color:#e9d5ff">${escapeHtml(m.label)}: ${m.value}</span>`,
      )
      .join('')
    layer.bindTooltip(
      `<div class="muni-hover-inner" style="font-family:monospace;font-size:11px">
          <span class="muni-hover-name">Guayana Esequiba</span>
          <span class="muni-hover-state">Sin división municipal en capa · silueta mismo estilo que municipios</span>${eseqMetricLines}
        </div>`,
      { sticky: true, className: 'muni-tooltip-hover' },
    )
    layer.on('mouseover', () => {
      ;(layer as L.Path).setStyle({
        fillColor: 'rgba(192, 132, 252, 0.2)',
        fillOpacity: 0.55,
        color: '#e879f9',
        weight: 1.85,
        opacity: 1,
      })
      ;(layer as L.Path).bringToFront()
    })
    layer.on('mouseout', () => {
      ;(layer as L.Path).setStyle(getEsequiboMuniStyleRef.current())
    })
    layer.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e)
      if (eseqStat) {
        setSelectedParish(null)
        setSelectedMunicipality(null)
        setSelectedState(eseqStat)
        onStateClick?.(eseqStat)
        setFlyTarget({ kind: 'point', center: [5.5, -59.2], zoom: 6 })
      }
    })
  }, [stateData, onStateClick])

  /** Misma paleta que parroquias (ADM3) cuando no hay subdivisión Esequiba en la capa. */
  const getEsequiboParishSilhouetteStyle = useCallback(() => {
    if (myLocVisualIsolate) {
      return {
        fillColor: 'rgba(8, 47, 73, 0.06)',
        fillOpacity: 0.35,
        color: 'rgba(34, 211, 238, 0.1)',
        weight: 0.3,
        opacity: 0.38,
      }
    }
    return {
      fillColor: 'rgba(34, 211, 238, 0.04)',
      fillOpacity: 1,
      color: 'rgba(34, 211, 238, 0.38)',
      weight: 0.55,
      opacity: 0.82,
    }
  }, [myLocVisualIsolate])

  const getEsequiboParishStyleRef = useRef(getEsequiboParishSilhouetteStyle)
  getEsequiboParishStyleRef.current = getEsequiboParishSilhouetteStyle

  const onEachEsequiboAsParish = useCallback((_feature: any, layer: Layer) => {
    const eseqStat = stateData.find(s => s.name === 'Guayana Esequiba')
    const eseqMetricLines = (eseqStat?.metrics ?? [])
      .filter(m => m.value > 0)
      .map(
        m =>
          `<br/><span style="color:#a5f3fc">${escapeHtml(m.label)}: ${m.value}</span>`,
      )
      .join('')
    layer.bindTooltip(
      `<div class="parish-hover-inner" style="font-family:monospace;font-size:11px">
          <span class="parish-hover-name">Guayana Esequiba</span>
          <span class="parish-hover-muni">Sin parroquias en esta capa · silueta mismo estilo que parroquias</span>${eseqMetricLines}
        </div>`,
      { sticky: true, className: 'parish-tooltip-hover' },
    )
    layer.on('mouseover', () => {
      ;(layer as L.Path).setStyle({
        fillColor: 'rgba(34, 211, 238, 0.14)',
        fillOpacity: 0.5,
        color: '#22d3ee',
        weight: 1.5,
        opacity: 1,
      })
      ;(layer as L.Path).bringToFront()
    })
    layer.on('mouseout', () => {
      ;(layer as L.Path).setStyle(getEsequiboParishStyleRef.current())
    })
    layer.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e)
      if (eseqStat) {
        setSelectedParish(null)
        setSelectedMunicipality(null)
        setSelectedState(eseqStat)
        onStateClick?.(eseqStat)
        setFlyTarget({ kind: 'point', center: [5.5, -59.2], zoom: 6 })
      }
    })
  }, [stateData, onStateClick])

  const getMunicipalityStyle = useCallback((feature: any) => {
    const gid = String(feature?.properties?.GID_2 ?? '')
    const isSel = selectedMunicipality?.gid === gid
    const isMyLoc = myLocMuniGid === gid
    const hi = isSel || isMyLoc
    if (myLocVisualIsolate && !hi) {
      return {
        fillColor: 'rgba(88, 28, 135, 0.04)',
        fillOpacity: 0.4,
        color: 'rgba(167, 139, 250, 0.12)',
        weight: 0.35,
        opacity: 0.42,
      }
    }
    return {
      fillColor: hi ? 'rgba(233, 213, 255, 0.26)' : 'rgba(168, 85, 247, 0.06)',
      fillOpacity: 1,
      color: hi ? '#f0abfc' : 'rgba(167, 139, 250, 0.42)',
      weight: hi ? 2.6 : 0.9,
      opacity: hi ? 1 : 0.88,
    }
  }, [selectedMunicipality, myLocMuniGid, myLocVisualIsolate])

  const getMunicipalityStyleRef = useRef(getMunicipalityStyle)
  getMunicipalityStyleRef.current = getMunicipalityStyle

  const onEachMunicipality = useCallback((feature: any, layer: Layer) => {
    const p = feature?.properties || {}
    const gid = String(p.GID_2 ?? '')
    const muniDisplay = formatMunicipalityName(p.NAME_2 || '')
    const stateDisplay = formatMunicipalityName(p.NAME_1 || '')
    const permanent = mapZoom >= 10

    const tipHtml = permanent
      ? `<span class="muni-perm-inner">${escapeHtml(muniDisplay)}</span>`
      : `<div class="muni-hover-inner">
          <span class="muni-hover-name">${escapeHtml(muniDisplay)}</span>
          <span class="muni-hover-state">${escapeHtml(stateDisplay)}</span>
        </div>`

    layer.bindTooltip(tipHtml, {
      permanent,
      direction: permanent ? 'center' : 'right',
      sticky: !permanent,
      className: permanent ? 'muni-label-permanent' : 'muni-tooltip-hover',
      offset: permanent ? [0, 2] as [number, number] : [10, 0],
    })

    layer.on('mouseover', () => {
      if (!permanent) {
        const prev = municipalityHoverTooltipLayerRef.current
        if (prev && prev !== layer) prev.closeTooltip()
        municipalityHoverTooltipLayerRef.current = layer
      }
      if (selectedMunicipalityRef.current?.gid === gid) return
      ;(layer as L.Path).setStyle({
        fillColor: 'rgba(192, 132, 252, 0.2)',
        fillOpacity: 0.55,
        color: '#e879f9',
        weight: 1.85,
        opacity: 1,
      })
      ;(layer as L.Path).bringToFront()
    })
    layer.on('mouseout', () => {
      if (!permanent) {
        if (municipalityHoverTooltipLayerRef.current === layer) {
          municipalityHoverTooltipLayerRef.current = null
        }
        layer.closeTooltip()
      }
      ;(layer as L.Path).setStyle(getMunicipalityStyleRef.current(feature))
    })
    layer.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e)
      setSelectedParish(null)
      setSelectedState(null)
      setSelectedMunicipality({ gid, municipality: muniDisplay, state: stateDisplay })
    })
  }, [mapZoom])

  const getParishStyle = useCallback((feature: any) => {
    const pcode = String(feature?.properties?.adm3_pcode ?? '')
    const isSel = selectedParish?.pcode === pcode
    const isMyLoc = myLocParishPcode === pcode
    const hi = isSel || isMyLoc
    if (myLocVisualIsolate && !hi) {
      return {
        fillColor: 'rgba(8, 47, 73, 0.06)',
        fillOpacity: 0.35,
        color: 'rgba(34, 211, 238, 0.1)',
        weight: 0.3,
        opacity: 0.38,
      }
    }
    return {
      fillColor: hi ? 'rgba(103, 232, 249, 0.24)' : 'rgba(34, 211, 238, 0.04)',
      fillOpacity: 1,
      color: hi ? '#67e8f9' : 'rgba(34, 211, 238, 0.38)',
      weight: hi ? 2.35 : 0.55,
      opacity: hi ? 1 : 0.82,
    }
  }, [selectedParish, myLocParishPcode, myLocVisualIsolate])

  const getParishStyleRef = useRef(getParishStyle)
  getParishStyleRef.current = getParishStyle

  const onEachParish = useCallback((feature: any, layer: Layer) => {
    const p = feature?.properties || {}
    const pcode = String(p.adm3_pcode ?? '')
    const parishDisplay = formatMunicipalityName(String(p.adm3_name || p.adm3_ref_name || ''))
    const muniDisplay = formatMunicipalityName(String(p.adm2_name || ''))
    const stateDisplay = formatMunicipalityName(String(p.adm1_name || ''))
    const permanent = mapZoom >= 11

    const tipHtml = permanent
      ? `<span class="parish-perm-inner">${escapeHtml(parishDisplay)}</span>`
      : `<div class="parish-hover-inner">
          <span class="parish-hover-name">${escapeHtml(parishDisplay)}</span>
          <span class="parish-hover-muni">${escapeHtml(muniDisplay)} · ${escapeHtml(stateDisplay)}</span>
        </div>`

    layer.bindTooltip(tipHtml, {
      permanent,
      direction: permanent ? 'center' : 'right',
      sticky: !permanent,
      className: permanent ? 'parish-label-permanent' : 'parish-tooltip-hover',
      offset: permanent ? [0, 1] as [number, number] : [10, 0],
    })

    layer.on('mouseover', () => {
      if (!permanent) {
        const prev = parishHoverTooltipLayerRef.current
        if (prev && prev !== layer) prev.closeTooltip()
        parishHoverTooltipLayerRef.current = layer
      }
      if (selectedParishRef.current?.pcode === pcode) return
      ;(layer as L.Path).setStyle({
        fillColor: 'rgba(34, 211, 238, 0.14)',
        fillOpacity: 0.5,
        color: '#22d3ee',
        weight: 1.5,
        opacity: 1,
      })
      ;(layer as L.Path).bringToFront()
    })
    layer.on('mouseout', () => {
      if (!permanent) {
        if (parishHoverTooltipLayerRef.current === layer) {
          parishHoverTooltipLayerRef.current = null
        }
        layer.closeTooltip()
      }
      ;(layer as L.Path).setStyle(getParishStyleRef.current(feature))
    })
    layer.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e)
      setSelectedState(null)
      setSelectedMunicipality(null)
      setSelectedParish({
        pcode,
        parish: parishDisplay,
        municipality: muniDisplay,
        state: stateDisplay,
      })
    })
  }, [mapZoom])

  const handleStateClick = useCallback((state: StateData) => {
    setSelectedParish(null)
    setSelectedMunicipality(null)
    setSelectedState(state)
    onStateClick?.(state)
    if (state.geo_center) {
      setFlyTarget({ kind: 'point', center: [state.geo_center.lat, state.geo_center.lng], zoom: 7 })
    }
  }, [onStateClick])

  const handlePickMunicipioSidebar = useCallback((state: StateData, m: MunicipioIndexItem) => {
    setSelectedParish(null)
    setSelectedState(state)
    onStateClick?.(state)
    if (m.gid) {
      setSelectedMunicipality({
        gid: m.gid,
        municipality: m.display,
        state: state.name,
      })
    } else {
      setSelectedMunicipality(null)
    }
    setShowMunicipalities(true)
    if (state.geo_center) {
      setFlyTarget({ kind: 'point', center: [state.geo_center.lat, state.geo_center.lng], zoom: 9 })
    }
  }, [onStateClick])

  const handlePickParishSidebar = useCallback((state: StateData, m: MunicipioIndexItem, p: ParishIndexItem) => {
    setSelectedState(null)
    setSelectedMunicipality(null)
    setSelectedParish({
      pcode: p.pcode,
      parish: p.display,
      municipality: m.display,
      state: state.name,
    })
    setShowParishes(true)
    if (p.lat && p.lng) {
      setFlyTarget({ kind: 'point', center: [p.lat, p.lng], zoom: 13 })
    }
  }, [])

  const handleStateRowToggle = useCallback((state: StateData) => {
    setParishIndexWanted(true)
    setExpandedStateIds(prev => ({ ...prev, [state.id]: !prev[state.id] }))
    handleStateClick(state)
  }, [handleStateClick])

  const applySearchHit = useCallback(
    (hit: SearchHit) => {
      setParishIndexWanted(true)
      if (hit.kind === 'estado') {
        handleStateClick(hit.state)
        setExpandedStateIds(prev => ({ ...prev, [hit.state.id]: true }))
        setTerritorialSearchQuery('')
        setMapSearchOpen(false)
        return
      }
      if (hit.kind === 'municipio') {
        handlePickMunicipioSidebar(hit.state, hit.municipio)
        setExpandedStateIds(prev => ({ ...prev, [hit.state.id]: true }))
        setExpandedMuniKeys(prev => ({ ...prev, [muniExpandKey(hit.state.id, hit.municipio.norm)]: false }))
        setTerritorialSearchQuery('')
        setMapSearchOpen(false)
        return
      }
      handlePickParishSidebar(hit.state, hit.municipio, hit.parish)
      setExpandedStateIds(prev => ({ ...prev, [hit.state.id]: true }))
      setExpandedMuniKeys(prev => ({ ...prev, [muniExpandKey(hit.state.id, hit.municipio.norm)]: true }))
      setTerritorialSearchQuery('')
      setMapSearchOpen(false)
    },
    [handleStateClick, handlePickMunicipioSidebar, handlePickParishSidebar],
  )

  useEffect(() => {
    if (myLocation) setMyLocationCardVisible(true)
  }, [myLocation])

  const locateMe = useCallback(() => {
    setMyLocError(null)
    setMyLocActionMsg(null)
    if (!navigator.geolocation) {
      setMyLocError('Tu navegador no permite geolocalización.')
      return
    }
    setMyLocGeoPending(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const capturedAtMs =
          typeof pos.timestamp === 'number' && pos.timestamp > 1e12 ? pos.timestamp : Date.now()
        setShowMunicipalities(true)
        setShowParishes(true)
        setParishIndexWanted(true)
        setMyLocation({ lat, lng, accuracy: pos.coords.accuracy, capturedAtMs })
        setMyLocGeoPending(false)
        setMyLocReversePending(true)
        setMyLocationDetail(null)
        try {
          const detail = await reverseGeocodeNominatim(lat, lng)
          setMyLocationDetail(detail)
        } catch {
          setMyLocationDetail({ lat, lng, displayName: 'Ubicación GPS' })
        } finally {
          setMyLocReversePending(false)
        }
      },
      (err) => {
        setMyLocGeoPending(false)
        const code = (err as GeolocationPositionError).code
        if (code === 1) setMyLocError('Permiso de ubicación denegado.')
        else if (code === 2) setMyLocError('Posición no disponible.')
        else if (code === 3) setMyLocError('Tiempo de espera agotado.')
        else setMyLocError('No se pudo obtener tu posición.')
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    )
  }, [])

  const handleMobileNav = useCallback(
    (tab: NeuralMobileNavTab) => {
      setMobileNavTab(tab)
      setMobileSettingsOpen(false)
      if (tab === 'explore') {
        setMobileRailOpen(true)
        setRediLegendMobileOpen(false)
      }
      if (tab === 'legend') {
        setRediLegendMobileOpen(true)
      }
      if (tab === 'vital' && showGeolocation) {
        locateMe()
        setMyLocationCardVisible(true)
      }
    },
    [showGeolocation, locateMe],
  )

  const clearMyLocationMarker = useCallback(() => {
    setMyLocation(null)
    setMyLocationDetail(null)
    setMyLocError(null)
    setMyLocActionMsg(null)
    setMyLocMuniGid(null)
    setMyLocParishPcode(null)
  }, [])

  /** Tras GPS: encuadre suave por polígono parroquia/municipio y foco visual. */
  useEffect(() => {
    if (!myLocation) {
      setMyLocMuniGid(null)
      setMyLocParishPcode(null)
      return
    }
    if (!muniGeo?.features?.length) return

    const { lat, lng } = myLocation

    const flyToBoundsOf = (feature: GeoJSON.Feature, maxZoom: number, pad: [number, number]) => {
      try {
        const b = L.geoJSON(feature as GeoJSON.GeoJsonObject).getBounds()
        if (!b.isValid()) return
        const sw = b.getSouthWest()
        const ne = b.getNorthEast()
        setFlyTarget({
          kind: 'bounds',
          southWest: [sw.lat, sw.lng],
          northEast: [ne.lat, ne.lng],
          maxZoom,
          padding: pad,
          duration: 1.55,
        })
      } catch {
        setFlyTarget({ kind: 'point', center: [lat, lng], zoom: 10, duration: 1.3 })
      }
    }

    if (!parishGeo?.features?.length) {
      const muniFeat = findMunicipalityContaining(muniGeo, lat, lng)
      if (muniFeat) {
        const gid = String((muniFeat.properties as { GID_2?: string })?.GID_2 ?? '')
        setMyLocMuniGid(gid || null)
        setMyLocParishPcode(null)
        flyToBoundsOf(muniFeat, 10, [52, 52])
      } else {
        setMyLocMuniGid(null)
        setMyLocParishPcode(null)
        setFlyTarget({ kind: 'point', center: [lat, lng], zoom: 10, duration: 1.3 })
      }
      return
    }

    const parishFeat = findParishContaining(parishGeo, lat, lng)
    if (parishFeat) {
      const pr = parishFeat.properties as Record<string, string | undefined>
      const pcode = String(pr.adm3_pcode ?? '')
      const adm1 = String(pr.adm1_name ?? '')
      const adm2 = String(pr.adm2_name ?? '')
      const gid = municipalityGidFromParishParent(muniGeo, adm1, adm2)
      setMyLocParishPcode(pcode || null)
      setMyLocMuniGid(gid)
      flyToBoundsOf(parishFeat, 10, [72, 72])
      return
    }

    const muniFeat = findMunicipalityContaining(muniGeo, lat, lng)
    if (muniFeat) {
      const gid = String((muniFeat.properties as { GID_2?: string })?.GID_2 ?? '')
      setMyLocMuniGid(gid || null)
      setMyLocParishPcode(null)
      flyToBoundsOf(muniFeat, 10, [56, 56])
      return
    }

    setMyLocMuniGid(null)
    setMyLocParishPcode(null)
    setFlyTarget({ kind: 'point', center: [lat, lng], zoom: 10, duration: 1.3 })
  }, [myLocation, muniGeo, parishGeo])

  const myLocationClipboardPayload = useCallback((): ReverseGeoDetail | null => {
    if (!myLocation) return null
    const base = myLocationDetail ?? { lat: myLocation.lat, lng: myLocation.lng }
    return { ...base, capturedAtMs: myLocation.capturedAtMs }
  }, [myLocation, myLocationDetail])

  const copyMyLocation = useCallback(async () => {
    const d = myLocationClipboardPayload()
    if (!d) return
    try {
      await navigator.clipboard.writeText(formatLocationForClipboard(d))
      setMyLocActionMsg('Copiado al portapapeles')
      window.setTimeout(() => setMyLocActionMsg(null), 2500)
    } catch {
      setMyLocActionMsg('No se pudo copiar')
      window.setTimeout(() => setMyLocActionMsg(null), 2500)
    }
  }, [myLocationClipboardPayload])

  const shareMyLocation = useCallback(async () => {
    const d = myLocationClipboardPayload()
    if (!d || !myLocation) return
    const text = formatLocationForClipboard(d)
    const url = openStreetMapUrl(myLocation.lat, myLocation.lng)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Mi ubicación', text: `${text}\n${url}`, url })
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        setMyLocActionMsg('Enlace copiado (compartir no disponible)')
        window.setTimeout(() => setMyLocActionMsg(null), 2500)
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        setMyLocActionMsg('Copiado como alternativa')
        window.setTimeout(() => setMyLocActionMsg(null), 2500)
      } catch {
        setMyLocActionMsg('No se pudo compartir ni copiar')
        window.setTimeout(() => setMyLocActionMsg(null), 2500)
      }
    }
  }, [myLocation, myLocationClipboardPayload])

  const userLocationIcon = useMemo(() => {
    if (!myLocation) return null
    return L.divIcon({
      className: 'user-loc-divicon',
      html: `
      <div class="user-loc-marker-root" aria-hidden="true">
        <span class="user-loc-ring"></span>
        <span class="user-loc-ring user-loc-ring-delay"></span>
        <span class="user-loc-core"></span>
      </div>
    `,
      iconSize: [56, 56],
      iconAnchor: [28, 28],
    })
  }, [myLocation])

  const searchNormLen = territorySearchQueryNorm(territorialSearchQuery).length
  const showMapSearchDropdown = mapSearchOpen && searchNormLen >= 2

  const onMapSearchKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (searchNormLen < 2 || searchHits.length === 0) {
        if (e.key === 'Escape') {
          setMapSearchOpen(false)
          ;(e.target as HTMLInputElement).blur()
        }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSearchHighlightIdx(i => Math.min(i + 1, searchHits.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSearchHighlightIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const hit = searchHits[searchHighlightIdx]
        if (hit) applySearchHit(hit)
      } else if (e.key === 'Escape') {
        setMapSearchOpen(false)
        ;(e.target as HTMLInputElement).blur()
      }
    },
    [searchNormLen, searchHits, searchHighlightIdx, applySearchHit],
  )

  const groupedByRedi = useMemo(() => {
    const groups: Record<string, StateData[]> = {}

    for (const state of stateData) {
      const redi = getStateRedi(state.name)
      if (!redi) continue
      if (!groups[redi]) groups[redi] = []
      groups[redi].push(state)
    }

    const sortFn = (a: StateData, b: StateData) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy.startsWith('metric:')) {
        const id = sortBy.slice('metric:'.length)
        return metricValue(b, id) - metricValue(a, id)
      }
      return 0
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort(sortFn)
    }

    return { groups }
  }, [stateData, sortBy])

  return (
    <div className={`h-full flex flex-col overflow-hidden ${className}`}>
      {/* Capas tácticas — escritorio (marca en cabecera App) */}
      <div className="mb-1.5 hidden min-w-0 flex-shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md border border-cyan-500/12 bg-black/40 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm lg:flex">
        <span className="mr-1 shrink-0 border-r border-cyan-500/10 pr-2 font-mono text-[8px] uppercase tracking-[0.2em] text-cyan-600/85">
          Live_feed
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 md:gap-2">
          <button
            type="button"
            onClick={() => setShowCountrySilhouette(!showCountrySilhouette)}
            title="Silueta de Venezuela (contorno país)"
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-mono transition-all
              ${showCountrySilhouette
                ? 'border border-sky-400/50 bg-sky-500/10 text-sky-200 shadow-[0_0_14px_rgba(56,189,248,0.18)]'
                : 'tactical-toggle-idle'
              }`}
          >
            <Globe2 className="w-3 h-3 flex-shrink-0" />
            <span className="hidden sm:inline">Venezuela</span>
          </button>
          <button
            type="button"
            onClick={() => setShowStatesLayer(!showStatesLayer)}
            title="Límites de estados (sin colores REDI)"
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-mono transition-all
              ${showStatesLayer
                ? 'border border-emerald-400/50 bg-emerald-500/10 text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.15)]'
                : 'tactical-toggle-idle'
              }`}
          >
            <MapIcon className="w-3 h-3 flex-shrink-0" />
            <span className="hidden sm:inline">Estados</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMunicipalities(!showMunicipalities)}
            title="Capa municipios"
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-mono transition-all
              ${showMunicipalities
                ? 'border border-fuchsia-400/45 bg-fuchsia-500/10 text-fuchsia-200 shadow-[0_0_14px_rgba(217,70,239,0.12)]'
                : 'tactical-toggle-idle'
              }`}
          >
            <Layers className="w-3 h-3 flex-shrink-0" />
            <span className="hidden sm:inline">Municipios</span>
          </button>
          <button
            type="button"
            onClick={() => setShowParishes(!showParishes)}
            title="Capa parroquias"
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-mono transition-all
              ${showParishes
                ? 'border border-cyan-400/50 bg-cyan-500/10 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.16)]'
                : 'tactical-toggle-idle'
              }`}
          >
            <LayoutGrid className="w-3 h-3 flex-shrink-0" />
            <span className="hidden sm:inline">Parroquias</span>
          </button>
          <button
            type="button"
            onClick={() => setShowRediLayer(!showRediLayer)}
            title="Capa REDI — colores por región estratégica"
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-mono transition-all
              ${showRediLayer
                ? 'border border-cyan-300/55 bg-cyan-500/10 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.2)]'
                : 'tactical-toggle-idle'
              }`}
          >
            <Waypoints className="w-3 h-3 flex-shrink-0" />
            <span className="hidden sm:inline">REDI</span>
          </button>
          {showGeolocation && (
            <>
              <button
                type="button"
                onClick={locateMe}
                disabled={myLocGeoPending}
                className="flex items-center gap-1.5 rounded border border-cyan-500/40 bg-black/50 px-2 py-1 text-[10px] font-mono text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.08)] transition-all hover:border-cyan-400/55 hover:bg-cyan-500/10
                  disabled:cursor-not-allowed disabled:opacity-45"
                title="Geolocalizar y mostrar tu posición en el mapa"
              >
                {myLocGeoPending ? (
                  <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                ) : (
                  <Navigation className="w-3 h-3 flex-shrink-0" />
                )}
                <span className="hidden sm:inline">Mi ubicación</span>
              </button>
              {myLocation && !myLocationCardVisible && (
                <button
                  type="button"
                  onClick={() => setMyLocationCardVisible(true)}
                  title="Mostrar tarjeta de ubicación"
                  className="flex items-center gap-1 rounded border border-cyan-500/20 px-2 py-1 text-[10px] font-mono text-gray-400 transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
                >
                  <Clipboard className="w-3 h-3 sm:hidden flex-shrink-0" aria-hidden />
                  <span className="hidden sm:inline">Ver tarjeta</span>
                </button>
              )}
            </>
          )}
          {markers.length > 0 && (
            <button
              type="button"
              title="Marcadores en mapa"
              onClick={() => setShowMarkers(!showMarkers)}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-mono transition-all
                ${showMarkers
                  ? 'border border-emerald-400/45 bg-emerald-500/10 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]'
                  : 'tactical-toggle-idle'
                }`}
            >
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="hidden sm:inline">Ubicaciones ({markers.length})</span>
              <span className="sm:hidden tabular-nums">{markers.length}</span>
            </button>
          )}
          {showSummaryToolbar && (
            <div className="hidden items-center gap-2 border-l border-cyan-500/15 pl-3 lg:flex">
              {summaryToolbarItems.map(m => (
                <div
                  key={m.id}
                  className="min-w-0 rounded border border-cyan-500/15 bg-black/40 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <div className="truncate text-[7px] font-mono uppercase tracking-wider text-cyan-500/65">{m.label}</div>
                  <div className="font-mono text-[11px] tabular-nums text-cyan-100">{m.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cabecera móvil — estilo NEURAL_MAP */}
      <div className="lg:hidden flex-shrink-0 border-b border-cyan-500/25 bg-[rgba(6,10,16,0.92)] px-2 pb-2 pt-2 shadow-[0_6px_28px_rgba(0,0,0,0.45)]">
        <div className="relative flex min-h-[2.25rem] items-center justify-center">
          <div className="flex max-w-[calc(100%-3rem)] flex-col items-center gap-0.5 px-10 text-center">
            <h1
              className="truncate text-[10px] font-display font-bold uppercase tracking-[0.28em] text-cyan-300 drop-shadow-[0_0_16px_rgba(34,211,238,0.4)] sm:text-[11px]"
              title={mapTitle}
            >
              {mapTitle}
            </h1>
            {mapSubtitle != null && mapSubtitle !== '' && (
              <p className="line-clamp-1 text-[7px] font-mono text-cyan-500/55">{mapSubtitle}</p>
            )}
          </div>
          {showMapSearch && (
            <button
              type="button"
              onClick={() => {
                setMobileSearchExpanded(o => !o)
                if (!mobileSearchExpanded) setMapSearchOpen(true)
              }}
              className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-cyan-500/35 bg-shadow-900/90 text-cyan-300 shadow-md transition-colors hover:border-cyan-400/55 hover:bg-cyan-500/10"
              title={mobileSearchExpanded ? 'Ocultar búsqueda' : 'Buscar territorio'}
              aria-expanded={mobileSearchExpanded}
            >
              <Search className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        {showMapSearch && mobileSearchExpanded && (
          <div ref={mobileMapSearchRef} className="mt-2 space-y-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neon-blue drop-shadow-sm" />
              <input
                type="search"
                value={territorialSearchQuery}
                onChange={e => {
                  setTerritorialSearchQuery(e.target.value)
                  setMapSearchOpen(true)
                }}
                onFocus={() => setMapSearchOpen(true)}
                onKeyDown={onMapSearchKeyDown}
                placeholder="Buscar municipio, parroquia o estado…"
                className="input-territory-search w-full rounded-xl border border-white/20 py-2.5 pl-9 pr-9 text-[13px] font-medium shadow-[0_8px_32px_rgba(0,0,0,0.5)] focus:border-neon-blue/60 focus:outline-none focus:ring-2 focus:ring-neon-blue/45"
                autoComplete="off"
                spellCheck={false}
                aria-autocomplete="list"
                aria-expanded={showMapSearchDropdown}
                aria-controls="territory-search-results-mobile"
              />
              {territorialSearchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setTerritorialSearchQuery('')
                    setSearchHighlightIdx(0)
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {showMapSearchDropdown && (
              <div
                id="territory-search-results-mobile"
                role="listbox"
                className="max-h-[min(16rem,38vh)] overflow-y-auto rounded-xl border border-white/12 bg-[rgba(8,12,18,0.96)] shadow-[0_16px_48px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06] backdrop-blur-xl"
              >
                {searchHits.length === 0 ? (
                  <div className="px-4 py-4 text-center text-xs font-mono text-gray-500">Sin coincidencias · prueba otro término</div>
                ) : (
                  <>
                    <div className="sticky top-0 z-10 border-b border-white/8 bg-shadow-900/98 px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-gray-500">
                      {searchHits.length} resultado{searchHits.length === 1 ? '' : 's'}
                    </div>
                    {searchHits.map((hit, idx) => {
                      const active = idx === searchHighlightIdx
                      const badge = hit.kind === 'estado' ? 'Estado' : hit.kind === 'municipio' ? 'Municipio' : 'Parroquia'
                      const Icon = hit.kind === 'estado' ? MapPin : hit.kind === 'municipio' ? Layers : LayoutGrid
                      const title =
                        hit.kind === 'estado'
                          ? hit.state.name
                          : hit.kind === 'municipio'
                            ? hit.municipio.display
                            : hit.parish.display
                      const sub =
                        hit.kind === 'estado'
                          ? getStateRedi(hit.state.name) || '—'
                          : hit.kind === 'municipio'
                            ? hit.state.name
                            : `${hit.municipio.display} · ${hit.state.name}`
                      const key =
                        hit.kind === 'estado'
                          ? `me-${hit.state.id}-${idx}`
                          : hit.kind === 'municipio'
                            ? `mm-${hit.state.id}-${hit.municipio.norm}-${idx}`
                            : `mp-${hit.parish.pcode}-${idx}`
                      return (
                        <button
                          key={key}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setSearchHighlightIdx(idx)}
                          onClick={() => applySearchHit(hit)}
                          className={`flex w-full items-start gap-2.5 border-b border-white/[0.06] px-3 py-2.5 text-left transition-colors
                            ${active ? 'border-l-2 border-l-neon-blue bg-neon-blue/14 pl-[10px]' : 'border-l-2 border-l-transparent hover:bg-white/[0.05]'}`}
                        >
                          <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${active ? 'text-neon-blue' : 'text-gray-500'}`} />
                          <div className="min-w-0 flex-1">
                            <span
                              className={`mb-0.5 inline-block rounded border px-1.5 py-px text-[8px] font-mono uppercase tracking-wide
                                ${hit.kind === 'parroquia' ? 'border-cyan-500/35 text-cyan-400/90' : hit.kind === 'municipio' ? 'border-purple-500/35 text-purple-300/90' : 'border-white/20 text-gray-400'}`}
                            >
                              {badge}
                            </span>
                            <div className={`truncate text-[13px] font-medium leading-snug ${active ? 'text-white' : 'text-gray-200'}`}>{title}</div>
                            <div className="mt-0.5 truncate font-mono text-[10px] text-gray-500">{sub}</div>
                          </div>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
            {mapSearchOpen && territorialSearchQuery.length > 0 && territorialSearchQuery.length < 2 && (
              <p className="text-center font-mono text-[10px] text-gray-500">Mínimo 2 caracteres para buscar</p>
            )}
          </div>
        )}
      </div>

      {/* Mapa + Sidebar: en &lt;lg el panel es drawer encima del mapa a pantalla completa */}
      <div className="tactical-map-frame relative flex min-h-0 flex-1 overflow-hidden rounded-lg">
        <TacticalDesktopRail
          mode={tacticalRailMode}
          showTerritoryPanel={showTerritoryPanel}
          onSelectMap={() => {
            setLayersPanelOpen(false)
          }}
          onSelectLayers={() => {
            setMobileSettingsOpen(false)
            setLayersPanelOpen(true)
          }}
          onSelectNodes={() => {
            if (!showTerritoryPanel) return
            setMobileSettingsOpen(false)
            setSidebarOpen(true)
          }}
          onHome={flyOperationalHome}
        />
        {/* Mapa */}
        <div className="relative min-h-0 min-w-0 flex-1 territory-map lg:pb-3">
          <NeuralMobileRail
            open={mobileRailOpen}
            onOpenChange={setMobileRailOpen}
            showTerritoryPanel={showTerritoryPanel}
            onMenu={() => {
              setMobileSettingsOpen(false)
              if (showTerritoryPanel) setSidebarOpen(true)
            }}
            onLayers={() => {
              setMobileSettingsOpen(false)
              setLayersPanelOpen(true)
            }}
            onToggleRedi={() => setShowRediLayer(r => !r)}
            onSettings={() => setMobileSettingsOpen(true)}
            rediActive={showRediLayer}
            territorySidebarOpen={sidebarOpen}
            layersButtonVisible={!layersPanelOpen}
          />
          <NeuralMobileBottomNav
            active={mobileNavTab}
            onChange={handleMobileNav}
            showAnalytics={showSummaryToolbar}
            showVital={showGeolocation}
          />

          <div
            className={`pointer-events-none absolute inset-0 max-lg:pb-14 lg:bottom-0 lg:left-0 lg:right-0 lg:top-0 lg:pl-0 ${mobileRailOpen ? 'max-lg:pl-12' : 'max-lg:pl-0'}`}
          >
          {/* Panel sector / coordenadas — escritorio */}
          {hud?.mapCenter != null && (
            <div className="tactical-hud-glass pointer-events-auto absolute right-3 top-3 z-[1004] hidden max-w-[15rem] rounded-md p-2.5 lg:block">
              <div className="tactical-label-muted mb-1">Sector · map_core</div>
              <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-cyan-400/85">
                <div>
                  Lat{' '}
                  <span className="tactical-data-glow tabular-nums">{hud.mapCenter.lat.toFixed(5)}</span>
                </div>
                <div>
                  Lng{' '}
                  <span className="tactical-data-glow tabular-nums">{hud.mapCenter.lng.toFixed(5)}</span>
                </div>
              </div>
            </div>
          )}
          {/* Búsqueda territorial flotante — solo escritorio */}
          {showMapSearch && (
          <div
            ref={mapSearchRef}
            className="pointer-events-none absolute top-2 z-[1100] hidden w-[min(calc(100%-2.5rem),26rem)] sm:top-3 lg:left-1/2 lg:block lg:-translate-x-1/2"
          >
            <div className="pointer-events-auto">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.45)]" />
                <input
                  ref={el => {
                    if (hud) hud.desktopSearchInputRef.current = el
                  }}
                  type="search"
                  value={territorialSearchQuery}
                  onChange={(e) => {
                    setTerritorialSearchQuery(e.target.value)
                    setMapSearchOpen(true)
                  }}
                  onFocus={() => setMapSearchOpen(true)}
                  onKeyDown={onMapSearchKeyDown}
                  placeholder="Buscar municipio, parroquia o estado…"
                  className="input-territory-search w-full rounded-xl border border-cyan-500/25 py-2 pl-9 pr-9 font-mono text-[11px] font-medium sm:py-2.5 sm:pl-10 sm:pr-10 sm:text-[12px] shadow-[0_8px_36px_rgba(0,0,0,0.55),0_0_24px_rgba(34,211,238,0.04)] backdrop-blur-md focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                  autoComplete="off"
                  spellCheck={false}
                  aria-autocomplete="list"
                  aria-expanded={showMapSearchDropdown}
                  aria-controls="territory-search-results"
                />
                {territorialSearchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTerritorialSearchQuery('')
                      setSearchHighlightIdx(0)
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {showMapSearchDropdown && (
                  <div
                    id="territory-search-results"
                    role="listbox"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] max-h-[min(18rem,40vh)] overflow-y-auto rounded-xl border border-cyan-500/20 bg-[rgba(6,10,14,0.97)] shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_1px_rgba(34,211,238,0.12)] ring-1 ring-cyan-500/10 backdrop-blur-xl"
                  >
                    {searchHits.length === 0 ? (
                      <div className="px-4 py-5 text-center text-xs text-gray-500 font-mono">
                        Sin coincidencias · prueba otro término
                      </div>
                    ) : (
                      <>
                        <div className="sticky top-0 z-10 px-3 py-1.5 border-b border-white/8 bg-shadow-900/98 text-[9px] font-mono text-gray-500 uppercase tracking-wider">
                          {searchHits.length} resultado{searchHits.length === 1 ? '' : 's'} · ↑↓ navegar · Enter seleccionar
                        </div>
                        {searchHits.map((hit, idx) => {
                          const active = idx === searchHighlightIdx
                          const badge = hit.kind === 'estado' ? 'Estado' : hit.kind === 'municipio' ? 'Municipio' : 'Parroquia'
                          const Icon = hit.kind === 'estado' ? MapPin : hit.kind === 'municipio' ? Layers : LayoutGrid
                          const title =
                            hit.kind === 'estado'
                              ? hit.state.name
                              : hit.kind === 'municipio'
                                ? hit.municipio.display
                                : hit.parish.display
                          const sub =
                            hit.kind === 'estado'
                              ? getStateRedi(hit.state.name) || '—'
                              : hit.kind === 'municipio'
                                ? hit.state.name
                                : `${hit.municipio.display} · ${hit.state.name}`
                          const key =
                            hit.kind === 'estado'
                              ? `me-${hit.state.id}-${idx}`
                              : hit.kind === 'municipio'
                                ? `mm-${hit.state.id}-${hit.municipio.norm}-${idx}`
                                : `mp-${hit.parish.pcode}-${idx}`
                          return (
                            <button
                              key={key}
                              type="button"
                              role="option"
                              aria-selected={active}
                              onMouseEnter={() => setSearchHighlightIdx(idx)}
                              onClick={() => applySearchHit(hit)}
                              className={`w-full text-left px-3 py-2.5 border-b border-white/[0.06] flex items-start gap-2.5 transition-colors
                                ${active ? 'bg-neon-blue/14 border-l-2 border-l-neon-blue pl-[10px]' : 'hover:bg-white/[0.05] border-l-2 border-l-transparent'}`}
                            >
                              <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${active ? 'text-neon-blue' : 'text-gray-500'}`} />
                              <div className="min-w-0 flex-1">
                                <span
                                  className={`inline-block text-[8px] font-mono uppercase tracking-wide px-1.5 py-px rounded border mb-0.5
                                    ${hit.kind === 'parroquia' ? 'border-cyan-500/35 text-cyan-400/90' : hit.kind === 'municipio' ? 'border-purple-500/35 text-purple-300/90' : 'border-white/20 text-gray-400'}`}
                                >
                                  {badge}
                                </span>
                                <div className={`text-[13px] font-medium leading-snug truncate ${active ? 'text-white' : 'text-gray-200'}`}>
                                  {title}
                                </div>
                                <div className="text-[10px] text-gray-500 font-mono truncate mt-0.5">{sub}</div>
                              </div>
                            </button>
                          )
                        })}
                      </>
                    )}
                  </div>
                )}
                {mapSearchOpen && searchNormLen > 0 && searchNormLen < 2 && (
                  <p className="mt-2 text-center text-[10px] text-gray-500 font-mono">Mínimo 2 caracteres para buscar</p>
                )}
              </div>
            </div>
          </div>
          )}
          </div>
          <style>{`
            .territory-map .leaflet-container {
              background: #0a0e14;
              width: 100%;
              height: 100%;
            }
            .territory-map .leaflet-tile-pane {
              filter: brightness(0.25) saturate(0.15) contrast(1.4);
            }
            .centinela-tooltip {
              background: rgba(10, 14, 20, 0.95) !important;
              border: 1px solid rgba(255,255,255,0.1) !important;
              border-radius: 8px !important;
              padding: 6px 10px !important;
              color: #d1d5db !important;
              box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
            }
            .centinela-tooltip::before { display: none !important; }
            @media (max-width: 1023px) {
              .territory-map .leaflet-top.leaflet-left {
                top: 0.5rem !important;
                left: auto !important;
                right: 0.5rem !important;
              }
            }
            @media (min-width: 1024px) {
              .territory-map .leaflet-control-zoom {
                border: 1px solid rgba(0, 242, 255, 0.22) !important;
                box-shadow: 0 0 16px rgba(0, 242, 255, 0.08) !important;
              }
            }
            .territory-map .leaflet-control-zoom {
              border: 1px solid rgba(255,255,255,0.1) !important;
              border-radius: 8px !important;
              overflow: hidden;
            }
            .territory-map .leaflet-control-zoom a {
              background: rgba(10, 14, 20, 0.9) !important;
              color: #9ca3af !important;
              border-color: rgba(255,255,255,0.05) !important;
            }
            .territory-map .leaflet-control-zoom a:hover {
              background: rgba(20, 28, 40, 0.95) !important;
              color: #ffffff !important;
            }
            .territory-map .leaflet-control-attribution { display: none; }
            .territory-map .leaflet-tooltip.muni-tooltip-hover {
              background: rgba(15, 10, 28, 0.92) !important;
              border: 1px solid rgba(192, 132, 252, 0.45) !important;
              border-radius: 10px !important;
              padding: 8px 12px !important;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.04) inset !important;
              color: #e9d5ff !important;
            }
            .territory-map .leaflet-tooltip.muni-tooltip-hover::before { display: none !important; }
            .muni-hover-inner { display: flex; flex-direction: column; gap: 2px; font-family: ui-monospace, monospace; }
            .muni-hover-name { font-size: 12px; font-weight: 700; color: #f5d0fe; letter-spacing: 0.02em; }
            .muni-hover-state { font-size: 10px; color: #a78bfa; opacity: 0.95; }
            .territory-map .leaflet-tooltip.muni-label-permanent {
              background: transparent !important;
              border: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              pointer-events: none !important;
            }
            .territory-map .leaflet-tooltip.muni-label-permanent::before { display: none !important; }
            .muni-perm-inner {
              font-family: ui-monospace, monospace;
              font-size: 8px;
              font-weight: 600;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              color: rgba(216, 180, 254, 0.88);
              text-shadow:
                0 0 8px rgba(0, 0, 0, 0.95),
                0 1px 2px rgba(0, 0, 0, 0.9),
                0 0 1px rgba(88, 28, 135, 0.8);
              max-width: 120px;
              text-align: center;
              line-height: 1.15;
            }
            .territory-map .leaflet-tooltip.parish-tooltip-hover {
              background: rgba(8, 25, 35, 0.94) !important;
              border: 1px solid rgba(34, 211, 238, 0.45) !important;
              border-radius: 10px !important;
              padding: 7px 11px !important;
              box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45) !important;
              color: #cffafe !important;
            }
            .territory-map .leaflet-tooltip.parish-tooltip-hover::before { display: none !important; }
            .parish-hover-inner { display: flex; flex-direction: column; gap: 2px; font-family: ui-monospace, monospace; }
            .parish-hover-name { font-size: 11px; font-weight: 700; color: #a5f3fc; letter-spacing: 0.02em; }
            .parish-hover-muni { font-size: 9px; color: #67e8f9; opacity: 0.92; }
            .territory-map .leaflet-tooltip.parish-label-permanent {
              background: transparent !important;
              border: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              pointer-events: none !important;
            }
            .territory-map .leaflet-tooltip.parish-label-permanent::before { display: none !important; }
            .parish-perm-inner {
              font-family: ui-monospace, monospace;
              font-size: 7px;
              font-weight: 600;
              letter-spacing: 0.05em;
              text-transform: uppercase;
              color: rgba(165, 243, 252, 0.9);
              text-shadow:
                0 0 8px rgba(0, 0, 0, 0.95),
                0 1px 2px rgba(0, 0, 0, 0.9),
                0 0 1px rgba(8, 145, 178, 0.7);
              max-width: 100px;
              text-align: center;
              line-height: 1.1;
            }
            @keyframes user-loc-pulse {
              0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.9; }
              65% { opacity: 0.2; }
              100% { transform: translate(-50%, -50%) scale(2.15); opacity: 0; }
            }
            @keyframes user-loc-core-glow {
              0%, 100% {
                box-shadow:
                  0 0 14px #22d3ee,
                  0 0 32px rgba(34, 211, 238, 0.5),
                  inset 0 0 10px rgba(255, 255, 255, 0.35);
                transform: scale(1) rotate(0deg);
              }
              50% {
                box-shadow:
                  0 0 22px #a5f3fc,
                  0 0 48px rgba(165, 243, 252, 0.55),
                  inset 0 0 14px rgba(255, 255, 255, 0.5);
                transform: scale(1.12) rotate(2deg);
              }
            }
            .user-loc-divicon {
              background: transparent !important;
              border: none !important;
            }
            .user-loc-marker-root {
              position: relative;
              width: 56px;
              height: 56px;
              pointer-events: none;
            }
            .user-loc-ring {
              position: absolute;
              left: 50%;
              top: 50%;
              width: 34px;
              height: 34px;
              margin: 0;
              transform: translate(-50%, -50%);
              border-radius: 50%;
              border: 2px solid rgba(34, 211, 238, 0.9);
              animation: user-loc-pulse 2.1s ease-out infinite;
              box-sizing: border-box;
            }
            .user-loc-ring-delay {
              animation-delay: 1.05s;
            }
            .user-loc-core {
              position: absolute;
              left: 50%;
              top: 50%;
              width: 15px;
              height: 15px;
              margin-left: -7.5px;
              margin-top: -7.5px;
              border-radius: 50%;
              background: linear-gradient(145deg, #f0f9ff, #06b6d4);
              border: 2px solid #fff;
              animation: user-loc-core-glow 1.25s ease-in-out infinite;
            }
          `}</style>

          <div className="pointer-events-auto absolute inset-0">
            <MapContainer
              center={[7.5, -66.58]}
              zoom={5.5}
              minZoom={4}
              maxZoom={16}
              maxBounds={[[0, -78], [16, -55]]}
              style={{ width: '100%', height: '100%' }}
              zoomControl={true}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap'
              />

              <MapController fly={flyTarget} />
              <MapZoomSync onZoom={setMapZoom} />
              <MapInvalidateWhenSidebarChanges sidebarOpen={sidebarOpen} />
              <MapLayerPanes zByPane={paneZIndices} />
              <MapHudBridges />
              {showGeolocation && myLocation && myLocationCardVisible && (
                <MapMyLocationMobileFraming
                  lat={myLocation.lat}
                  lng={myLocation.lng}
                  active
                />
              )}

              {showCountrySilhouette && countryOutlineGeo && (
                <GeoJSON
                  key={`country-${geoKey}`}
                  data={countryOutlineGeo}
                  pane="venCountry"
                  interactive={false}
                  style={() => ({
                    fillColor: '#0f172a',
                    fillOpacity: 0.38,
                    color: 'rgba(186, 198, 214, 0.92)',
                    weight: 2.1,
                    opacity: 1,
                  })}
                />
              )}

              {statesGeo && showStatesLayer && !showRediLayer && (
                <GeoJSON
                  key={`states-neutral-${geoKey}-${myLocVisualIsolate ? 'iso' : 'all'}`}
                  data={statesGeo}
                  pane="venStates"
                  style={neutralStateStyle}
                  onEachFeature={onEachStateNeutral}
                />
              )}

              {(showStatesLayer || showRediLayer || showMunicipalities || showParishes) && (
                <GeoJSON
                  key={`esequibo-${showRediLayer ? 'r' : showParishes ? 'p' : showMunicipalities ? 'm' : 'n'}-${myLocVisualIsolate ? 'd' : 'n'}`}
                  data={ESEQUIBO_GEOJSON}
                  pane="venEsequibo"
                  style={() => {
                    if (showRediLayer) {
                      return {
                        fillColor: REDI_GUAYANA_COLOR,
                        fillOpacity: myLocVisualIsolate ? 0.07 : 0.22,
                        color: REDI_GUAYANA_COLOR,
                        weight: 1.5,
                        opacity: myLocVisualIsolate ? 0.35 : 0.85,
                      }
                    }
                    if (showParishes) {
                      return getEsequiboParishSilhouetteStyle()
                    }
                    if (showMunicipalities) {
                      return getEsequiboMunicipalitySilhouetteStyle()
                    }
                    return {
                      fillColor: '#64748b',
                      fillOpacity: myLocVisualIsolate ? 0.06 : 0.14,
                      color: 'rgba(226, 232, 240, 0.45)',
                      weight: 1.2,
                      opacity: 0.85,
                    }
                  }}
                  onEachFeature={
                    showRediLayer
                      ? onEachEsequiboRedi
                      : showParishes
                        ? onEachEsequiboAsParish
                        : showMunicipalities
                          ? onEachEsequiboAsMunicipality
                          : onEachEsequiboNeutral
                  }
                />
              )}

              {showMunicipalities && muniGeo && (
                <GeoJSON
                  key={`municipalities-${mapZoom >= 10}-${myLocMuniGid ?? 'x'}-${myLocVisualIsolate ? 'f' : 'a'}`}
                  data={muniGeo}
                  pane="venMuni"
                  style={getMunicipalityStyle}
                  onEachFeature={onEachMunicipality}
                />
              )}

              {showParishes && parishGeo && (
                <GeoJSON
                  key={`parishes-${mapZoom >= 11}-${myLocParishPcode ?? 'x'}-${myLocVisualIsolate ? 'f' : 'a'}`}
                  data={parishGeo}
                  pane="venParish"
                  style={getParishStyle}
                  onEachFeature={onEachParish}
                />
              )}

              {statesGeo && showRediLayer && (
                <GeoJSON
                  key={`states-redi-${geoKey}-${myLocVisualIsolate ? 'iso' : 'all'}`}
                  data={statesGeo}
                  pane="venRedi"
                  style={stateStyle}
                  onEachFeature={onEachStateRedi}
                />
              )}

              {showMarkers && markers.map(m => {
                const riskColor = m.riskLevel === 'CRITICAL' ? '#ef4444'
                  : m.riskLevel === 'HIGH' ? '#f97316'
                  : m.riskLevel === 'MEDIUM' ? '#eab308'
                  : '#22c55e'

                const icon = L.divIcon({
                  className: 'strategic-marker',
                  html: `<div style="
                    width:28px;height:28px;border-radius:50%;
                    background:${m.typeColor}18;
                    border:2px solid ${m.typeColor};
                    display:flex;align-items:center;justify-content:center;
                    font-size:14px;cursor:pointer;
                    box-shadow:0 0 16px rgba(0,242,255,0.35), 0 0 8px ${m.typeColor}55, inset 0 0 10px rgba(0,242,255,0.06);
                  ">${m.typeIcon}</div>`,
                  iconSize: [28, 28],
                  iconAnchor: [14, 14],
                })

                return (
                  <Marker key={m.id} position={[m.lat, m.lng]} icon={icon}>
                    <Popup>
                      <div style={{ fontFamily: 'monospace', fontSize: '11px', minWidth: '180px' }}>
                        <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>
                          {m.typeIcon} {m.name}
                        </div>
                        {m.groupName && (
                          <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '6px' }}>
                            {m.groupName}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{
                            padding: '1px 6px', borderRadius: '4px', fontSize: '9px',
                            background: `${m.typeColor}20`, color: m.typeColor, border: `1px solid ${m.typeColor}40`
                          }}>{m.typeLabel}</span>
                          <span style={{
                            padding: '1px 6px', borderRadius: '4px', fontSize: '9px',
                            background: `${riskColor}20`, color: riskColor, border: `1px solid ${riskColor}40`
                          }}>{m.riskLevel}</span>
                        </div>
                        {m.description && (
                          <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '4px' }}>
                            {m.description}
                          </div>
                        )}
                        {m.address && (
                          <div style={{ color: '#94a3b8', fontSize: '9px', marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
                            {m.address}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )
              })}

              {showGeolocation && myLocation && userLocationIcon && (
                <Marker position={[myLocation.lat, myLocation.lng]} icon={userLocationIcon} />
              )}
            </MapContainer>
            <div
              className="tactical-map-grid-overlay pointer-events-none absolute inset-0 z-[450] hidden opacity-[0.12] lg:block"
              aria-hidden
            />
          </div>

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1006] hidden justify-end gap-2 px-2 pb-1.5 pt-0 lg:left-[50px] lg:flex">
            <div className="pointer-events-auto flex flex-col items-end justify-end gap-1">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={flyOperationalHome}
                  className="tactical-hud-glass rounded-md p-2 text-cyan-400/85 transition-colors hover:border-cyan-400/35 hover:text-cyan-100"
                  title="Encuadre Venezuela"
                  aria-label="Encuadre Venezuela"
                >
                  <Crosshair className="h-4 w-4" strokeWidth={1.35} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileSettingsOpen(false)
                    setLayersPanelOpen(true)
                  }}
                  className="tactical-hud-glass rounded-md p-2 text-cyan-400/85 transition-colors hover:border-cyan-400/35 hover:text-cyan-100"
                  title="Gestor de capas"
                  aria-label="Gestor de capas"
                >
                  <Filter className="h-4 w-4" strokeWidth={1.35} />
                </button>
              </div>
              <span className="font-mono text-[6px] uppercase tracking-[0.2em] text-slate-600">
                Encryption · AES-256-GCM
              </span>
            </div>
          </div>

          <MapLayerManager
            open={layersPanelOpen}
            onOpenChange={setLayersPanelOpen}
            layerOrder={safeLayerOrder}
            onLayerOrderChange={next => setLayerOrder(normalizeLayerOrder(next))}
            visibility={layerVisibility}
            onVisibilityChange={onLayerVisibilityChange}
            tabClassName="hidden"
          />

          {showGeolocation && myLocError && (
            <div className="absolute top-16 sm:top-14 left-3 right-3 sm:left-14 sm:right-auto z-[1001] max-w-[min(20rem,calc(100%-1.5rem))] sm:max-w-[min(20rem,calc(100%-5rem))] rounded-lg border border-neon-red/40 bg-shadow-900/95 px-3 py-2 text-[10px] font-mono text-red-200 shadow-lg backdrop-blur-sm">
              {myLocError}
            </div>
          )}

          <AnimatePresence>
            {showGeolocation && myLocation && myLocationCardVisible && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.22 }}
                className="absolute bottom-[calc(3.5rem+14px)] left-2 right-2 top-auto z-[1001] max-h-[min(46vh,calc(100dvh-9.5rem))] overflow-y-auto rounded-lg border border-cyan-500/45 bg-shadow-900/96 shadow-2xl backdrop-blur-md
                  lg:bottom-auto lg:top-14 lg:left-auto lg:right-3 lg:max-h-none lg:w-[min(18rem,calc(100vw-1.5rem))] lg:max-w-[min(18rem,calc(100vw-1.5rem))] lg:overflow-hidden"
              >
                <div className="flex items-start justify-between gap-1.5 sm:gap-2 border-b border-cyan-500/25 px-2 py-2 sm:px-3 sm:py-2.5">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-[11px] sm:text-xs font-bold text-white leading-tight truncate">Tu ubicación</h3>
                      <p
                        className="text-[7px] sm:text-[9px] text-cyan-400/85 font-mono mt-0.5 sm:mt-1 leading-snug line-clamp-2 sm:line-clamp-none"
                        title={`${formatDeviceCaptureDateTime(myLocation.capturedAtMs)} — reloj del dispositivo`}
                      >
                        <span className="text-gray-500 max-sm:hidden">Fecha y hora · </span>
                        <span className="sm:hidden text-gray-500">Fecha · </span>
                        {formatDeviceCaptureDateTime(myLocation.capturedAtMs)}
                      </p>
                      {typeof myLocation.accuracy === 'number' && (
                        <p className="text-[8px] sm:text-[9px] text-gray-500 font-mono mt-0.5">
                          ±{Math.round(myLocation.accuracy)} m GPS
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMyLocationCardVisible(false)}
                    className="text-gray-500 hover:text-white flex-shrink-0 p-0.5 rounded"
                    aria-label="Cerrar tarjeta"
                  >
                    <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>
                <div className="px-2 py-2 sm:px-3 sm:py-2.5 space-y-1 sm:space-y-1.5 text-[9px] sm:text-[10px] font-mono text-gray-300">
                  {myLocReversePending && (
                    <div className="flex items-center gap-2 text-cyan-400/90 py-0.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                      Resolviendo dirección (OSM)…
                    </div>
                  )}
                  {!myLocReversePending && (
                    <>
                      {myLocationDetail?.estado && (
                        <p>
                          <span className="text-gray-500">Estado</span>{' '}
                          <span className="text-gray-100">{myLocationDetail.estado}</span>
                        </p>
                      )}
                      {myLocationDetail?.municipio && (
                        <p>
                          <span className="text-gray-500">Municipio</span>{' '}
                          <span className="text-gray-100">{myLocationDetail.municipio}</span>
                        </p>
                      )}
                      {myLocationDetail?.parroquia && (
                        <p>
                          <span className="text-gray-500">Parroquia / sector</span>{' '}
                          <span className="text-gray-100">{myLocationDetail.parroquia}</span>
                        </p>
                      )}
                      {myLocationDetail?.street && (
                        <p>
                          <span className="text-gray-500">Calle</span>{' '}
                          <span className="text-gray-100">{myLocationDetail.street}</span>
                        </p>
                      )}
                      <p className="text-[7px] sm:text-[8px] text-gray-600 leading-snug hidden sm:block">
                        Parroquia administrativa puede no coincidir con OSM (sector/barrio).
                      </p>
                    </>
                  )}
                  <p className="pt-1 border-t border-white/10 text-cyan-200/90 text-[9px] sm:text-[10px] break-all">
                    {myLocation.lat.toFixed(6)}, {myLocation.lng.toFixed(6)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2 border-t border-white/10 px-2 py-2 sm:px-3 sm:py-2.5 bg-black/25">
                  <button
                    type="button"
                    onClick={() => void copyMyLocation()}
                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[9px] sm:text-[10px] font-mono border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10 hover:border-cyan-500/35"
                  >
                    <Clipboard className="w-3 h-3 flex-shrink-0" />
                    Copiar
                  </button>
                  <button
                    type="button"
                    onClick={() => void shareMyLocation()}
                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[9px] sm:text-[10px] font-mono border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                  >
                    <Share2 className="w-3 h-3 flex-shrink-0" />
                    Compartir
                  </button>
                  <button
                    type="button"
                    onClick={clearMyLocationMarker}
                    className="ml-auto text-[9px] sm:text-[10px] font-mono text-gray-500 hover:text-red-300 px-1 py-1 sm:py-1.5"
                  >
                    Quitar
                  </button>
                </div>
                {myLocActionMsg && (
                  <p className="px-2 sm:px-3 pb-1.5 sm:pb-2 text-[8px] sm:text-[9px] font-mono text-neon-green">{myLocActionMsg}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {(geoLoading || (parishesLoading && showParishes && !parishGeo)) && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-shadow-900/60 backdrop-blur-sm pointer-events-none">
              <div className="flex items-center gap-3 bg-shadow-800 border border-white/10 rounded-lg px-4 py-3">
                <Loader2 className="w-5 h-5 text-neon-blue animate-spin" />
                <span className="text-xs font-mono text-gray-400">
                  {parishesLoading && showParishes && !parishGeo && !geoLoading
                    ? 'Cargando parroquias (~20 MB)…'
                    : 'Cargando capas geográficas...'}
                </span>
              </div>
            </div>
          )}

          {/* Leyenda REDI + panel municipio */}
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-[1000] flex max-w-none flex-col items-stretch gap-2 max-lg:bottom-16 sm:bottom-3 sm:left-3 sm:right-auto sm:max-w-[min(18rem,calc(100vw-1.5rem))] [&>*]:pointer-events-auto">
            <AnimatePresence>
              {selectedParish && showParishes && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  className="bg-shadow-900/95 backdrop-blur-md rounded-lg border border-cyan-500/40 shadow-2xl overflow-hidden"
                >
                  <div className="p-2.5 border-b border-cyan-500/25 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <LayoutGrid className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                        <h3 className="text-xs font-bold text-cyan-100 leading-tight truncate" title={selectedParish.parish}>
                          {selectedParish.parish}
                        </h3>
                      </div>
                      <p className="text-[9px] text-gray-500 font-mono">
                        Municipio · <span className="text-gray-400">{selectedParish.municipality}</span>
                      </p>
                      <p className="text-[9px] text-gray-500 font-mono mt-0.5">
                        Estado · <span className="text-gray-400">{selectedParish.state}</span>
                      </p>
                      <p className="text-[8px] text-gray-600 font-mono mt-1">COD · {selectedParish.pcode}</p>
                      {(() => {
                        const r = getStateRedi(selectedParish.state)
                        if (!r) return null
                        return (
                          <span
                            className="inline-block mt-1.5 text-[8px] font-mono px-1.5 py-0.5 rounded border"
                            style={{
                              color: REDI_COLORS[r],
                              borderColor: `${REDI_COLORS[r]}55`,
                              background: `${REDI_COLORS[r]}18`,
                            }}
                          >
                            {r}
                          </span>
                        )
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedParish(null)}
                      className="text-gray-500 hover:text-white flex-shrink-0 p-0.5"
                      aria-label="Cerrar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="px-2.5 py-2 text-[8px] text-gray-500 font-mono leading-relaxed border-t border-cyan-500/15">
                    Clic en otra parroquia para cambiar. Datos OCHA COD-AB (ADM3).
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {selectedMunicipality && showMunicipalities && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  className="bg-shadow-900/95 backdrop-blur-md rounded-lg border border-purple-500/35 shadow-2xl overflow-hidden"
                >
                  <div className="p-2.5 border-b border-purple-500/20 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Layers className="w-3.5 h-3.5 text-neon-purple flex-shrink-0" />
                        <h3 className="text-xs font-bold text-purple-200 leading-tight truncate" title={selectedMunicipality.municipality}>
                          {selectedMunicipality.municipality}
                        </h3>
                      </div>
                      <p className="text-[9px] text-gray-500 font-mono">
                        Estado · <span className="text-gray-400">{selectedMunicipality.state}</span>
                      </p>
                      {(() => {
                        const r = getStateRedi(selectedMunicipality.state)
                        if (!r) return null
                        return (
                          <span
                            className="inline-block mt-1.5 text-[8px] font-mono px-1.5 py-0.5 rounded border"
                            style={{
                              color: REDI_COLORS[r],
                              borderColor: `${REDI_COLORS[r]}55`,
                              background: `${REDI_COLORS[r]}18`,
                            }}
                          >
                            {r}
                          </span>
                        )
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedMunicipality(null)}
                      className="text-gray-500 hover:text-white flex-shrink-0 p-0.5"
                      aria-label="Cerrar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="px-2.5 py-2 text-[8px] text-gray-500 font-mono leading-relaxed border-t border-purple-500/10">
                    Clic en otro municipio para cambiar. Usa ✕ para cerrar.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="hidden max-h-[min(42vh,20rem)] overflow-y-auto overscroll-contain lg:block">
              <div className="rounded-lg border border-white/10 bg-shadow-900/90 px-2.5 py-2 sm:px-3 shadow-lg backdrop-blur-sm">
                <RediLegendInner
                  showRediLayer={showRediLayer}
                  showMunicipalities={showMunicipalities}
                  showParishes={showParishes}
                />
              </div>
            </div>
          </div>

          {/* Panel detalle estado */}
          <AnimatePresence>
            {selectedState && (() => {
              const redi = getStateRedi(selectedState.name)
              const accentColor = REDI_COLORS[redi] || '#6b7280'
              const subtitle = [
                selectedState.capital,
                redi || selectedState.region,
              ].filter(Boolean).join(' · ')
              const navAccent =
                redi === 'REDI GUAYANA'
                  ? 'bg-emerald-500/20 border border-emerald-500/45 text-emerald-300 hover:bg-emerald-500/30'
                  : 'bg-neon-blue/20 border border-neon-blue/40 text-neon-blue hover:bg-neon-blue/30'
              return (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute z-[1000] w-[min(100%,18rem)] sm:w-64 max-lg:left-3 max-lg:right-3 max-lg:top-[8.25rem] max-lg:max-h-[min(38vh,15rem)] max-lg:overflow-y-auto lg:top-3 lg:right-14 lg:left-auto lg:max-h-none bg-shadow-900/95 backdrop-blur-md
                    rounded-lg overflow-hidden shadow-2xl border border-white/10"
                >
                  <div className="p-2.5 border-b border-white/5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold flex items-center gap-1.5 text-white">
                        <div
                          className="w-2.5 h-2.5 rounded-sm"
                          style={{
                            background: accentColor,
                            boxShadow: `0 0 6px ${accentColor}66`,
                          }}
                        />
                        {selectedState.name}
                      </h3>
                      <button onClick={() => setSelectedState(null)} className="text-gray-500 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-[9px] text-gray-500 font-mono mt-0.5">
                      {selectedState.name === 'Guayana Esequiba' ? (
                        <>
                          <span style={{ color: accentColor }}>{redi}</span>
                          <span className="text-gray-600"> · 159.542 km²</span>
                        </>
                      ) : (
                        subtitle || '—'
                      )}
                    </div>
                  </div>

                  {(selectedState.metrics?.length ?? 0) > 0 && (
                    <div className="p-2.5 flex flex-wrap gap-3 justify-center border-b border-white/[0.04]">
                      {selectedState.metrics!.map(m => (
                        <div key={m.id} className="min-w-[3.5rem] text-center">
                          <div className="text-base font-bold font-mono text-gray-100 tabular-nums">
                            {m.value}
                          </div>
                          <div className="text-[8px] text-gray-500 leading-tight max-w-[6rem] mx-auto">
                            {m.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedState.population && (
                    <div className="px-2.5 pb-1.5 text-[8px] text-gray-600">
                      Pob: {selectedState.population.toLocaleString()}
                    </div>
                  )}
                  {onStateNavigate && (
                    <div className="p-2.5 border-t border-white/5">
                      <button
                        onClick={() => onStateNavigate(selectedState.id)}
                        className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded
                          text-[10px] font-mono transition-all ${navAccent}`}
                      >
                        <Eye className="w-3 h-3" /> Perfil completo
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </motion.div>
              )
            })()}
          </AnimatePresence>

          <AnimatePresence>
            {mobileNavTab === 'legend' && (
              <>
                <motion.button
                  key="mleg-backdrop"
                  type="button"
                  aria-label="Cerrar leyenda"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[2270] bg-black/50 backdrop-blur-[1px] lg:hidden"
                  onClick={() => handleMobileNav('explore')}
                />
                <motion.div
                  key="mleg-sheet"
                  role="dialog"
                  aria-labelledby="mobile-legend-title"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 340 }}
                  className="fixed inset-x-0 bottom-14 z-[2275] flex max-h-[min(48vh,26rem)] flex-col overflow-hidden rounded-t-2xl border border-cyan-500/35 bg-shadow-900/98 shadow-[0_-12px_48px_rgba(0,0,0,0.55)] backdrop-blur-md lg:hidden"
                >
                  <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Layers className="h-4 w-4 flex-shrink-0 text-neon-blue" aria-hidden />
                      <h2 id="mobile-legend-title" className="truncate text-[11px] font-mono font-bold tracking-wider text-cyan-200">
                        LEYENDA REDI
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMobileNav('explore')}
                      className="flex-shrink-0 rounded-md border border-white/10 p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
                      aria-label="Cerrar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
                    <RediLegendInner
                      showRediLayer={showRediLayer}
                      showMunicipalities={showMunicipalities}
                      showParishes={showParishes}
                    />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {mobileNavTab === 'analytics' && showSummaryToolbar && (
              <>
                <motion.button
                  key="man-backdrop"
                  type="button"
                  aria-label="Cerrar resumen"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[2270] bg-black/50 backdrop-blur-[1px] lg:hidden"
                  onClick={() => handleMobileNav('explore')}
                />
                <motion.div
                  key="man-sheet"
                  role="dialog"
                  aria-labelledby="mobile-analytics-title"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 340 }}
                  className="fixed inset-x-0 bottom-14 z-[2275] flex max-h-[min(42vh,22rem)] flex-col overflow-hidden rounded-t-2xl border border-neon-blue/35 bg-shadow-900/98 shadow-[0_-12px_48px_rgba(0,0,0,0.55)] backdrop-blur-md lg:hidden"
                >
                  <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <BarChart3 className="h-4 w-4 flex-shrink-0 text-neon-blue" aria-hidden />
                      <h2 id="mobile-analytics-title" className="truncate text-[11px] font-mono font-bold tracking-wider text-gray-100">
                        RESUMEN OPERATIVO
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMobileNav('explore')}
                      className="flex-shrink-0 rounded-md border border-white/10 p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
                      aria-label="Cerrar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {summaryToolbarItems.map(m => (
                        <div key={m.id} className="rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-center">
                          <div className="text-lg font-mono font-bold tabular-nums text-cyan-200">{m.value}</div>
                          <div className="mt-0.5 text-[8px] font-mono uppercase leading-tight text-gray-500">{m.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {mobileSettingsOpen && (
              <>
                <motion.button
                  key="mset-backdrop"
                  type="button"
                  aria-label="Cerrar ajustes"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[2270] bg-black/50 backdrop-blur-[1px] lg:hidden"
                  onClick={() => setMobileSettingsOpen(false)}
                />
                <motion.div
                  key="mset-sheet"
                  role="dialog"
                  aria-labelledby="mobile-settings-title"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 340 }}
                  className="fixed inset-x-0 bottom-14 z-[2275] flex max-h-[min(52vh,28rem)] flex-col overflow-hidden rounded-t-2xl border border-white/15 bg-shadow-900/98 shadow-[0_-12px_48px_rgba(0,0,0,0.55)] backdrop-blur-md lg:hidden"
                >
                  <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Globe2 className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden />
                      <h2 id="mobile-settings-title" className="truncate text-[11px] font-mono font-bold tracking-wider text-gray-100">
                        AJUSTES DE CAPAS
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobileSettingsOpen(false)}
                      className="flex-shrink-0 rounded-md border border-white/10 p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
                      aria-label="Cerrar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2.5">
                    {(
                      [
                        { on: showCountrySilhouette, set: () => setShowCountrySilhouette(v => !v), label: 'Silueta Venezuela', Icon: Globe2 },
                        { on: showStatesLayer, set: () => setShowStatesLayer(v => !v), label: 'Estados', Icon: MapIcon },
                        { on: showMunicipalities, set: () => setShowMunicipalities(v => !v), label: 'Municipios', Icon: Layers },
                        { on: showParishes, set: () => setShowParishes(v => !v), label: 'Parroquias', Icon: LayoutGrid },
                        { on: showRediLayer, set: () => setShowRediLayer(v => !v), label: 'REDI', Icon: Waypoints },
                        ...(markers.length > 0
                          ? [{ on: showMarkers, set: () => setShowMarkers(v => !v), label: `Marcadores (${markers.length})`, Icon: MapPin }]
                          : []),
                      ] as {
                        on: boolean
                        set: () => void
                        label: string
                        Icon: typeof Globe2
                      }[]
                    ).map(({ on, set, label, Icon: RowIcon }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={set}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-[10px] font-mono transition-colors
                          ${on ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100' : 'border-white/10 bg-black/20 text-gray-400 hover:bg-white/[0.06]'}`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <RowIcon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                          <span className="truncate">{label}</span>
                        </span>
                        <span className="flex-shrink-0 text-[9px] text-gray-500">{on ? 'ON' : 'OFF'}</span>
                      </button>
                    ))}
                    <p className="pt-1 text-center text-[8px] font-mono text-gray-600">Orden y apilado: pestaña «Capas» en el carril.</p>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

        </div>

        {showTerritoryPanel && sidebarOpen && (
          <button
            type="button"
            aria-label="Cerrar lista de territorios"
            className="fixed inset-0 z-[1998] bg-black/45 backdrop-blur-[1px] lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar: drawer en móvil, columna en desktop */}
        {showTerritoryPanel && sidebarOpen && (
          <div
            className="fixed inset-y-0 right-0 z-[1999] flex min-h-0 w-[min(20rem,calc(100vw-0.5rem))] flex-shrink-0 flex-col border-l border-white/10 bg-shadow-800/98 shadow-2xl
              lg:relative lg:inset-auto lg:z-auto lg:w-80 lg:max-w-[20rem] lg:border-l lg:border-cyan-500/15 lg:bg-[linear-gradient(180deg,rgba(8,10,14,0.96)_0%,rgba(5,7,11,0.98)_100%)] lg:shadow-[-8px_0_40px_rgba(0,0,0,0.35)]"
          >
            <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-cyan-500/15 bg-black/35 px-2.5 py-2 backdrop-blur-sm">
              <div className="flex min-w-0 items-center gap-2">
                <Users className="h-4 w-4 flex-shrink-0 text-cyan-400" aria-hidden />
                <span className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">Territorios</span>
                <span className="hidden font-mono text-[9px] text-cyan-500/50 sm:inline">· {stateData.length}</span>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="flex-shrink-0 rounded-md border border-cyan-500/20 p-1.5 text-gray-400 transition-colors hover:border-cyan-400/35 hover:bg-cyan-500/5 hover:text-cyan-100"
                title="Cerrar panel"
                aria-label="Cerrar panel de territorios"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-shrink-0 space-y-2 border-b border-cyan-500/10 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-500/60" />
                <input
                  type="search"
                  value={territorialSearchQuery}
                  onChange={(e) => setTerritorialSearchQuery(e.target.value)}
                  placeholder="Filtrar territorios…"
                  className="input-territory-search w-full rounded-lg border border-cyan-500/20 py-2 pl-8 pr-8 font-mono text-[10px] font-medium text-cyan-100/90 focus:border-cyan-400/45 focus:outline-none focus:ring-1 focus:ring-cyan-500/25"
                  autoComplete="off"
                />
                {territorialSearchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTerritorialSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-500 hover:text-white"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {parishesLoading && !parishGeo && parishIndexWanted && (
                <div className="flex items-center gap-2 text-[9px] text-cyan-400/90 font-mono">
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                  Cargando parroquias para búsqueda y árbol…
                </div>
              )}
            </div>
            {metricSortOptions.length > 0 && (
              <div className="px-2 py-1.5 border-b border-white/5 flex-shrink-0 flex items-center justify-between gap-2">
                <span className="text-[10px] text-gray-500 font-mono">Ordenar lista</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="text-[9px] bg-shadow-900 border border-white/10 rounded px-1 py-0.5 text-gray-400 max-w-[9rem]"
                >
                  <option value="name">A-Z</option>
                  {metricSortOptions.map(([id, label]) => (
                    <option key={id} value={`metric:${id}`}>
                      Por: {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {territorySearchQueryNorm(territorialSearchQuery).length >= 2 ? (
                <div className="pb-2">
                  {searchHits.length === 0 ? (
                    <p className="px-3 py-4 text-[10px] text-gray-500 font-mono text-center">Sin coincidencias. Prueba otro término.</p>
                  ) : (
                    <>
                      <div className="sticky top-0 z-10 px-2 py-1 bg-shadow-800/95 backdrop-blur-sm border-b border-white/5 text-[8px] font-mono text-gray-500">
                        {searchHits.length} resultado{searchHits.length === 1 ? '' : 's'} · clic para ir al mapa
                      </div>
                      {searchHits.map((hit, idx) => {
                        const key =
                          hit.kind === 'estado'
                            ? `e-${hit.state.id}-${idx}`
                            : hit.kind === 'municipio'
                              ? `m-${hit.state.id}-${hit.municipio.norm}-${idx}`
                              : `p-${hit.parish.pcode}-${idx}`
                        const badge =
                          hit.kind === 'estado' ? 'ESTADO' : hit.kind === 'municipio' ? 'MUNICIPIO' : 'PARROQUIA'
                        const title =
                          hit.kind === 'estado'
                            ? hit.state.name
                            : hit.kind === 'municipio'
                              ? hit.municipio.display
                              : hit.parish.display
                        const sub =
                          hit.kind === 'estado'
                            ? `${getStateRedi(hit.state.name) || '—'}`
                            : hit.kind === 'municipio'
                              ? `${hit.state.name}`
                              : `${hit.municipio.display} · ${hit.state.name}`
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => applySearchHit(hit)}
                            className="w-full text-left px-2.5 py-2 border-b border-white/5 hover:bg-white/[0.06] transition-colors"
                          >
                            <span
                              className="inline-block text-[7px] font-mono px-1 py-px rounded mb-0.5 border border-white/15 text-gray-400"
                            >
                              {badge}
                            </span>
                            <div className="text-[11px] font-medium text-white leading-snug">{title}</div>
                            <div className="text-[9px] text-gray-500 font-mono mt-0.5">{sub}</div>
                          </button>
                        )
                      })}
                    </>
                  )}
                </div>
              ) : (
                REDI_ORDER.map(redi => {
                  const rediStates = groupedByRedi.groups[redi]
                  if (!rediStates || rediStates.length === 0) return null
                  const rediColor = REDI_COLORS[redi]
                  return (
                    <div key={redi}>
                      <div className="sticky top-0 z-10 px-2 py-1.5 bg-shadow-800/95 backdrop-blur-sm border-b border-white/5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: rediColor, boxShadow: `0 0 4px ${rediColor}66` }} />
                            <span className="text-[9px] font-mono font-bold truncate" style={{ color: rediColor }}>{redi}</span>
                          </div>
                          <span className="text-[8px] font-mono text-gray-600 flex-shrink-0">{rediStates.length}</span>
                        </div>
                      </div>
                      {rediStates.map(state => {
                        const isActive = selectedState?.id === state.id
                        const isExpanded = !!expandedStateIds[state.id]
                        const munis = territoryIndex.byStateNorm.get(stateTerritoryKey(state)) ?? []
                        return (
                          <div key={state.id} className="border-b border-white/5">
                            <button
                              type="button"
                              onClick={() => handleStateRowToggle(state)}
                              className={`w-full text-left px-2 py-1.5 hover:bg-white/5 transition-all flex items-start gap-1
                                ${isActive ? 'bg-white/10 border-l-2' : 'border-l-2 border-l-transparent'}`}
                              style={isActive ? { borderLeftColor: rediColor } : undefined}
                            >
                              <span className="mt-0.5 text-gray-500 flex-shrink-0">
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={`text-[11px] font-medium truncate ${isActive ? '' : 'text-white'}`}
                                    style={isActive ? { color: rediColor } : undefined}
                                  >
                                    {state.name}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                  {(state.metrics ?? []).slice(0, 3).map(m => (
                                    <span key={m.id} className="text-[9px] font-mono text-gray-500">
                                      <span className="text-gray-400">{m.label}:</span>{' '}
                                      <span className="text-gray-300 tabular-nums">{m.value}</span>
                                    </span>
                                  ))}
                                  {munis.length > 0 && (
                                    <span className="text-[8px] font-mono text-gray-600 ml-auto">{munis.length} mun.</span>
                                  )}
                                </div>
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="pl-2 pr-1 pb-2 border-t border-white/[0.04] bg-black/15">
                                {munis.length === 0 ? (
                                  <p className="text-[9px] text-gray-600 font-mono py-2 px-1">Sin municipios en capa GeoJSON.</p>
                                ) : (
                                  munis.map(m => {
                                    const mk = muniExpandKey(state.id, m.norm)
                                    const mOpen = !!expandedMuniKeys[mk]
                                    return (
                                      <div key={mk} className="mt-1">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setParishIndexWanted(true)
                                            setExpandedMuniKeys(prev => ({ ...prev, [mk]: !prev[mk] }))
                                            handlePickMunicipioSidebar(state, m)
                                          }}
                                          className={`w-full text-left flex items-start gap-1 px-1.5 py-1 rounded-md hover:bg-white/[0.06] transition-colors
                                            ${selectedMunicipality?.gid === m.gid ? 'bg-white/[0.08]' : ''}`}
                                        >
                                          <span className="text-gray-500 flex-shrink-0 mt-px">
                                            {mOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                          </span>
                                          <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-medium text-purple-200/95 truncate">{m.display}</div>
                                            <div className="text-[8px] font-mono text-gray-600">
                                              {parishGeo ? `${m.parishes.length} parroquias` : parishIndexWanted && parishesLoading ? '…' : 'Parroquias: —'}
                                            </div>
                                          </div>
                                        </button>
                                        {mOpen && (
                                          <div className="ml-4 mt-0.5 space-y-px border-l border-white/10 pl-2">
                                            {parishesLoading && !parishGeo ? (
                                              <div className="flex items-center gap-1.5 py-2 text-[9px] text-gray-500 font-mono">
                                                <Loader2 className="w-3 h-3 animate-spin" /> Cargando parroquias…
                                              </div>
                                            ) : m.parishes.length === 0 ? (
                                              <p className="text-[9px] text-gray-600 font-mono py-1.5">Sin parroquias en el índice.</p>
                                            ) : (
                                              m.parishes.map(par => (
                                                <button
                                                  key={par.pcode}
                                                  type="button"
                                                  onClick={() => handlePickParishSidebar(state, m, par)}
                                                  className={`w-full text-left py-1 px-1.5 rounded text-[9px] font-mono hover:bg-cyan-500/10 transition-colors truncate
                                                    ${selectedParish?.pcode === par.pcode ? 'text-cyan-300 bg-cyan-500/10' : 'text-gray-400'}`}
                                                >
                                                  {par.display}
                                                </button>
                                              ))
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
