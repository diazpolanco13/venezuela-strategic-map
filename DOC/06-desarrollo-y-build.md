# Desarrollo y build

## Scripts npm

| Comando | Acción |
|---------|--------|
| `npm run dev` | Servidor de desarrollo Vite (HMR). |
| `npm run build` | `tsc -b` (verificación de tipos) + `vite build` → salida en `dist/`. |
| `npm run preview` | Sirve `dist/` localmente para probar el build. |
| `npm run build:outline` | Regenera `public/geo/ven-outline.json` desde estados + Esequiba. |

## Requisitos

- Node.js acorde con Vite 6 (recomendable LTS reciente).
- Para `build:outline`, el script usa `node --experimental-strip-types` al importar configuración TypeScript (`esequibo.ts`); si tu versión de Node no lo soporta, actualiza Node o adapta el script para compilar/transpilar ese módulo primero.

## Variables y entorno

La demo actual no exige archivo `.env` para el mapa principal. La geolocalización y Nominatim utilizan la API pública según las URLs definidas en `src/utils/nominatim.ts` (revisar límites de uso en producción).

## Estilo y Tailwind

Tailwind escanea típicamente `src/**` y plantillas según `tailwind.config`; al añadir clases dinámicas evita cadenas ininteligibles para el purge (patrón habitual: clases completas en el fuente).

## Checklist antes de desplegar

1. `npm run build` sin errores.
2. `ven-outline.json` presente si se usa silueta país (ejecutar `build:outline` tras cambiar Esequiba o estados fuente).
3. Confirmar que `geoUrls` o rutas `/geo/*` resuelven correctamente en el dominio final (CDN, subpath, etc.).

## Pruebas manuales sugeridas

- Conmutar cada capa (país, estados, municipios, parroquias, REDI) y comprobar Esequiba y leyenda (con **municipios + parroquias** a la vez, la silueta del Esequiba debe verse alineada al estilo de municipios, no “solo parroquia”).
- Reordenar capas en el gestor y verificar el apilamiento (p. ej. parroquias sobre municipios).
- Búsqueda territorial: estado, municipio, parroquia.
- Si `showGeolocation` está activo: permisos del navegador y respuesta de Nominatim.

## Contenedor Docker (resumen)

```bash
docker compose up --build
```

Detalle de Dokploy, nginx y argumento `VITE_BASE`: [07-despliegue-dokploy.md](./07-despliegue-dokploy.md).
