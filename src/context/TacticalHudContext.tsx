import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
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
  /** Búsqueda territorial (estado / municipio / parroquia), compartida con `VenezuelaMap`. */
  territorialSearchQuery: string
  setTerritorialSearchQuery: Dispatch<SetStateAction<string>>
  mapSearchOpen: boolean
  setMapSearchOpen: Dispatch<SetStateAction<boolean>>
  searchHighlightIdx: number
  setSearchHighlightIdx: Dispatch<SetStateAction<number>>
  /** Nodo bajo el input del header (escritorio); el mapa hace portal del desplegable aquí. */
  territorySearchDropdownHost: HTMLDivElement | null
  setTerritorySearchDropdownHost: (el: HTMLDivElement | null) => void
  /** Área clic del buscador en cabecera (cierra desplegable al clic fuera). */
  headerTerritorySearchRef: MutableRefObject<HTMLDivElement | null>
  mapSearchKeyDownHandlerRef: MutableRefObject<
    ((e: ReactKeyboardEvent<HTMLInputElement>) => void) | null
  >
}

const TacticalHudContext = createContext<TacticalHudValue | null>(null)

export function TacticalHudProvider({ children }: { children: ReactNode }) {
  const [cursor, setCursor] = useState<TacticalCursor | null>(null)
  const [mapCenter, setMapCenter] = useState<TacticalCursor | null>({ lat: 7.5, lng: -66.58 })
  const mountMs = useRef(Date.now())
  const [uptime, setUptime] = useState('00:00:00')
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null)

  const [territorialSearchQuery, setTerritorialSearchQuery] = useState('')
  const [mapSearchOpen, setMapSearchOpen] = useState(false)
  const [searchHighlightIdx, setSearchHighlightIdx] = useState(0)
  const [territorySearchDropdownHost, setTerritorySearchDropdownHost] = useState<HTMLDivElement | null>(
    null,
  )
  const headerTerritorySearchRef = useRef<HTMLDivElement | null>(null)
  const mapSearchKeyDownHandlerRef = useRef<
    ((e: ReactKeyboardEvent<HTMLInputElement>) => void) | null
  >(null)

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
      territorialSearchQuery,
      setTerritorialSearchQuery,
      mapSearchOpen,
      setMapSearchOpen,
      searchHighlightIdx,
      setSearchHighlightIdx,
      territorySearchDropdownHost,
      setTerritorySearchDropdownHost,
      headerTerritorySearchRef,
      mapSearchKeyDownHandlerRef,
    }),
    [
      cursor,
      mapCenter,
      uptime,
      focusDesktopSearch,
      territorialSearchQuery,
      mapSearchOpen,
      searchHighlightIdx,
      territorySearchDropdownHost,
    ],
  )

  return <TacticalHudContext.Provider value={value}>{children}</TacticalHudContext.Provider>
}

export function useTacticalHud(): TacticalHudValue | null {
  return useContext(TacticalHudContext)
}
