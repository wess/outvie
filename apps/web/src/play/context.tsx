import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import type { Player } from "../emulator/index.ts"

type Ctx = {
  player: Player | null
  setPlayer: (p: Player | null) => void
}

const PlayerCtx = createContext<Ctx | null>(null)

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  const [player, setPlayer] = useState<Player | null>(null)
  const value = useMemo(() => ({ player, setPlayer }), [player])
  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>
}

export const usePlayer = (): Ctx => {
  const ctx = useContext(PlayerCtx)
  if (!ctx) throw new Error("usePlayer requires PlayerProvider")
  return ctx
}
