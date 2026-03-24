// Mapa Estratégico de Venezuela
// Leaflet + GeoJSON: estados (ADM1) + municipios (ADM2) + parroquias (ADM3) + Guayana Esequiba

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Building2, Users, ChevronRight, ChevronLeft,
  Shield, Globe, Eye, Skull, X, Loader2, Layers, LayoutGrid,
} from 'lucide-react'
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet'
import type { Layer } from 'leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { REDI_COLORS, REDI_ORDER, getStateRedi, normalizeName } from '../config/redi'
import { ESEQUIBO_GEOJSON } from '../config/esequibo'
import type { StateData, MapMarker, TerritorialSummary, VenezuelaMapProps } from '../config/types'

const STATES_GEOJSON_URL = '/geo/ven-states.json'
const MUNICIPALITIES_GEOJSON_URL = '/geo/ven-municipalities.json'
/** Límites ADM3 — OCHA/HDX COD-AB (ven_admin3) */
const PARISHES_GEOJSON_URL = '/geo/ven-parishes.json'
const REDI_GUAYANA_COLOR = REDI_COLORS['REDI GUAYANA']

const geoCache: Record<string, any> = {}
async function fetchGeoJSON(url: string) {
  if (geoCache[url]) return geoCache[url]
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed: ${res.status}`)
  const data = await res.json()
  geoCache[url] = data
  return data
}

function MapController({ center, zoom }: { center?: [number, number]; zoom?: number }) {
  const map = useMap()
  useEffect(() => {
    if (center && zoom) {
      map.flyTo(center, zoom, { duration: 1.2 })
    }
  }, [center, zoom, map])
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
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const [statesGeo, setStatesGeo] = useState<any>(null)
  const [muniGeo, setMuniGeo] = useState<any>(null)
  const [geoLoading, setGeoLoading] = useState(true)
  const [showMunicipalities, setShowMunicipalities] = useState(showMunicipalitiesDefault)
  const [showParishes, setShowParishes] = useState(false)
  const [parishGeo, setParishGeo] = useState<any>(null)
  const [parishesLoading, setParishesLoading] = useState(false)

  const [flyTarget, setFlyTarget] = useState<{ center: [number, number]; zoom: number } | null>(null)
  const [showMarkers, setShowMarkers] = useState(showMarkersDefault)
  const [geoKey, setGeoKey] = useState(0)

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
    if (!showMunicipalities || muniGeo) return
    fetchGeoJSON(MUNICIPALITIES_GEOJSON_URL)
      .then(setMuniGeo)
      .catch(err => console.error('Error GeoJSON municipios:', err))
  }, [showMunicipalities, muniGeo])

  useEffect(() => {
    if (!showParishes || parishGeo) return
    setParishesLoading(true)
    fetchGeoJSON(PARISHES_GEOJSON_URL)
      .then(setParishGeo)
      .catch(err => console.error('Error GeoJSON parroquias:', err))
      .finally(() => setParishesLoading(false))
  }, [showParishes, parishGeo])

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

    return {
      fillColor: color,
      fillOpacity: orgCount > 0 ? 0.3 : 0.15,
      color: color,
      weight: 1.5,
      opacity: 0.7,
    }
  }, [findStat])

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
          setFlyTarget({ center: [stat.geo_center.lat, stat.geo_center.lng], zoom: 7 })
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
        setFlyTarget({ center: [5.5, -59.2], zoom: 6 })
      }
    })
  }, [stateData, onStateClick])

  const getMunicipalityStyle = useCallback((feature: any) => {
    const gid = String(feature?.properties?.GID_2 ?? '')
    const isSel = selectedMunicipality?.gid === gid
    return {
      fillColor: isSel ? 'rgba(233, 213, 255, 0.22)' : 'rgba(168, 85, 247, 0.06)',
      fillOpacity: 1,
      color: isSel ? '#f0abfc' : 'rgba(167, 139, 250, 0.42)',
      weight: isSel ? 2.5 : 0.9,
      opacity: isSel ? 1 : 0.88,
    }
  }, [selectedMunicipality])

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
    return {
      fillColor: isSel ? 'rgba(103, 232, 249, 0.2)' : 'rgba(34, 211, 238, 0.04)',
      fillOpacity: 1,
      color: isSel ? '#67e8f9' : 'rgba(34, 211, 238, 0.38)',
      weight: isSel ? 2.2 : 0.55,
      opacity: isSel ? 1 : 0.82,
    }
  }, [selectedParish])

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
      setFlyTarget({ center: [state.geo_center.lat, state.geo_center.lng], zoom: 7 })
    }
  }, [onStateClick])

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
      <div className="flex items-center justify-between pb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-neon-blue flex-shrink-0" />
          <h1 className="text-base font-display font-bold text-white">TERRITORIO VENEZUELA</h1>
          <span className="text-[10px] text-gray-600 font-mono hidden sm:block">
            Mapa estratégico
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowMunicipalities(!showMunicipalities)}
            className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border transition-all
              ${showMunicipalities
                ? 'bg-neon-purple/20 border-neon-purple/40 text-neon-purple'
                : 'bg-shadow-800 border-white/10 text-gray-500 hover:text-gray-300'
              }`}
          >
            <Layers className="w-3 h-3" />
            Municipios
          </button>
          <button
            type="button"
            onClick={() => setShowParishes(!showParishes)}
            className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border transition-all
              ${showParishes
                ? 'bg-cyan-500/15 border-cyan-400/45 text-cyan-300'
                : 'bg-shadow-800 border-white/10 text-gray-500 hover:text-gray-300'
              }`}
          >
            <LayoutGrid className="w-3 h-3" />
            Parroquias
          </button>
          {markers.length > 0 && (
            <button
              onClick={() => setShowMarkers(!showMarkers)}
              className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border transition-all
                ${showMarkers
                  ? 'bg-neon-green/20 border-neon-green/40 text-neon-green'
                  : 'bg-shadow-800 border-white/10 text-gray-500 hover:text-gray-300'
                }`}
            >
              <MapPin className="w-3 h-3" />
              Ubicaciones ({markers.length})
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

      {/* Mapa + Sidebar */}
      <div className="flex-1 min-h-0 flex overflow-hidden rounded-lg border border-white/5">
        {/* Mapa */}
        <div className="flex-1 min-w-0 relative territory-map">
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
          `}</style>

          <div className="absolute inset-0">
            <MapContainer
              center={[7.5, -66.58]}
              zoom={5.5}
              minZoom={4}
              maxZoom={14}
              maxBounds={[[0, -78], [16, -55]]}
              style={{ width: '100%', height: '100%' }}
              zoomControl={true}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap'
              />

              <MapController center={flyTarget?.center} zoom={flyTarget?.zoom} />
              <MapZoomSync onZoom={setMapZoom} />

              {statesGeo && (
                <GeoJSON
                  key={`states-${geoKey}`}
                  data={statesGeo}
                  style={stateStyle}
                  onEachFeature={onEachState}
                />
              )}

              <GeoJSON
                key="esequibo"
                data={ESEQUIBO_GEOJSON}
                style={() => ({
                  fillColor: REDI_GUAYANA_COLOR,
                  fillOpacity: 0.22,
                  color: REDI_GUAYANA_COLOR,
                  weight: 1.5,
                  opacity: 0.85,
                })}
                onEachFeature={onEachEsequibo}
              />

              {showMunicipalities && muniGeo && (
                <GeoJSON
                  key={`municipalities-${mapZoom >= 10}`}
                  data={muniGeo}
                  style={getMunicipalityStyle}
                  onEachFeature={onEachMunicipality}
                />
              )}

              {showParishes && parishGeo && (
                <GeoJSON
                  key={`parishes-${mapZoom >= 11}`}
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
            </MapContainer>
          </div>

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
          <div className="absolute bottom-3 left-3 z-[1000] flex flex-col gap-2 items-stretch max-w-[min(18rem,calc(100vw-1.5rem))]">
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

            <div className="bg-shadow-900/90 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2">
              <span className="text-[9px] text-gray-500 font-mono block mb-1.5">REDI — Regiones Estratégicas</span>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {REDI_ORDER.map(redi => (
                  <div key={redi} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: REDI_COLORS[redi], boxShadow: `0 0 4px ${REDI_COLORS[redi]}66` }} />
                    <span className="text-[8px] text-gray-400">{redi}</span>
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
              <div className="mt-1 pt-1 border-t border-white/5 flex items-center gap-1">
                <div className="w-3 h-2 rounded-sm" style={{ background: REDI_GUAYANA_COLOR, boxShadow: `0 0 6px ${REDI_GUAYANA_COLOR}66` }} />
                <span className="text-[8px] font-mono" style={{ color: REDI_GUAYANA_COLOR }}>Guayana Esequiba · REDI GUAYANA</span>
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
                  className="absolute top-3 right-14 z-[1000] w-64 bg-shadow-900/95 backdrop-blur-md
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

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute top-3 right-3 z-[1000] bg-shadow-900/90 border border-white/10 rounded p-1
              text-gray-400 hover:text-white transition-colors"
          >
            {sidebarOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-56 xl:w-64 flex flex-col bg-shadow-800/80 border-l border-white/5 flex-shrink-0">
            <div className="p-2 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 font-mono">ESTADOS ({stateData.length})</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-[9px] bg-shadow-900 border border-white/10 rounded px-1 py-0.5 text-gray-400"
                >
                  <option value="org_count">Por orgs</option>
                  <option value="person_count">Por personas</option>
                  <option value="name">A-Z</option>
                </select>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {REDI_ORDER.map(redi => {
                const rediStates = groupedByRedi.groups[redi]
                if (!rediStates || rediStates.length === 0) return null
                const rediColor = REDI_COLORS[redi]
                return (
                  <div key={redi}>
                    <div className="sticky top-0 z-10 px-2 py-1.5 bg-shadow-800/95 backdrop-blur-sm border-b border-white/5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: rediColor, boxShadow: `0 0 4px ${rediColor}66` }} />
                          <span className="text-[9px] font-mono font-bold" style={{ color: rediColor }}>{redi}</span>
                        </div>
                        <span className="text-[8px] font-mono text-gray-600">{rediStates.length}</span>
                      </div>
                    </div>
                    {rediStates.map(state => {
                      const isActive = selectedState?.id === state.id
                      return (
                        <button
                          key={state.id}
                          onClick={() => handleStateClick(state)}
                          className={`w-full text-left px-2 py-1.5 border-b border-b-white/5 hover:bg-white/5 transition-all
                            ${isActive ? 'bg-white/10 border-l-2' : 'border-l-2 border-l-transparent'}`}
                          style={isActive ? { borderLeftColor: rediColor } : undefined}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-[11px] font-medium ${isActive ? '' : 'text-white'}`}
                              style={isActive ? { color: rediColor } : undefined}
                            >
                              {state.name}
                            </span>
                            <ChevronRight className="w-3 h-3 text-gray-600" />
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 pl-0.5">
                            <span className={`text-[9px] font-mono flex items-center gap-0.5
                              ${state.org_count > 0 ? 'text-neon-red' : 'text-gray-600'}`}>
                              <Building2 className="w-2.5 h-2.5" /> {state.org_count}
                            </span>
                            <span className={`text-[9px] font-mono flex items-center gap-0.5
                              ${state.person_count > 0 ? 'text-neon-blue' : 'text-gray-600'}`}>
                              <Users className="w-2.5 h-2.5" /> {state.person_count}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
