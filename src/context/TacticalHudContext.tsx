import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'

export type TacticalCursor = { lat: number; lng: number }

export type TacticalHudValue = {
  cursor: TacticalCursor | null
  setCursor: (c: TacticalCursor | null) => void
  mapCenter: TacticalCursor | null
  setMapCenter: (c: TacticalCursor | null) => void
  uptime: string
  desktopSearchInputRef: MutableRefObject<HTMLInputElement | null>
  focusDesktopSearch: () => void
}

const TacticalHudContext = createContext<TacticalHudValue | null>(null)

export function TacticalHudProvider({ children }: { children: ReactNode }) {
  const [cursor, setCursor] = useState<TacticalCursor | null>(null)
  const [mapCenter, setMapCenter] = useState<TacticalCursor | null>({ lat: 7.5, lng: -66.58 })
  const mountMs = useRef(Date.now())
  const [uptime, setUptime] = useState('00:00:00')
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = Math.floor((Date.now() - mountMs.current) / 1000)
      const h = Math.floor(s / 3600) % 100
      const m = Math.floor((s % 3600) / 60)
      const sec = s % 60
      setUptime(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
      )
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const focusDesktopSearch = useCallback(() => {
    desktopSearchInputRef.current?.focus()
  }, [])

  const value = useMemo(
    () => ({
      cursor,
      setCursor,
      mapCenter,
      setMapCenter,
      uptime,
      desktopSearchInputRef,
      focusDesktopSearch,
    }),
    [cursor, mapCenter, uptime, focusDesktopSearch],
  )

  return <TacticalHudContext.Provider value={value}>{children}</TacticalHudContext.Provider>
}

export function useTacticalHud(): TacticalHudValue | null {
  return useContext(TacticalHudContext)
}
