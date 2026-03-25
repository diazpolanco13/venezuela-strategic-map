# API del componente `VenezuelaMap`

Definición completa de tipos: `src/config/types.ts`.

## Props principales

| Prop | Tipo | Descripción |
|------|------|-------------|
| `stateData` | `StateData[]` | **Obligatorio.** Lista de entidades (estados + Esequiba si aplica en tus datos) con `id`, `name` y campos opcionales. |
| `summaryMetrics` | `TerritoryMetric[] \| null` | KPIs globales; si hay datos y la UI lo permite, se muestran en la barra superior. |
| `markers` | `MapMarker[]` | Marcadores opcionales con icono, riesgo y popup. |
| `onStateClick` | `(state: StateData) => void` | Clic en estado o en polígono Esequiba cuando enlaza a ese `StateData`. |
| `onStateNavigate` | `(stateId: string) => void` | Navegación desde otros controles hacia un estado. |
| `showCountrySilhouetteDefault` | `boolean` | Por defecto `true`. |
| `showStatesLayerDefault` | `boolean` | Por defecto `false`. |
| `showRediLayerDefault` | `boolean` | Por defecto `false`. |
| `showMunicipalitiesDefault` | `boolean` | Por defecto `false`. |
| `showMarkersDefault` | `boolean` | Por defecto `true`. |
| `className` | `string` | Clases Tailwind en el contenedor externo. |
| `mapTitle` / `mapSubtitle` | `string` / `string \| null` | Textos del encabezado del bloque mapa. |
| `geoUrls` | `Partial<VenezuelaGeoUrls>` | Sustituye URLs de los GeoJSON por defecto. |
| `ui` | `VenezuelaMapUiOptions` | Activa o desactiva bloques de interfaz (ver abajo). |

## `StateData` y métricas

```ts
interface StateData {
  id: string
  name: string
  metrics?: TerritoryMetric[]
  capital?: string
  region?: string
  population?: number
  geo_center?: { lat: number; lng: number }
}

interface TerritoryMetric {
  id: string
  label: string
  value: number
}
```

Los tooltips y paneles leen `metrics` de forma genérica (etiqueta + valor). No hay IDs de métrica reservados en el tipo: la aplicación que consume el mapa define el significado.

## `VenezuelaMapUiOptions`

| Campo | Efecto |
|-------|--------|
| `showSummaryToolbar` | Muestra la fila de métricas globales si `summaryMetrics` tiene entradas. |
| `showTerritoryPanel` | Panel lateral “Territorios” (árbol / REDI). |
| `showMapSearch` | Búsqueda territorial (estado / municipio / parroquia). Con `TacticalHudProvider` (p. ej. `App.tsx`), en escritorio el campo vive en la cabecera y el desplegable se ancla ahí por portal; en &lt;lg sigue el acceso compacto en `VenezuelaMap`. Sin provider, se usa la barra flotante centrada sobre el mapa (solo escritorio). |
| `showGeolocation` | Botón de ubicación, marcador, tarjeta con reverse geocoding. |

Si un campo se omite, el componente aplica **comportamiento por defecto** (en la implementación actual, la mayoría de bloques están visibles salvo que se desactiven explícitamente según el código de `VenezuelaMap.tsx`).

## Reexport desde `venezuela-map.ts`

```ts
export { VenezuelaMap } from './components/VenezuelaMap'
export * from './config'
```

Permite `import { VenezuelaMap, DEFAULT_VENEZUELA_GEO_URLS } from '.../venezuela-map'` en otro proyecto empaquetado o enlazado por path.

## Datos de demostración

`src/data/sampleStrategicMap.ts` (`SAMPLE_STATES`) alimenta `App.tsx`; no es parte del contrato del componente: puedes sustituir por API, estado global o base de datos.
