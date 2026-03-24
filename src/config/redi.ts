// =============================================
// REDI — Regiones Estratégicas de Defensa Integral
// =============================================

export const REDI_COLORS: Record<string, string> = {
  'REDI CAPITAL':     '#00d4ff',
  'REDI CENTRAL':     '#00ff88',
  'REDI OCCIDENTAL':  '#ff3366',
  'REDI LOS LLANOS':  '#fbbf24',
  'REDI LOS ANDES':   '#8b5cf6',
  'REDI ORIENTAL':    '#06b6d4',
  'REDI GUAYANA':     '#10b981',
  'REDIMAIN':         '#ec4899',
}

export const REDI_ORDER = [
  'REDI CAPITAL', 'REDI CENTRAL', 'REDI OCCIDENTAL', 'REDI LOS LLANOS',
  'REDI LOS ANDES', 'REDI ORIENTAL', 'REDI GUAYANA', 'REDIMAIN',
]

export const STATE_REDI: Record<string, string> = {
  'distrito capital': 'REDI CAPITAL',
  'miranda':          'REDI CAPITAL',
  'la guaira':        'REDI CAPITAL',
  'aragua':           'REDI CENTRAL',
  'carabobo':         'REDI CENTRAL',
  'yaracuy':          'REDI CENTRAL',
  'falcon':           'REDI OCCIDENTAL',
  'lara':             'REDI OCCIDENTAL',
  'zulia':            'REDI OCCIDENTAL',
  'apure':            'REDI LOS LLANOS',
  'barinas':          'REDI LOS LLANOS',
  'cojedes':          'REDI LOS LLANOS',
  'portuguesa':       'REDI LOS LLANOS',
  'guarico':          'REDI LOS LLANOS',
  'merida':           'REDI LOS ANDES',
  'tachira':          'REDI LOS ANDES',
  'trujillo':         'REDI LOS ANDES',
  'anzoategui':       'REDI ORIENTAL',
  'monagas':          'REDI ORIENTAL',
  'sucre':            'REDI ORIENTAL',
  'bolivar':          'REDI GUAYANA',
  'amazonas':         'REDI GUAYANA',
  'delta amacuro':    'REDI GUAYANA',
  'nueva esparta':          'REDIMAIN',
  'dependencias federales': 'REDIMAIN',
}

export function getStateRedi(stateName: string): string {
  return STATE_REDI[normalizeName(stateName)] || ''
}

const NAME_ALIASES: Record<string, string> = {
  'distrito federal': 'distrito capital',
  'vargas': 'la guaira',
  'distritocapital': 'distrito capital',
  'deltaamacuro': 'delta amacuro',
  'nuevaesparta': 'nueva esparta',
  'dependenciasfederales': 'dependencias federales',
}

export function normalizeName(name: string): string {
  let n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^estado\s+/i, '')
    .trim()
  return NAME_ALIASES[n] ?? n
}
