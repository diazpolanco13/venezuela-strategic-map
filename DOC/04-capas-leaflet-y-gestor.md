# Capas Leaflet y gestor

## Panes personalizados

El mapa crea y ordena **panes** con nombres fijos:

| Pane | Uso típico |
|------|------------|
| `venCountry` | Silueta país (`ven-outline.json`), `pointer-events: none` |
| `venStates` | Estados en vista neutra |
| `venEsequibo` | Polígono Guayana Esequiba |
| `venMuni` | Municipios |
| `venParish` | Parroquias |
| `venRedi` | Estados coloreados por REDI (cuando la capa REDI está activa) |

Los valores de **`z-index` CSS** de cada pane se calculan en `src/config/mapLayerStack.ts` (`computePaneZIndices`), a partir de un orden de capas **configurable por el usuario**.

## Orden de apilamiento (`mapLayerStack.ts`)

- Lista ordenada de identificadores: `country`, `states`, `municipalities`, `parishes`, `redi`.
- Recorrido de la lista de abajo → arriba: las capas que aparecen **más abajo** en la lista del gestor tienen **menor** z-index; las del final quedan **encima**.
- **Invariante Esequiba:** siempre que se asigna z a `states` (`venStates`), el siguiente paso asigna z a `venEsequibo` de forma consecutiva (Esequiba “sigue” a estados en el stack visual).

Hay utilidades para **normalizar** el orden si hubiera corrupción (`normalizeLayerOrder`) y para **mover** un elemento en el array (`moveLayerInOrder`).

## Gestor de capas UI (`MapLayerManager.tsx`)

- Pestaña vertical **«Capas»** (panel deslizante) con:
  - **Checkbox** por capa lógica (sincronizado con el mismo estado que los toggles del header).
  - **Arrastre** desde el icono de asa para reordenar filas (HTML5 DnD).
- El panel y el backdrop están posicionados **dentro** del contenedor `.territory-map` (posicionamiento `absolute` respecto a ese ancestro `relative`), **sin** mezclar `position: relative` en el mismo nodo que `absolute inset-0` del `MapContainer` (evita colapsar la altura del mapa).

## Capas lógicas y GeoJSON

Resumen de comportamiento (simplificado):

- **Silueta país:** opcional, configurable; relleno oscuro y borde claro.
- **Estados:** modo neutro (sin REDI) o sustituidos visualmente cuando REDI está activo (los estados “REDI” van a otro pane).
- **Municipios / parroquias:** estilos distintos (púrpura vs cyan), etiquetas según nivel de zoom.
- **REDI:** colores por estado según `src/config/redi.ts`; leyenda en UI cuando aplica.
- **Esequiba:** un único `GeoJSON` en `venEsequibo` (no hay ADM2/ADM3 reales en esa fuente). El estilo y los handlers (`onEachFeature`) siguen esta **prioridad** si varias capas lógicas están encendidas:
  1. **REDI** activo → estilo y eventos REDI.
  2. **Municipios** activos → estilo “como municipio” (aunque parroquias también estén activas), para alinear el relleno con el resto del país donde ADM2 queda bajo la rejilla ADM3.
  3. Solo **parroquias** (sin municipios) → estilo “como parroquia”.
  4. En otro caso (p. ej. solo estados) → neutro.

## Teselas base

`TileLayer` apunta a OpenStreetMap. El CSS en `VenezuelaMap` atenúa el brillo del pane de teselas (`.leaflet-tile-pane`) para coherencia con el tema oscuro de la aplicación.
