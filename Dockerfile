# syntax=docker/dockerfile:1
# Vite + React → estáticos servidos con nginx (recomendado para Dokploy en producción)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Si despliegas bajo subruta, define en Dokploy como Build Argument: VITE_BASE=/tu-subpath/
# Debe incluir barras inicial y final (ej. /mapa/).
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE

RUN npm run build

FROM nginx:1.27-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
RUN find /usr/share/nginx/html/geo -name '*.json' -exec gzip -9 -k {} \;

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
