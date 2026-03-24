import { normalizeName } from '../config/redi'
import type { StateData } from '../config/types'

/** Alineado con VenezuelaMap — nombres GADM/HDX */
export function formatTerritoryLabel(raw: string): string {
  if (!raw || raw === 'NA') return 'Sin nombre'
  let t = raw.replace(/_/g, ' ')
  t = t.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
  return t.replace(/\s+/g, ' ').trim()
}

export function territoryNorm(raw: string): string {
  return normalizeName(formatTerritoryLabel(raw || ''))
}

export interface ParishIndexItem {
  display: string
  pcode: string
  lat: number
  lng: number
}

export interface MunicipioIndexItem {
  norm: string
  display: string
  gid: string | null
  parishes: ParishIndexItem[]
}

export interface TerritoryIndex {
  /** clave = territoryNorm(nombre estado) */
  byStateNorm: Map<string, MunicipioIndexItem[]>
}

export function buildTerritoryIndex(muniGeo: GeoJSON.FeatureCollection | null, parishGeo: GeoJSON.FeatureCollection | null): TerritoryIndex {
  const stateMap = new Map<string, Map<string, MunicipioIndexItem>>()

  const ensureMuni = (stateKey: string, muniKey: string, display: string, gid: string | null) => {
    if (!stateMap.has(stateKey)) stateMap.set(stateKey, new Map())
    const sm = stateMap.get(stateKey)!
    if (!sm.has(muniKey)) {
      sm.set(muniKey, { norm: muniKey, display, gid, parishes: [] })
    } else {
      const row = sm.get(muniKey)!
      if (!row.gid && gid) row.gid = gid
    }
    return sm.get(muniKey)!
  }

  if (muniGeo?.features) {
    for (const f of muniGeo.features) {
      const p = f.properties as Record<string, string | undefined>
      if (!p?.NAME_1 || !p?.NAME_2) continue
      const sKey = territoryNorm(p.NAME_1)
      const mKey = territoryNorm(p.NAME_2)
      const display = formatTerritoryLabel(p.NAME_2)
      const gid = p.GID_2 != null ? String(p.GID_2) : null
      ensureMuni(sKey, mKey, display, gid)
    }
  }

  if (parishGeo?.features) {
    for (const f of parishGeo.features) {
      const p = f.properties as Record<string, unknown>
      const a1 = String(p.adm1_name ?? '')
      const a2 = String(p.adm2_name ?? '')
      const a3 = String(p.adm3_name ?? p.adm3_ref_name ?? '')
      if (!a1 || !a2) continue
      const sKey = territoryNorm(a1)
      const mKey = territoryNorm(a2)
      const mDisplay = formatTerritoryLabel(a2)
      const row = ensureMuni(sKey, mKey, mDisplay, null)
      const lat = Number(p.center_lat)
      const lng = Number(p.center_lon)
      row.parishes.push({
        display: formatTerritoryLabel(a3 || 'Sin nombre'),
        pcode: String(p.adm3_pcode ?? ''),
        lat: Number.isFinite(lat) ? lat : 0,
        lng: Number.isFinite(lng) ? lng : 0,
      })
    }
  }

  for (const sm of stateMap.values()) {
    for (const m of sm.values()) {
      m.parishes.sort((a, b) => a.display.localeCompare(b.display, 'es', { sensitivity: 'base' }))
    }
  }

  const byStateNorm = new Map<string, MunicipioIndexItem[]>()
  for (const [sk, sm] of stateMap) {
    const list = [...sm.values()].sort((a, b) => a.display.localeCompare(b.display, 'es', { sensitivity: 'base' }))
    byStateNorm.set(sk, list)
  }

  return { byStateNorm }
}

export function stateTerritoryKey(state: StateData): string {
  return territoryNorm(state.name)
}

export function territorySearchQueryNorm(q: string): string {
  return normalizeName(q.trim())
}

export type SearchHit =
  | { kind: 'estado'; state: StateData }
  | {
      kind: 'municipio'
      state: StateData
      municipio: MunicipioIndexItem
    }
  | {
      kind: 'parroquia'
      state: StateData
      municipio: MunicipioIndexItem
      parish: ParishIndexItem
    }

const MAX_SEARCH = 100

export function searchTerritory(
  stateData: StateData[],
  index: TerritoryIndex,
  rawQuery: string,
): SearchHit[] {
  const q = territorySearchQueryNorm(rawQuery)
  if (q.length < 2) return []

  const hits: SearchHit[] = []
  const seen = new Set<string>()

  for (const state of stateData) {
    const sk = stateTerritoryKey(state)
    const sn = normalizeName(state.name)
    if (sn.includes(q)) {
      const k = `e:${state.id}`
      if (!seen.has(k)) {
        seen.add(k)
        hits.push({ kind: 'estado', state })
      }
    }

    const munis = index.byStateNorm.get(sk)
    if (!munis) continue

    for (const m of munis) {
      const mn = normalizeName(m.display)
      if (mn.includes(q)) {
        const k = `m:${state.id}:${m.norm}`
        if (!seen.has(k) && hits.length < MAX_SEARCH) {
          seen.add(k)
          hits.push({ kind: 'municipio', state, municipio: m })
        }
      }
      for (const par of m.parishes) {
        const pn = normalizeName(par.display)
        if (pn.includes(q)) {
          const k = `p:${par.pcode}`
          if (!seen.has(k) && hits.length < MAX_SEARCH) {
            seen.add(k)
            hits.push({ kind: 'parroquia', state, municipio: m, parish: par })
          }
        }
      }
    }
  }

  return hits.slice(0, MAX_SEARCH)
}
