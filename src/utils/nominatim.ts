/**
 * Reverse geocoding vía Nominatim (OSM). Uso moderado según política del servicio.
 */

export interface ReverseGeoDetail {
  lat: number
  lng: number
  displayName?: string
  /** Calle + número si existen */
  street?: string
  estado?: string
  municipio?: string
  /** Mejor esfuerzo: suburbio/barrio (OSM rara vez = parroquia admin. venezolana) */
  parroquia?: string
  pais?: string
  codigoPostal?: string
  /** Epoch ms — instante de la lectura GPS en el dispositivo */
  capturedAtMs?: number
}

/** Fecha y hora local del dispositivo para mostrar / copiar */
export function formatDeviceCaptureDateTime(ms: number, locale = 'es-VE'): string {
  try {
    return new Date(ms).toLocaleString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return new Date(ms).toISOString()
  }
}

interface NominatimReverseJson {
  display_name?: string
  address?: {
    road?: string
    house_number?: string
    city?: string
    town?: string
    village?: string
    municipality?: string
    county?: string
    state?: string
    suburb?: string
    quarter?: string
    neighbourhood?: string
    hamlet?: string
    city_district?: string
    country?: string
    postcode?: string
  }
}

export async function reverseGeocodeNominatim(lat: number, lng: number): Promise<ReverseGeoDetail> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
    {
      headers: {
        'Accept-Language': 'es',
        'User-Agent': 'VenezuelaStrategicMap/1.0 (https://github.com)',
      },
    },
  )
  if (!response.ok) throw new Error(`Nominatim ${response.status}`)
  const data: NominatimReverseJson = await response.json()
  const a = data.address || {}
  const street = a.road
    ? `${a.road}${a.house_number ? ` ${a.house_number}` : ''}`.trim()
    : undefined
  const municipio =
    a.city || a.town || a.village || a.municipality || a.county
  const parroquia =
    a.suburb || a.quarter || a.neighbourhood || a.hamlet || a.city_district

  return {
    lat,
    lng,
    displayName: data.display_name,
    street,
    estado: a.state,
    municipio,
    parroquia,
    pais: a.country,
    codigoPostal: a.postcode,
  }
}

export function formatLocationForClipboard(d: ReverseGeoDetail): string {
  let prefix = ''
  if (d.capturedAtMs != null) {
    prefix = `Fecha y hora (dispositivo): ${formatDeviceCaptureDateTime(d.capturedAtMs)}\n\n`
  }
  const lines = [
    d.displayName,
    '',
    d.estado && `Estado: ${d.estado}`,
    d.municipio && `Municipio: ${d.municipio}`,
    d.parroquia && `Parroquia / sector: ${d.parroquia}`,
    d.street && `Calle: ${d.street}`,
    d.codigoPostal && `C.P.: ${d.codigoPostal}`,
    '',
    `Coordenadas: ${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}`,
  ].filter(Boolean) as string[]
  return prefix + lines.join('\n')
}

export function openStreetMapUrl(lat: number, lng: number, zoom = 16): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`
}
