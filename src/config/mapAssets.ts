/** GeoJSON por defecto (rutas bajo `public/` en Vite). Sustituye vía `geoUrls` en `VenezuelaMapProps`. */
export const DEFAULT_VENEZUELA_GEO_URLS = {
  /** Unión ADM1: silueta del país (generada con `npm run build:outline`). */
  countryOutline: '/geo/ven-outline.json',
  states: '/geo/ven-states.json',
  municipalities: '/geo/ven-municipalities.json',
  parishes: '/geo/ven-parishes.json',
} as const

export type VenezuelaGeoUrls = typeof DEFAULT_VENEZUELA_GEO_URLS
