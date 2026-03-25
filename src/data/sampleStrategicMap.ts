/**
 * Datos de demostración: solo territorio (capital, población, centro).
 * Métricas de negocio: añade `metrics: [{ id, label, value }]` por estado y/o
 * `summaryMetrics` en `<VenezuelaMap />` cuando vengan de tu API.
 */
import type { StateData, HeatmapPoint } from '../config/types'

export const SAMPLE_STATES: StateData[] = [
  { id: '1', name: 'Distrito Capital', capital: 'Caracas', population: 2082000, geo_center: { lat: 10.4806, lng: -66.9036 } },
  { id: '2', name: 'Miranda', capital: 'Los Teques', population: 3228000, geo_center: { lat: 10.2894, lng: -66.8024 } },
  { id: '3', name: 'La Guaira', capital: 'La Guaira', population: 373000, geo_center: { lat: 10.6015, lng: -66.9294 } },
  { id: '4', name: 'Aragua', capital: 'Maracay', population: 1856000, geo_center: { lat: 10.2338, lng: -67.5949 } },
  { id: '5', name: 'Carabobo', capital: 'Valencia', population: 2487000, geo_center: { lat: 10.1579, lng: -68.0078 } },
  { id: '6', name: 'Yaracuy', capital: 'San Felipe', population: 637000, geo_center: { lat: 10.3390, lng: -68.7411 } },
  { id: '7', name: 'Zulia', capital: 'Maracaibo', population: 4100000, geo_center: { lat: 10.0667, lng: -71.6333 } },
  { id: '8', name: 'Lara', capital: 'Barquisimeto', population: 1984000, geo_center: { lat: 10.0678, lng: -69.3467 } },
  { id: '9', name: 'Falcon', capital: 'Coro', population: 985000, geo_center: { lat: 11.4135, lng: -69.6741 } },
  { id: '10', name: 'Apure', capital: 'San Fernando', population: 529000, geo_center: { lat: 7.3000, lng: -69.6000 } },
  { id: '11', name: 'Guarico', capital: 'San Juan', population: 806000, geo_center: { lat: 8.7500, lng: -66.2333 } },
  { id: '12', name: 'Barinas', capital: 'Barinas', population: 879000, geo_center: { lat: 8.6232, lng: -70.2372 } },
  { id: '13', name: 'Cojedes', capital: 'San Carlos', population: 356000, geo_center: { lat: 9.6500, lng: -68.5833 } },
  { id: '14', name: 'Portuguesa', capital: 'Guanare', population: 960000, geo_center: { lat: 9.0439, lng: -69.7422 } },
  { id: '15', name: 'Merida', capital: 'Mérida', population: 927000, geo_center: { lat: 8.5896, lng: -71.1558 } },
  { id: '16', name: 'Tachira', capital: 'San Cristóbal', population: 1272000, geo_center: { lat: 7.7667, lng: -72.2333 } },
  { id: '17', name: 'Trujillo', capital: 'Trujillo', population: 748000, geo_center: { lat: 9.3639, lng: -70.4267 } },
  { id: '18', name: 'Anzoategui', capital: 'Barcelona', population: 1657000, geo_center: { lat: 8.5919, lng: -63.9572 } },
  { id: '19', name: 'Monagas', capital: 'Maturín', population: 997000, geo_center: { lat: 9.7457, lng: -63.1830 } },
  { id: '20', name: 'Sucre', capital: 'Cumaná', population: 987000, geo_center: { lat: 10.4500, lng: -63.2333 } },
  { id: '21', name: 'Bolivar', capital: 'Ciudad Bolívar', population: 1824000, geo_center: { lat: 6.8000, lng: -63.5000 } },
  { id: '22', name: 'Amazonas', capital: 'Puerto Ayacucho', population: 181000, geo_center: { lat: 3.4167, lng: -65.8500 } },
  { id: '23', name: 'Delta Amacuro', capital: 'Tucupita', population: 187000, geo_center: { lat: 9.0583, lng: -62.0500 } },
  { id: '24', name: 'Nueva Esparta', capital: 'La Asunción', population: 491000, geo_center: { lat: 11.0000, lng: -63.9167 } },
  { id: '25', name: 'Guayana Esequiba', capital: '', region: 'REDI GUAYANA', geo_center: { lat: 5.5, lng: -59.2 } },
]

/**
 * Demo heatmap: Corte II 11:15 — Concentración y Marcha de Gremios 25MAR26.
 * Intensidad = participantes / max (775). Label = participantes reales.
 * En producción estos datos vienen de la BD.
 */
export const SAMPLE_HEATMAP_DATA: HeatmapPoint[] = [
  // REDI CAPITAL — Total: 180
  { lat: 10.4806, lng: -66.9036, intensity: 0.85, label: '180' },   // Distrito Capital
  // REDI CENTRAL — Total: 50
  { lat: 10.2477, lng: -67.5972, intensity: 0.10, label: '15' },    // Aragua
  { lat: 10.1810, lng: -67.9960, intensity: 0.15, label: '35' },    // Carabobo
  // REDI OCCIDENTAL — Total: 300
  { lat: 11.4000, lng: -69.6700, intensity: 0.50, label: '120' },   // Falcón
  { lat: 10.0678, lng: -69.3467, intensity: 0.40, label: '100' },   // Lara
  { lat: 10.6544, lng: -71.6281, intensity: 0.35, label: '80' },    // Zulia
  // REDI ANDINA — Total: 130
  { lat: 9.3700, lng: -70.4350, intensity: 0.20, label: '40' },     // Trujillo
  { lat: 8.5896, lng: -71.1558, intensity: 0.15, label: '30' },     // Mérida
  { lat: 7.7667, lng: -72.2333, intensity: 0.30, label: '60' },     // Táchira
  // REDI LOS LLANOS — Total: 875
  { lat: 8.6232, lng: -70.2372, intensity: 0.50, label: '120' },    // Barinas
  { lat: 9.6592, lng: -68.5820, intensity: 0.25, label: '50' },     // Cojedes
  { lat: 9.0439, lng: -69.7422, intensity: 1.0, label: '580' },     // Portuguesa
  { lat: 8.7500, lng: -67.4500, intensity: 0.30, label: '75' },     // Guárico
  { lat: 7.8830, lng: -69.6000, intensity: 0.25, label: '50' },     // Apure
  // REDI ORIENTAL — Total: 248
  { lat: 9.7457, lng: -63.1830, intensity: 0.30, label: '70' },     // Monagas
  { lat: 10.1311, lng: -64.6861, intensity: 0.40, label: '98' },    // Anzoátegui
  { lat: 10.4597, lng: -64.1768, intensity: 0.35, label: '80' },    // Sucre
  // REDI INSULAR — Total: 60
  { lat: 11.0167, lng: -63.8636, intensity: 0.30, label: '60' },    // Nueva Esparta
  // REDI GUAYANA — Total: 890
  { lat: 5.6639, lng: -67.6256, intensity: 0.40, label: '90' },     // Amazonas
  { lat: 8.1167, lng: -63.5414, intensity: 0.90, label: '775' },    // Bolívar — Cd. Bolívar
  { lat: 8.2833, lng: -62.7333, intensity: 0.85 },                  // Bolívar — Pto Ordaz (sin label, mismo estado)
  { lat: 9.0583, lng: -62.0500, intensity: 0.12, label: '25' },     // Delta Amacuro
]
