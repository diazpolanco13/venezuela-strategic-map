# Estructura del repositorio

```
venezuela-strategic-map/
├── DOC/                      # Esta documentación
├── public/geo/               # GeoJSON servidos por Vite (estáticos)
│   ├── ven-states.json
│   ├── ven-municipalities.json
│   ├── ven-parishes.json
│   └── ven-outline.json      # Generado (ver 03-datos-geográficos.md)
├── scripts/
│   └── build-ven-outline.mjs # Unión ADM1 + Esequiba → ven-outline.json
├── src/
│   ├── main.tsx              # Bootstrap React
│   ├── App.tsx               # Demo: header + VenezuelaMap + LocationPicker
│   ├── venezuela-map.ts      # Punto de reexport para librería / import externo
│   ├── components/
│   │   ├── VenezuelaMap.tsx  # Componente principal del mapa
│   │   ├── MapLayerManager.tsx
│   │   ├── LocationPicker.tsx
│   │   └── index.ts
│   ├── config/
│   │   ├── types.ts          # VenezuelaMapProps, StateData, TerritoryMetric, etc.
│   │   ├── mapAssets.ts      # DEFAULT_VENEZUELA_GEO_URLS
│   │   ├── mapLayerStack.ts  # Orden de capas, z-index por pane
│   │   ├── esequibo.ts       # Polígono Esequiba + helpers
│   │   ├── redi.ts           # Colores y reglas REDI por estado
│   │   └── index.ts
│   ├── data/
│   │   └── sampleStrategicMap.ts   # Datos demo para App
│   └── utils/
│       ├── territoryIndex.ts # Índice y búsqueda territorial
│       ├── geoHitTest.ts     # Punto en polígono (muni/parroquia)
│       └── nominatim.ts      # Reverse geocoding / URLs OSM
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Entradas de ejecución

- **Desarrollo / producción de la demo:** `main.tsx` → `App.tsx`.
- **Consumo como pieza reutilizable:** importar desde `src/venezuela-map.ts` (o directamente `./components/VenezuelaMap` y `./config`).

## Convención de rutas GeoJSON

Por defecto, las URLs son relativas al sitio (`/geo/...`), pensadas para Vite sirviendo `public/` en la raíz. Si el mapa se embebe bajo un subpath, hay que alinear el `base` de Vite o pasar `geoUrls` con rutas absolutas al dominio correcto.
