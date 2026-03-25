// =============================================
// TIPOS — Mapa Estratégico de Venezuela (reutilizable)
// =============================================

import type { VenezuelaGeoUrls } from './mapAssets'

/** Métrica numérica arbitraria (la app elige `id`, `label` y significado). */
export interface TerritoryMetric {
  id: string
  label: string
  value: number
}

/** Datos por estado: solo `id` y `name` son obligatorios. */
export interface StateData {
  id: string
  name: string
  /** Indicadores opcionales por estado; cada uno se muestra con su `label` en tooltips y paneles. */
  metrics?: TerritoryMetric[]
  capital?: string
  region?: string
  population?: number
  geo_center?: { lat: number; lng: number }
}

export interface MapMarker {
  id: string
  name: string
  lat: number
  lng: number
  type: string
  typeLabel: string
  typeIcon: string
  typeColor: string
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  description?: string
  groupName?: string
  address?: string
}

/** Enciende o apaga bloques de UI sin tocar el código del mapa. */
export interface VenezuelaMapUiOptions {
  /** Fila de KPIs globales (solo si `summaryMetrics` tiene entradas). */
  showSummaryToolbar?: boolean
  /** Panel lateral árbol REDI / territorios. */
  showTerritoryPanel?: boolean
  /** Búsqueda flotante sobre el mapa (sincronizada con el panel). */
  showMapSearch?: boolean
  /** Botón «Mi ubicación», marcador y tarjeta Nominatim. */
  showGeolocation?: boolean
}

export interface VenezuelaMapProps {
  stateData: StateData[]
  /** Totales globales arbitrarios (misma forma que métricas por estado). */
  summaryMetrics?: TerritoryMetric[] | null
  markers?: MapMarker[]
  onStateClick?: (state: StateData) => void
  onStateNavigate?: (stateId: string) => void
  /** Silueta país (countryOutline). Por defecto: visible. */
  showCountrySilhouetteDefault?: boolean
  /** Límite de estados ADM1 (sin colores REDI). Por defecto: oculta. */
  showStatesLayerDefault?: boolean
  /** Capa de colores por REDI (encima de estados). Por defecto: oculta. */
  showRediLayerDefault?: boolean
  showMunicipalitiesDefault?: boolean
  showMarkersDefault?: boolean
  className?: string
  /** Título de la barra encima del mapa. */
  mapTitle?: string
  /** Subtítulo; `null` lo oculta. Por defecto: «Mapa estratégico». */
  mapSubtitle?: string | null
  /** Sustituye URLs de GeoJSON (por defecto bajo `public/geo/`). */
  geoUrls?: Partial<VenezuelaGeoUrls>
  ui?: VenezuelaMapUiOptions
}
