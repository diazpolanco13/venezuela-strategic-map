import L from 'leaflet'

import { territoryNorm } from './territoryIndex'

type Ring = [number, number][]

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  if (ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if (yi === yj) continue
    const intersect = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygonRings(lng: number, lat: number, rings: Ring[]): boolean {
  const outer = rings[0]
  if (!outer || outer.length < 3) return false
  if (!pointInRing(lng, lat, outer)) return false
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(lng, lat, rings[h])) return false
  }
  return true
}

export function pointInGeometry(
  lng: number,
  lat: number,
  geometry: { type: string; coordinates: unknown },
): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygonRings(lng, lat, geometry.coordinates as Ring[])
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates as Ring[][]) {
      if (pointInPolygonRings(lng, lat, poly)) return true
    }
    return false
  }
  return false
}

/** Comprueba si [lat, lng] cae dentro del polígono (tras filtro por bbox Leaflet). */
export function featureContainsLatLng(feature: GeoJSON.Feature, lat: number, lng: number): boolean {
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return false
  try {
    const layer = L.geoJSON(feature as GeoJSON.GeoJsonObject)
    const b = layer.getBounds()
    if (!b.isValid()) return false
    if (!b.contains(L.latLng(lat, lng))) return false
  } catch {
    return false
  }
  return pointInGeometry(lng, lat, g as { type: string; coordinates: unknown })
}

export function findParishContaining(
  collection: GeoJSON.FeatureCollection,
  lat: number,
  lng: number,
): GeoJSON.Feature | null {
  for (const f of collection.features) {
    if (featureContainsLatLng(f, lat, lng)) return f
  }
  return null
}

export function findMunicipalityContaining(
  collection: GeoJSON.FeatureCollection,
  lat: number,
  lng: number,
): GeoJSON.Feature | null {
  for (const f of collection.features) {
    if (featureContainsLatLng(f, lat, lng)) return f
  }
  return null
}

export function municipalityGidFromParishParent(
  muniCollection: GeoJSON.FeatureCollection,
  adm1Name: string,
  adm2Name: string,
): string | null {
  const s = territoryNorm(adm1Name)
  const m = territoryNorm(adm2Name)
  for (const f of muniCollection.features) {
    const p = f.properties as Record<string, string | undefined>
    if (territoryNorm(p.NAME_1 || '') === s && territoryNorm(p.NAME_2 || '') === m) {
      return String(p.GID_2 ?? '') || null
    }
  }
  return null
}
