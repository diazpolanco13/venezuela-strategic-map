// =============================================
// TIPOS — Mapa Estratégico de Venezuela
// =============================================

export interface StateData {
  id: string
  name: string
  org_count: number
  person_count: number
  criminal_count: number
  paramilitar_count: number
  narco_count: number
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

export interface TerritorialSummary {
  total_orgs: number
  active_orgs: number
  criminal_orgs: number
  foreign_orgs: number
}

export interface VenezuelaMapProps {
  stateData: StateData[]
  summary?: TerritorialSummary | null
  markers?: MapMarker[]
  onStateClick?: (state: StateData) => void
  onStateNavigate?: (stateId: string) => void
  showMunicipalitiesDefault?: boolean
  showMarkersDefault?: boolean
  className?: string
}
