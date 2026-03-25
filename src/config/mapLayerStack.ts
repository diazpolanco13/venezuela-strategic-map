// Orden de apilamiento de capas Leaflet (pane + z-index).

export type StackableMapLayerId = 'country' | 'states' | 'municipalities' | 'parishes' | 'redi' | 'heatmap'

/** Orden por defecto: abajo → arriba (mayor z = más visible encima). */
export const DEFAULT_MAP_LAYER_ORDER: StackableMapLayerId[] = [
  'country',
  'states',
  'municipalities',
  'parishes',
  'redi',
  'heatmap',
]

export const MAP_LAYER_LABELS: Record<StackableMapLayerId, string> = {
  country: 'Venezuela (silueta)',
  states: 'Estados',
  municipalities: 'Municipios',
  parishes: 'Parroquias',
  redi: 'REDI',
  heatmap: 'Mapa de calor',
}

const PANE_BY_ID: Record<Exclude<StackableMapLayerId, 'states'>, string> = {
  country: 'venCountry',
  municipalities: 'venMuni',
  parishes: 'venParish',
  redi: 'venRedi',
  heatmap: 'venHeatmap',
}

/** Genera z-index por pane. Guayana Esequiba queda siempre justo encima de Estados. */
export function computePaneZIndices(order: StackableMapLayerId[]): Record<string, string> {
  const z: Record<string, string> = {}
  let cur = 340
  const step = 26
  for (const id of order) {
    if (id === 'states') {
      z.venStates = String(cur)
      cur += step
      z.venEsequibo = String(cur)
      cur += step
    } else {
      z[PANE_BY_ID[id]] = String(cur)
      cur += step
    }
  }
  return z
}

const STACKABLE_SET = new Set<StackableMapLayerId>(DEFAULT_MAP_LAYER_ORDER)

/** Repara duplicados, entradas inválidas u orden incompleto (p. ej. tras un drag inválido). */
export function normalizeLayerOrder(order: StackableMapLayerId[]): StackableMapLayerId[] {
  const seen = new Set<StackableMapLayerId>()
  const out: StackableMapLayerId[] = []
  for (const id of order) {
    if (id && STACKABLE_SET.has(id) && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  for (const id of DEFAULT_MAP_LAYER_ORDER) {
    if (!seen.has(id)) out.push(id)
  }
  return out
}

export function moveLayerInOrder<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return list
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return list
  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  if (item === undefined) return list
  next.splice(toIndex, 0, item)
  return next
}
