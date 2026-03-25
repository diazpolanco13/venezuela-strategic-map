/**
 * Genera public/geo/ven-outline.json:
 * unión de ADM1 (ven-states.json) + polígono Guayana Esequiba (esequibo.ts).
 *
 * Requiere Node con soporte TS (--experimental-strip-types en Node 22+).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { union } from '@turf/turf'
import { ESEQUIBO_GEOJSON } from '../src/config/esequibo.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const statesPath = path.join(root, 'public/geo/ven-states.json')
const outPath = path.join(root, 'public/geo/ven-outline.json')

const states = JSON.parse(fs.readFileSync(statesPath, 'utf8'))

if (!states.features?.length) throw new Error('ven-states.json sin features')
if (!ESEQUIBO_GEOJSON?.features?.length) throw new Error('ESEQUIBO_GEOJSON vacío')

const combined = {
  type: 'FeatureCollection',
  features: [...states.features, ...ESEQUIBO_GEOJSON.features],
}

const acc = union(combined)
if (!acc) throw new Error('union() devolvió null')

fs.writeFileSync(
  outPath,
  JSON.stringify({ type: 'FeatureCollection', features: [acc] }),
)
console.log('Written', outPath, '(incluye Guayana Esequiba)')
