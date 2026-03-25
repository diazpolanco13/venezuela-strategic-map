# Datos geográficos

## Archivos en `public/geo/`

| Archivo | Rol |
|---------|-----|
| `ven-states.json` | Fronteras estatales ADM1 |
| `ven-municipalities.json` | Municipios ADM2 |
| `ven-parishes.json` | Parroquias ADM3 |
| `ven-outline.json` | **Silueta única del país** (incluye Guayana Esequiba en el borde exterior) |

Las rutas por defecto están centralizadas en `src/config/mapAssets.ts` (`DEFAULT_VENEZUELA_GEO_URLS`). Cualquier integración puede sustituir entradas puntuales vía `VenezuelaMapProps.geoUrls`.

## Silueta del país (`ven-outline.json`)

No se edita a mano de forma habitual: se **genera** con:

```bash
npm run build:outline
```

Ese script (`scripts/build-ven-outline.mjs`):

1. Lee los estados (`ven-states.json`).
2. Incorpora el polígono de **Guayana Esequiba** definido en `src/config/esequibo.ts` (`ESEQUIBO_GEOJSON`).
3. Ejecuta una **unión geométrica** (Turf) para producir un único contorno nacional coherente.

Requiere Node con soporte para TypeScript en el módulo de configuración según el `package.json` (`node --experimental-strip-types`).

## Guayana Esequiba en runtime

- **Capa dedicada Leaflet:** `venEsequibo` (pane propio), siempre **inmediatamente por encima** del pane de estados en el modelo de z-index derivado del orden de capas (ver `mapLayerStack.ts`).
- El estilo del polígono depende de qué capas “lógicas” están activas: neutro, REDI, estilo tipo municipio, tipo parroquia, etc. (detalle en [04-capas-leaflet-y-gestor.md](./04-capas-leaflet-y-gestor.md)).
- La capa de **parroquias** no incluye geometrías ADM3 dentro del Esequiba en la fuente actual. El mapa dibuja una **silueta** dedicada en `venEsequibo`: con **solo parroquias** activas usa el lenguaje visual de parroquias; si **municipios** están activos (con o sin parroquias), esa silueta usa el de municipios para no contrastar con el resto del territorio (ver prioridad en [04-capas-leaflet-y-gestor.md](./04-capas-leaflet-y-gestor.md)).

## Fuente de los límites ADM

Los nombres de propiedades esperados en el código (p. ej. `GID_2`, `adm3_pcode`, etc.) están alineados con los GeoJSON existentes en `public/geo/`. Si se reemplazan los archivos por otra procedencia, hay que validar que las claves coincidan con los estilos y handlers en `VenezuelaMap.tsx` o adaptar esas funciones.
