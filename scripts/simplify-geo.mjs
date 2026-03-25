#!/usr/bin/env node
/**
 * Simplifica las geometrías GeoJSON de municipios y parroquias
 * para mejorar el rendimiento de renderizado en Leaflet.
 *
 * Algoritmo: Douglas-Peucker (dp) con reparación de intersecciones.
 * Uso: node scripts/simplify-geo.mjs
 */

import { execSync } from 'child_process'
import { statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const geoDir = path.join(root, 'public', 'geo')

const targets = [
  { file: 'ven-parishes.json', keep: '12%' },
  { file: 'ven-municipalities.json', keep: '30%' },
]

for (const { file, keep } of targets) {
  const src = path.join(geoDir, file)
  const sizeBefore = (statSync(src).size / 1024 / 1024).toFixed(2)

  console.log(`\n→ ${file}  (${sizeBefore} MB)`)
  console.log(`  simplify dp ${keep} ...`)

  execSync(
    `npx mapshaper "${src}" -simplify dp ${keep} -o format=geojson "${src}" force`,
    { cwd: root, stdio: 'inherit' },
  )

  const sizeAfter = (statSync(src).size / 1024 / 1024).toFixed(2)
  console.log(`  ✓ ${sizeBefore} MB → ${sizeAfter} MB`)
}

console.log('\nSimplificación completa.')
