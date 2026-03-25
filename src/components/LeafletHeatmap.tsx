import { useEffect, useMemo, useRef, useCallback } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'
import type { HeatmapPoint, HeatmapOptions } from '../config/types'

const DEFAULT_GRADIENT: Record<number, string> = {
  0.0: 'rgba(0, 255, 136, 0)',
  0.15: '#10b981',
  0.35: '#22d3ee',
  0.5: '#facc15',
  0.7: '#f97316',
  0.85: '#ef4444',
  1.0: '#dc2626',
}

type NormalizedPoint = { coords: [number, number, number]; label?: string; value: number }

function normalizePoints(points: HeatmapPoint[]): NormalizedPoint[] {
  return points.map((p) => {
    if (Array.isArray(p)) {
      return { coords: [p[0], p[1], p[2] ?? 1] as [number, number, number], value: 0 }
    }
    return {
      coords: [p.lat, p.lng, p.intensity] as [number, number, number],
      label: p.label,
      value: p.label ? parseInt(p.label, 10) || 0 : 0,
    }
  })
}

const CLUSTER_PX = 60

function clusterLabels(
  items: NormalizedPoint[],
  map: L.Map,
): Array<{ lat: number; lng: number; label: string }> {
  const zoom = map.getZoom()

  if (zoom < 5) return []

  if (zoom >= 7) {
    return items
      .filter((n) => n.label)
      .map((n) => ({ lat: n.coords[0], lng: n.coords[1], label: n.label! }))
  }

  const withLabel = items.filter((n) => n.label)
  const used = new Set<number>()
  const clusters: Array<{ lat: number; lng: number; label: string }> = []

  for (let i = 0; i < withLabel.length; i++) {
    if (used.has(i)) continue
    const a = withLabel[i]
    const ptA = map.latLngToContainerPoint([a.coords[0], a.coords[1]])
    let totalValue = a.value
    let sumLat = a.coords[0] * a.value
    let sumLng = a.coords[1] * a.value
    used.add(i)

    for (let j = i + 1; j < withLabel.length; j++) {
      if (used.has(j)) continue
      const b = withLabel[j]
      const ptB = map.latLngToContainerPoint([b.coords[0], b.coords[1]])
      const dist = ptA.distanceTo(ptB)
      if (dist < CLUSTER_PX) {
        totalValue += b.value
        sumLat += b.coords[0] * b.value
        sumLng += b.coords[1] * b.value
        used.add(j)
      }
    }

    const cLat = totalValue > 0 ? sumLat / totalValue : a.coords[0]
    const cLng = totalValue > 0 ? sumLng / totalValue : a.coords[1]
    clusters.push({ lat: cLat, lng: cLng, label: String(totalValue) })
  }

  return clusters
}

interface LeafletHeatmapProps {
  points: HeatmapPoint[]
  options?: HeatmapOptions
}

export function LeafletHeatmap({ points, options }: LeafletHeatmapProps) {
  const map = useMap()
  const layerRef = useRef<L.HeatLayer | null>(null)
  const labelsRef = useRef<L.LayerGroup | null>(null)

  const normalized = useMemo(() => normalizePoints(points), [points])
  const heatCoords = useMemo(() => normalized.map((n) => n.coords), [normalized])

  useEffect(() => {
    const opts: L.HeatLayerOptions = {
      radius: options?.radius ?? 25,
      blur: options?.blur ?? 18,
      max: options?.max ?? 1.0,
      minOpacity: options?.minOpacity ?? 0.4,
      maxZoom: options?.maxZoom ?? 8,
      gradient: options?.gradient ?? DEFAULT_GRADIENT,
    }

    const layer = L.heatLayer(heatCoords, opts)
    layer.addTo(map)
    layerRef.current = layer

    return () => {
      map.removeLayer(layer)
      layerRef.current = null
    }
  }, [map])

  useEffect(() => {
    if (!layerRef.current) return
    layerRef.current.setLatLngs(heatCoords)
  }, [heatCoords])

  useEffect(() => {
    if (!layerRef.current) return
    layerRef.current.setOptions({
      radius: options?.radius ?? 25,
      blur: options?.blur ?? 18,
      max: options?.max ?? 1.0,
      minOpacity: options?.minOpacity ?? 0.4,
      maxZoom: options?.maxZoom ?? 8,
      gradient: options?.gradient ?? DEFAULT_GRADIENT,
    })
    layerRef.current.redraw()
  }, [
    options?.radius,
    options?.blur,
    options?.max,
    options?.minOpacity,
    options?.gradient,
    options?.maxZoom,
  ])

  const rebuildLabels = useCallback(() => {
    if (labelsRef.current) {
      map.removeLayer(labelsRef.current)
      labelsRef.current = null
    }

    const clusters = clusterLabels(normalized, map)
    if (clusters.length === 0) return

    const group = L.layerGroup()
    for (const c of clusters) {
      const icon = L.divIcon({
        className: 'heatmap-value-label',
        html: `<span>${c.label}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 14],
      })
      L.marker([c.lat, c.lng], { icon, interactive: false }).addTo(group)
    }
    group.addTo(map)
    labelsRef.current = group
  }, [map, normalized])

  useEffect(() => {
    rebuildLabels()
    return () => {
      if (labelsRef.current) {
        map.removeLayer(labelsRef.current)
        labelsRef.current = null
      }
    }
  }, [rebuildLabels])

  useMapEvents({
    zoomend: rebuildLabels,
  })

  return null
}
