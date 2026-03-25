# Documentación — Venezuela Strategic Map

Mapa interactivo de Venezuela (React + Leaflet) con capas administrativas (ADM1–ADM3), agrupación REDI, Guayana Esequiba, marcadores, búsqueda territorial y geolocalización opcional.

## Segmentos

| Documento | Contenido |
|-----------|-----------|
| [01-visión-general.md](./01-visión-general.md) | Qué hace el proyecto, stack tecnológico, características principales |
| [02-estructura-del-repositorio.md](./02-estructura-del-repositorio.md) | Árbol de carpetas, archivos de entrada, empaquetado |
| [03-datos-geográficos.md](./03-datos-geográficos.md) | GeoJSON en `public/geo/`, silueta país, Esequiba, script `build:outline` |
| [04-capas-leaflet-y-gestor.md](./04-capas-leaflet-y-gestor.md) | Panes, z-index, REDI, estilos Esequiba por capa activa, `MapLayerManager` |
| [05-api-venezuelamap.md](./05-api-venezuelamap.md) | Props, tipos, `ui`, callbacks, métricas genéricas |
| [06-desarrollo-y-build.md](./06-desarrollo-y-build.md) | Scripts npm, Vite, TypeScript, comprobaciones locales |
| [07-despliegue-dokploy.md](./07-despliegue-dokploy.md) | Docker, nginx, Dokploy, subrutas (`VITE_BASE`) |

## Inicio rápido

```bash
npm install
npm run dev
```

Silueta del país (incluye Esequiba unida a ADM1): ver [03-datos-geográficos.md](./03-datos-geográficos.md).

## Reutilización del mapa

Import recomendado desde `src/venezuela-map.ts` (reexporta `VenezuelaMap` y `config`). Detalle en [05-api-venezuelamap.md](./05-api-venezuelamap.md).
