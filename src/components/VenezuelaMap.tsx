// Mapa Estratégico de Venezuela
// Leaflet + GeoJSON: estados (ADM1) + municipios (ADM2) + parroquias (ADM3) + Guayana Esequiba

import { useState, useEffect, useCallback, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Building2, Users, ChevronRight, ChevronLeft, ChevronDown,
  Shield, Globe, Eye, Skull, X, Loader2, Layers, LayoutGrid, Search,
  Navigation, Clipboard, Share2, PanelRight,
} from 'lucide-react'
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet'
import type { Layer } from 'leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { REDI_COLORS, REDI_ORDER, getStateRedi, normalizeName } from '../config/redi'
import { ESEQUIBO_GEOJSON } from '../config/esequibo'
import type { StateData, MapMarker, TerritorialSummary, VenezuelaMapProps } from '../config/types'
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

const STATES_GEOJSON_URL = '/geo/ven-states.json'
const MUNICIPALITIES_GEOJSON_URL = '/geo/ven-municipalities.json'
/** Límites ADM3 — OCHA/HDX COD-AB (ven_admin3) */
const PARISHES_GEOJSON_URL = '/geo/ven-parishes.json'
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Nombres GADM (p. ej. AltoOrinoco) → texto legible */
function formatMunicipalityName(raw: string): string {
  if (!raw || raw === 'NA') return 'Sin nombre'
  let t = raw.replace(/_/g, ' ')
  t = t.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
  return t.replace(/\s+/g, ' ').trim()
}

function RediLegendInner({
  showMunicipalities,
  showParishes,
}: {
  showMunicipalities: boolean
  showParishes: boolean
}) {
  return (
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
    </>
  )
}

