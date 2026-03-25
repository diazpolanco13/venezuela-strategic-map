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

/** Punto de calor: tupla o objeto con label para mostrar valor sobre el mapa. */
export type HeatmapPoint =
  | [number, number]
  | [number, number, number]
  | { lat: number; lng: number; intensity: number; label?: string }

/** Opciones visuales del heatmap (pasadas a leaflet.heat). */
export interface HeatmapOptions {
  /** Radio de cada punto en píxeles. Por defecto: 30. */
  radius?: number
  /** Radio de difuminado en píxeles. Por defecto: 20. */
  blur?: number
  /** Valor máximo de intensidad (normaliza la escala). Por defecto: 1.0. */
  max?: number
  /** Opacidad mínima del gradiente. Por defecto: 0.15. */
  minOpacity?: number
  /** Zoom máximo donde los puntos alcanzan intensidad máxima. Por defecto: 12. */
  maxZoom?: number
  /** Gradiente de colores personalizado. Clave: 0–1, valor: color CSS. */
  gradient?: Record<number, string>
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
  /** Puntos de calor. Cada punto: [lat, lng] o [lat, lng, intensidad]. */
  heatmapData?: HeatmapPoint[]
  /** Opciones visuales del heatmap (radio, blur, gradiente, etc.). */
  heatmapOptions?: HeatmapOptions
  /** Mostrar capa de calor al iniciar. Por defecto: true si hay `heatmapData`. */
  showHeatmapDefault?: boolean
  className?: string
  /** Título de la barra encima del mapa. */
  mapTitle?: string
  /** Subtítulo; `null` lo oculta. Por defecto: «Mapa estratégico». */
  mapSubtitle?: string | null
  /** Sustituye URLs de GeoJSON (por defecto bajo `public/geo/`). */
  geoUrls?: Partial<VenezuelaGeoUrls>
  ui?: VenezuelaMapUiOptions
}
