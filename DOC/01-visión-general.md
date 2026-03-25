# Visión general

## Propósito

**Venezuela Strategic Map** es una aplicación (y un componente React reutilizable) para visualizar el territorio venezolano con:

- Límites de **estados** (ADM1), **municipios** (ADM2) y **parroquias** (ADM3) vía GeoJSON.
- **Silueta nacional** que integra la **Guayana Esequiba** en el contorno del país (`ven-outline.json` generado).
- Capa **REDI** (regiones estratégicas de defensa integral), coloreada según configuración en código.
- **Marcadores** estratégicos opcionales (riesgo, tipo, popup).
- **Búsqueda** unificada por estado, municipio y parroquia (índice en memoria).
- **Geolocalización** del usuario (GPS + reverse geocoding Nominatim) cuando la UI lo habilita.
- **Panel lateral** de territorios y **gestor de capas** (orden de apilamiento y visibilidad).

## Stack

| Capa | Tecnología |
|------|------------|
| UI | React 18, TypeScript |
| Mapa | Leaflet 1.9, react-leaflet 4 |
| Estilos | Tailwind CSS 3 |
| Animación UI | Framer Motion |
| Iconos | Lucide React |
| Build | Vite 6 |
| Geoproceso (solo build) | Turf (`@turf/turf`) para unión de geometrías en el script de outline |

## Ficha técnica resumida

- Los teselas base son **OpenStreetMap** (URL estándar en `VenezuelaMap.tsx`).
- Los datos vectoriales por defecto viven en **`public/geo/`**; las rutas se pueden sustituir con la prop `geoUrls`.
- El estado de negocio por entidad federativa es genérico: `StateData` + `TerritoryMetric[]` (sin métricas fijas en el núcleo del mapa).

## Relación con la demo

`App.tsx` monta `VenezuelaMap` con datos de ejemplo (`SAMPLE_STATES`) y, aparte, un **Location Picker** independiente para pruebas de mapa + Nominatim.
