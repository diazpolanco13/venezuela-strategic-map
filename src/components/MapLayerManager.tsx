import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GripVertical, Layers, X } from 'lucide-react'
import {
  type StackableMapLayerId,
  DEFAULT_MAP_LAYER_ORDER,
  MAP_LAYER_LABELS,
  moveLayerInOrder,
} from '../config/mapLayerStack'

export type MapLayerVisibility = {
  country: boolean
  states: boolean
  municipalities: boolean
  parishes: boolean
  redi: boolean
}

type MapLayerManagerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  layerOrder: StackableMapLayerId[]
  onLayerOrderChange: (order: StackableMapLayerId[]) => void
  visibility: MapLayerVisibility
  onVisibilityChange: (key: keyof MapLayerVisibility, visible: boolean) => void
}

export function MapLayerManager({
  open,
  onOpenChange,
  layerOrder,
  onLayerOrderChange,
  visibility,
  onVisibilityChange,
}: MapLayerManagerProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const onDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.setData('application/x-ven-map-layer-idx', String(index))
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const onDragEnd = useCallback(() => {
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

  const onDropOnRow = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData('application/x-ven-map-layer-idx')
      const from = parseInt(raw, 10)
      if (!Number.isFinite(from)) return
      onLayerOrderChange(moveLayerInOrder(layerOrder, from, toIndex))
      setDragIndex(null)
      setDragOverIndex(null)
    },
    [layerOrder, onLayerOrderChange],
  )

  const visKey: Record<StackableMapLayerId, keyof MapLayerVisibility> = {
    country: 'country',
    states: 'states',
    municipalities: 'municipalities',
    parishes: 'parishes',
    redi: 'redi',
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          title="Orden y visibilidad de capas"
          className="absolute z-[2180] flex flex-col items-center justify-center gap-2 rounded-r-xl border border-sky-500/45 bg-shadow-900/95 py-4 pl-1.5 pr-2 shadow-xl backdrop-blur-sm transition-all hover:border-sky-400/55 hover:bg-sky-500/10
            left-0 top-[42%] -translate-y-1/2 max-lg:top-[38%]"
          aria-expanded={false}
          aria-controls="ven-map-layer-panel"
        >
          <Layers className="h-5 w-5 flex-shrink-0 text-sky-300" aria-hidden />
          <span
            className="hidden max-h-[10rem] text-[9px] font-mono font-semibold uppercase leading-tight tracking-wide text-sky-200/95 sm:block"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Capas
          </span>
          <span className="text-[9px] font-mono text-sky-200/90 sm:hidden px-0.5">Map</span>
        </button>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Cerrar panel de capas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[2178] bg-black/40 backdrop-blur-[1px] lg:bg-black/25"
              onClick={() => onOpenChange(false)}
            />
            <motion.aside
              id="ven-map-layer-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ven-map-layer-panel-title"
              initial={{ x: -320, opacity: 0.95 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="absolute left-0 top-0 bottom-0 z-[2185] flex w-[min(19rem,calc(100%-2.5rem))] flex-col border-r border-white/10 bg-shadow-900/97 shadow-2xl backdrop-blur-md"
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="h-4 w-4 flex-shrink-0 text-sky-400" aria-hidden />
                  <h2 id="ven-map-layer-panel-title" className="text-[11px] font-mono font-bold text-white truncate">
                    Capas del mapa
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="flex-shrink-0 rounded-md border border-white/10 p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
                  aria-label="Cerrar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="px-3 py-2 text-[9px] text-gray-500 font-mono leading-relaxed border-b border-white/5 flex-shrink-0">
                Arrastra el asa <span className="text-gray-400">⋮⋮</span> para cambiar qué capa queda encima.
                Esequiba sigue a «Estados».
              </p>
              <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-2 px-2 space-y-1">
                {layerOrder.map((id, index) => {
                  const vkey = visKey[id]
                  const on = visibility[vkey]
                  const activeDrop = dragOverIndex === index && dragIndex !== index
                  return (
                    <li
                      key={`${String(id)}-${index}`}
                      onDragOver={e => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setDragOverIndex(index)
                      }}
                      onDragLeave={() => setDragOverIndex(i => (i === index ? null : i))}
                      onDrop={e => onDropOnRow(e, index)}
                      className={`flex items-center gap-1 rounded-lg border px-1.5 py-1.5 transition-colors
                        ${activeDrop ? 'border-sky-500/50 bg-sky-500/10' : 'border-white/10 bg-shadow-800/80'}
                        ${dragIndex === index ? 'opacity-60' : ''}`}
                    >
                      <div
                        draggable
                        onDragStart={e => onDragStart(e, index)}
                        onDragEnd={onDragEnd}
                        className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 p-0.5 touch-none flex-shrink-0"
                        title="Arrastrar para reordenar"
                        role="presentation"
                      >
                        <GripVertical className="h-4 w-4" aria-hidden />
                      </div>
                      <label className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={e => onVisibilityChange(vkey, e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-white/20 bg-shadow-900 text-sky-500 focus:ring-sky-500/40"
                        />
                        <span className="text-[10px] font-mono text-gray-200 leading-snug break-words">
                          {MAP_LAYER_LABELS[id]}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              <p className="flex-shrink-0 px-3 py-2 text-[8px] text-gray-600 font-mono border-t border-white/5">
                Orden por defecto: {DEFAULT_MAP_LAYER_ORDER.map(i => MAP_LAYER_LABELS[i]).join(' → ')}
              </p>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
