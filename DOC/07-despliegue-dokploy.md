# Despliegue en Dokploy (Docker)

La app es una **SPA estática** (Vite build → `dist/`). La imagen final solo sirve archivos con **nginx** en el puerto **80**, alineado con la [documentación de Dokploy](https://docs.dokploy.com/docs/core/applications/build-type) (tipo **Dockerfile** o tipo **Static** con `dist`).

## Archivos añadidos en el repo

| Archivo | Rol |
|---------|-----|
| `Dockerfile` | Multi-stage: `npm ci` → `npm run build` → copia `dist/` a nginx |
| `nginx.conf` | `try_files` para SPA, `/health`, cache para `/assets/` y `/geo/` |
| `.dockerignore` | Contexto de build más liviano y sin secretos accidentales |
| `docker-compose.yml` | Opcional: prueba local `docker compose up --build` |

## Configuración en Dokploy

1. **Nueva aplicación** → origen **Git** (tu repositorio).
2. **Build type:** **Dockerfile**.
3. **Dockerfile path:** `Dockerfile`
4. **Docker context path:** `.` (raíz del repo)
5. **Puerto del contenedor:** `80` (el que expone nginx).
6. **Dominio / proxy:** Dokploy enruta al puerto interno que declares; usa **80** como puerto de la aplicación en la UI si te lo pide.

### Subruta (opcional)

Si la app no vive en la raíz del dominio (ej. `https://tudominio.com/mapa/`):

1. En Dokploy, pestaña **Environment** del build Dockerfile → **Build Arguments**:
   - Nombre: `VITE_BASE`
   - Valor: `/mapa/` (con `/` al inicio y al final)
2. Vuelve a desplegar. El `vite.config` ya lee `process.env.VITE_BASE` en build.

En raíz del dominio no hace falta definir nada (`/` por defecto).

### Silueta del país (`ven-outline.json`)

El build de la app **no** ejecuta `npm run build:outline`. Asegúrate de que `public/geo/ven-outline.json` exista en el repo (o genera el archivo en CI **antes** del `docker build`). Si falta, la silueta país puede no cargar en runtime.

## Prueba local

```bash
docker compose up --build
```

Abre `http://localhost:8080`. Healthcheck: `http://localhost:8080/health`.

Build manual:

```bash
docker build -t venezuela-map:local .
docker run --rm -p 8080:80 venezuela-map:local
```

Con subruta de prueba:

```bash
docker build --build-arg VITE_BASE=/app/ -t venezuela-map:sub .
```

## Alternativa sin Dockerfile (Dokploy)

Dokploy también ofrece **Nixpacks / Railpack** con **Publish Directory** `dist` o el tipo **Static**. Esta repo ya incluye Dockerfile para control total de nginx, caché y SPA fallback; es la opción recomendada si quieres el mismo comportamiento en cualquier servidor.

## Producción (nota Dokploy)

La guía de Dokploy sugiere, para cargas fuertes, construir la imagen en CI y desplegar desde registro. El Dockerfile de este repo es compatible con ese flujo: `docker build` en GitHub Actions → push a GHCR/Docker Hub → en Dokploy origen **Docker** con la imagen publicada.