export function VenezuelaMap({
  stateData,
  summary,
  markers = [],
  onStateClick,
  onStateNavigate,
  showMunicipalitiesDefault = false,
  showMarkersDefault = true,
  className = '',
}: VenezuelaMapProps) {
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
  const [sortBy, setSortBy] = useState<'org_count' | 'person_count' | 'name'>('org_count')
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

  const [statesGeo, setStatesGeo] = useState<any>(null)
  const [muniGeo, setMuniGeo] = useState<any>(null)
  const [geoLoading, setGeoLoading] = useState(true)
  const [showMunicipalities, setShowMunicipalities] = useState(showMunicipalitiesDefault)
  const [showParishes, setShowParishes] = useState(false)
  const [parishGeo, setParishGeo] = useState<any>(null)
  const [parishesLoading, setParishesLoading] = useState(false)

  const [flyTarget, setFlyTarget] = useState<MapFlyRequest | null>(null)

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

  useEffect(() => {
    if (stateData.length === 0) return
    setGeoLoading(true)
    fetchGeoJSON(STATES_GEOJSON_URL)
      .then(data => {
        setStatesGeo(data)
        setGeoKey(k => k + 1)
      })
      .catch(err => console.error('Error GeoJSON estados:', err))
      .finally(() => setGeoLoading(false))
  }, [stateData])

  useEffect(() => {
    if (muniGeo) return
    fetchGeoJSON(MUNICIPALITIES_GEOJSON_URL)
      .then(setMuniGeo)
      .catch(err => console.error('Error GeoJSON municipios:', err))
  }, [muniGeo])

  const wantParishGeo = showParishes || parishIndexWanted

  useEffect(() => {
    if (showParishes) setParishIndexWanted(true)
  }, [showParishes])

  useEffect(() => {
    if (!wantParishGeo || parishGeo) return
    setParishesLoading(true)
    fetchGeoJSON(PARISHES_GEOJSON_URL)
      .then(setParishGeo)
      .catch(err => console.error('Error GeoJSON parroquias:', err))
      .finally(() => setParishesLoading(false))
  }, [wantParishGeo, parishGeo])

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
      if (mapSearchRef.current && !mapSearchRef.current.contains(e.target as Node)) {
        setMapSearchOpen(false)
      }
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
    const orgCount = stat?.org_count || 0

    const baseOp = orgCount > 0 ? 0.3 : 0.15
    return {
      fillColor: color,
      fillOpacity: myLocVisualIsolate ? baseOp * 0.22 : baseOp,
      color: color,
      weight: 1.5,
      opacity: myLocVisualIsolate ? 0.38 : 0.7,
    }
  }, [findStat, myLocVisualIsolate])

  const onEachState = useCallback((feature: any, layer: Layer) => {
    const name = feature?.properties?.NAME_1 || ''
    const stat = findStat(name)

    if (stat) {
      layer.bindTooltip(
        `<div style="font-family:monospace;font-size:11px">
          <strong>${stat.name}</strong><br/>
          <span style="color:#ff3366">${stat.org_count} orgs</span> · 
          <span style="color:#00d4ff">${stat.person_count} personas</span>
        </div>`,
        { sticky: true, className: 'centinela-tooltip' }
      )
    }

    layer.on('mouseover', () => {
      (layer as any).setStyle?.({
        fillOpacity: 0.5,
        weight: 2.5,
        color: '#ffffff',
        opacity: 1,
      })
      ;(layer as L.Path).bringToFront()
    })
    layer.on('mouseout', () => {
      (layer as any).setStyle?.(stateStyle(feature))
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
  }, [findStat, stateStyle, onStateClick])

  const onEachEsequibo = useCallback((_feature: any, layer: Layer) => {
    const eseqStat = stateData.find(s => s.name === 'Guayana Esequiba')
    layer.bindTooltip(
      `<div style="font-family:monospace;font-size:11px">
        <strong style="color:${REDI_GUAYANA_COLOR}">Guayana Esequiba</strong><br/>
        <span style="color:#6ee7b7;font-size:10px">REDI GUAYANA</span><br/>
        <span style="color:#ff3366">${eseqStat?.org_count || 0} orgs</span> · 
        <span style="color:#00d4ff">${eseqStat?.person_count || 0} personas</span><br/>
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
      return (b[sortBy] || 0) - (a[sortBy] || 0)
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort(sortFn)
    }

    return { groups }
  }, [stateData, sortBy])

  return (
    <div className={`h-full flex flex-col overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-2 flex-shrink-0 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-neon-blue flex-shrink-0" />
          <h1 className="text-sm sm:text-base font-display font-bold text-white truncate">TERRITORIO VENEZUELA</h1>
          <span className="text-[10px] text-gray-600 font-mono hidden sm:block">
            Mapa estratégico
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => setShowMunicipalities(!showMunicipalities)}
            title="Capa municipios"
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border transition-all
              ${showMunicipalities
                ? 'bg-neon-purple/20 border-neon-purple/40 text-neon-purple'
                : 'bg-shadow-800 border-white/10 text-gray-500 hover:text-gray-300'
              }`}
          >
            <Layers className="w-3 h-3 flex-shrink-0" />
            <span className="hidden sm:inline">Municipios</span>
          </button>
          <button
            type="button"
            onClick={() => setShowParishes(!showParishes)}
            title="Capa parroquias"
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border transition-all
              ${showParishes
                ? 'bg-cyan-500/15 border-cyan-400/45 text-cyan-300'
                : 'bg-shadow-800 border-white/10 text-gray-500 hover:text-gray-300'
              }`}
          >
            <LayoutGrid className="w-3 h-3 flex-shrink-0" />
            <span className="hidden sm:inline">Parroquias</span>
          </button>
          <button
            type="button"
            onClick={locateMe}
            disabled={myLocGeoPending}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border transition-all
              bg-shadow-800 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-400/55
              disabled:opacity-45 disabled:cursor-not-allowed"
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
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border border-white/15 text-gray-400 hover:text-cyan-200 hover:border-cyan-500/30"
            >
              <Clipboard className="w-3 h-3 sm:hidden flex-shrink-0" aria-hidden />
              <span className="hidden sm:inline">Ver tarjeta</span>
            </button>
          )}
          {markers.length > 0 && (
            <button
              type="button"
              title="Marcadores en mapa"
              onClick={() => setShowMarkers(!showMarkers)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border transition-all
                ${showMarkers
                  ? 'bg-neon-green/20 border-neon-green/40 text-neon-green'
                  : 'bg-shadow-800 border-white/10 text-gray-500 hover:text-gray-300'
                }`}
            >
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="hidden sm:inline">Ubicaciones ({markers.length})</span>
              <span className="sm:hidden tabular-nums">{markers.length}</span>
            </button>
          )}
          {summary && (
            <div className="hidden lg:flex items-center gap-3">
              {[
                { label: 'Orgs', value: summary.total_orgs, icon: Building2, color: 'text-neon-blue' },
                { label: 'Activas', value: summary.active_orgs, icon: Shield, color: 'text-neon-green' },
                { label: 'Criminales', value: summary.criminal_orgs, icon: Skull, color: 'text-neon-red' },
                { label: 'Extranjeras', value: summary.foreign_orgs, icon: Globe, color: 'text-neon-yellow' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1">
                  <s.icon className={`w-3 h-3 ${s.color}`} />
                  <span className="text-[11px] font-mono text-gray-400">{s.value}</span>
                  <span className="text-[9px] text-gray-600">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mapa + Sidebar: en &lt;lg el panel es drawer encima del mapa a pantalla completa */}
      <div className="flex-1 min-h-0 flex overflow-hidden rounded-lg border border-white/5 relative">
        {/* Mapa */}
        <div className="relative territory-map min-h-0 min-w-0 w-full flex-1">
          {/* Búsqueda territorial flotante (comparte estado con barra lateral) */}
          <div
            ref={mapSearchRef}
            className="absolute top-2 sm:top-3 left-1/2 z-[1100] w-[min(calc(100%-2.5rem),26rem)] sm:w-[min(calc(100%-1rem),26rem)] -translate-x-1/2 pointer-events-none"
          >
            <div className="pointer-events-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neon-blue pointer-events-none drop-shadow-sm" />
                <input
                  type="search"
                  value={territorialSearchQuery}
                  onChange={(e) => {
                    setTerritorialSearchQuery(e.target.value)
                    setMapSearchOpen(true)
                  }}
                  onFocus={() => setMapSearchOpen(true)}
                  onKeyDown={onMapSearchKeyDown}
                  placeholder="Buscar municipio, parroquia o estado…"
                  className="input-territory-search w-full pl-9 sm:pl-10 pr-9 sm:pr-10 py-2 sm:py-2.5 rounded-xl border border-white/20 text-[12px] sm:text-[13px] font-medium shadow-[0_8px_32px_rgba(0,0,0,0.5)] focus:outline-none focus:ring-2 focus:ring-neon-blue/45 focus:border-neon-blue/60"
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
                    className="absolute left-0 right-0 top-[calc(100%+6px)] max-h-[min(18rem,40vh)] overflow-y-auto rounded-xl border border-white/12 bg-[rgba(8,12,18,0.96)] backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06]"
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

          <div className="absolute inset-0">
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

              {statesGeo && (
                <GeoJSON
                  key={`states-${geoKey}-${myLocVisualIsolate ? 'iso' : 'all'}`}
                  data={statesGeo}
                  style={stateStyle}
                  onEachFeature={onEachState}
                />
              )}

              <GeoJSON
                key={`esequibo-${myLocVisualIsolate ? 'd' : 'n'}`}
                data={ESEQUIBO_GEOJSON}
                style={() => ({
                  fillColor: REDI_GUAYANA_COLOR,
                  fillOpacity: myLocVisualIsolate ? 0.07 : 0.22,
                  color: REDI_GUAYANA_COLOR,
                  weight: 1.5,
                  opacity: myLocVisualIsolate ? 0.35 : 0.85,
                })}
                onEachFeature={onEachEsequibo}
              />

              {showMunicipalities && muniGeo && (
                <GeoJSON
                  key={`municipalities-${mapZoom >= 10}-${myLocMuniGid ?? 'x'}-${myLocVisualIsolate ? 'f' : 'a'}`}
                  data={muniGeo}
                  style={getMunicipalityStyle}
                  onEachFeature={onEachMunicipality}
                />
              )}

              {showParishes && parishGeo && (
                <GeoJSON
                  key={`parishes-${mapZoom >= 11}-${myLocParishPcode ?? 'x'}-${myLocVisualIsolate ? 'f' : 'a'}`}
                  data={parishGeo}
                  style={getParishStyle}
                  onEachFeature={onEachParish}
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
                    background:${m.typeColor}30;
                    border:2px solid ${m.typeColor};
                    display:flex;align-items:center;justify-content:center;
                    font-size:14px;cursor:pointer;
                    box-shadow:0 0 8px ${m.typeColor}44, 0 2px 8px rgba(0,0,0,0.5);
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

              {myLocation && userLocationIcon && (
                <Marker position={[myLocation.lat, myLocation.lng]} icon={userLocationIcon} />
              )}
            </MapContainer>
          </div>

          {myLocError && (
            <div className="absolute top-16 sm:top-14 left-3 right-3 sm:left-14 sm:right-auto z-[1001] max-w-[min(20rem,calc(100%-1.5rem))] sm:max-w-[min(20rem,calc(100%-5rem))] rounded-lg border border-neon-red/40 bg-shadow-900/95 px-3 py-2 text-[10px] font-mono text-red-200 shadow-lg backdrop-blur-sm">
              {myLocError}
            </div>
          )}

          <AnimatePresence>
            {myLocation && myLocationCardVisible && (
              <motion.div
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.22 }}
                className="absolute top-[6.25rem] sm:top-[5.75rem] lg:top-14 left-2 right-2 sm:left-auto sm:right-3 z-[1001] w-auto sm:w-[min(18rem,calc(100vw-1.5rem))] max-w-none sm:max-w-[min(18rem,calc(100vw-1.5rem))] max-lg:max-h-[min(52vh,calc(100vh-12rem))] max-lg:overflow-y-auto rounded-lg border border-cyan-500/45 bg-shadow-900/96 shadow-2xl backdrop-blur-md overflow-hidden"
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
          <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-auto z-[1000] flex flex-col gap-2 items-stretch max-w-none sm:max-w-[min(18rem,calc(100vw-1.5rem))] pointer-events-none [&>*]:pointer-events-auto">
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

            <div className="lg:hidden flex flex-col gap-1.5 items-stretch">
              <button
                type="button"
                onClick={() => setRediLegendMobileOpen(o => !o)}
                aria-expanded={rediLegendMobileOpen}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/12 bg-shadow-900/95 px-2.5 py-2 text-left shadow-md backdrop-blur-sm transition-colors hover:bg-white/[0.06]"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Layers className="h-3.5 w-3.5 flex-shrink-0 text-neon-blue" aria-hidden />
                  <span className="text-[10px] font-mono text-gray-200">
                    {rediLegendMobileOpen ? 'Ocultar leyenda REDI' : 'Leyenda REDI'}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 flex-shrink-0 text-gray-500 transition-transform ${rediLegendMobileOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              <AnimatePresence initial={false}>
                {rediLegendMobileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.18 }}
                    className="rounded-lg"
                  >
                    <div className="max-h-[min(38vh,18rem)] overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-shadow-900/90 px-2.5 py-2 shadow-lg backdrop-blur-sm">
                      <RediLegendInner showMunicipalities={showMunicipalities} showParishes={showParishes} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="hidden max-h-[min(42vh,20rem)] overflow-y-auto overscroll-contain lg:block">
              <div className="rounded-lg border border-white/10 bg-shadow-900/90 px-2.5 py-2 sm:px-3 shadow-lg backdrop-blur-sm">
                <RediLegendInner showMunicipalities={showMunicipalities} showParishes={showParishes} />
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

                  <div className="p-2.5 grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className="text-base font-bold font-mono text-neon-red">
                        {selectedState.org_count}
                      </div>
                      <div className="text-[8px] text-gray-500">ORGS</div>
                    </div>
                    <div>
                      <div className="text-base font-bold font-mono text-neon-blue">
                        {selectedState.person_count}
                      </div>
                      <div className="text-[8px] text-gray-500">PERSONAS</div>
                    </div>
                    <div>
                      <div className="text-base font-bold font-mono text-red-400">
                        {selectedState.criminal_count}
                      </div>
                      <div className="text-[8px] text-gray-500">CRIMINAL</div>
                    </div>
                  </div>
                  <div className="px-2.5 pb-1.5 flex gap-2 text-[8px] font-mono">
                    <span className="text-orange-400">Param: {selectedState.paramilitar_count}</span>
                    <span className="text-yellow-400">Narco: {selectedState.narco_count}</span>
                  </div>
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

          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              title="Abrir lista de territorios"
              className="fixed z-[2100] flex items-center gap-2 rounded-xl border border-cyan-500/45 bg-shadow-900/95 px-3 py-2.5 shadow-xl backdrop-blur-sm transition-all hover:border-cyan-400/60 hover:bg-cyan-500/10
                left-3 top-[5.25rem] sm:top-[5.5rem] sm:left-3
                lg:left-auto lg:right-0 lg:top-1/2 lg:-translate-y-1/2 lg:rounded-l-xl lg:rounded-r-none lg:px-2 lg:py-5 lg:flex-col lg:gap-2.5"
            >
              <PanelRight className="h-5 w-5 flex-shrink-0 text-cyan-300" aria-hidden />
              <span className="text-[11px] font-mono font-semibold text-cyan-100 lg:hidden">Territorios</span>
              <span
                className="hidden max-h-[9rem] text-[9px] font-mono font-semibold uppercase leading-tight tracking-wide text-cyan-200/90 lg:block"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Territorios
              </span>
            </button>
          )}
        </div>

        {sidebarOpen && (
          <button
            type="button"
            aria-label="Cerrar lista de territorios"
            className="fixed inset-0 z-[1998] bg-black/45 backdrop-blur-[1px] lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar: drawer en móvil, columna en desktop */}
        {sidebarOpen && (
          <div
            className="fixed inset-y-0 right-0 z-[1999] w-[min(20rem,calc(100vw-0.5rem))] flex flex-col bg-shadow-800/98 border-l border-white/10 flex-shrink-0 min-h-0 shadow-2xl
              lg:relative lg:inset-auto lg:z-auto lg:w-80 lg:max-w-[20rem] lg:shadow-none lg:bg-shadow-800/80 lg:border-white/5"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-shadow-900/50 px-2.5 py-2 flex-shrink-0">
              <div className="flex min-w-0 items-center gap-2">
                <Users className="h-4 w-4 flex-shrink-0 text-neon-blue" aria-hidden />
                <span className="truncate text-xs font-bold text-white">Territorios</span>
                <span className="hidden text-[9px] font-mono text-gray-500 sm:inline">({stateData.length})</span>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="flex-shrink-0 rounded-md border border-white/10 p-1.5 text-gray-400 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
                title="Cerrar panel"
                aria-label="Cerrar panel de territorios"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 border-b border-white/5 p-2 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                <input
                  type="search"
                  value={territorialSearchQuery}
                  onChange={(e) => setTerritorialSearchQuery(e.target.value)}
                  placeholder="Buscar estado, municipio, parroquia…"
                  className="input-territory-search w-full pl-8 pr-8 py-2 rounded-lg border border-white/15 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-neon-blue/50 focus:border-neon-blue/50"
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
            <div className="px-2 py-1.5 border-b border-white/5 flex-shrink-0 flex items-center justify-between gap-2">
              <span className="text-[10px] text-gray-500 font-mono">Ordenar lista</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'org_count' | 'person_count' | 'name')}
                className="text-[9px] bg-shadow-900 border border-white/10 rounded px-1 py-0.5 text-gray-400 max-w-[7rem]"
              >
                <option value="org_count">Por orgs</option>
                <option value="person_count">Por personas</option>
                <option value="name">A-Z</option>
              </select>
            </div>

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
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`text-[9px] font-mono flex items-center gap-0.5 ${state.org_count > 0 ? 'text-neon-red' : 'text-gray-600'}`}>
                                    <Building2 className="w-2.5 h-2.5" /> {state.org_count}
                                  </span>
                                  <span className={`text-[9px] font-mono flex items-center gap-0.5 ${state.person_count > 0 ? 'text-neon-blue' : 'text-gray-600'}`}>
                                    <Users className="w-2.5 h-2.5" /> {state.person_count}
                                  </span>
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
