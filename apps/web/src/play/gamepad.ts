// useGamepad — small React hook around the Web Gamepad API. Reports
// the first connected gamepad's id (string) or null. Browsers only
// expose a gamepad after the user presses a button on it; we listen
// for both the gamepadconnected event and poll on a slow interval so
// detection is robust across browsers.

import { useEffect, useState } from "react"

export const useGamepad = (): string | null => {
  const [id, setId] = useState<string | null>(null)

  useEffect(() => {
    const check = (): void => {
      const pads = navigator.getGamepads?.() ?? []
      for (const p of pads) {
        if (p && p.connected) {
          setId(p.id)
          return
        }
      }
      setId(null)
    }
    check()

    const onConnect = (e: GamepadEvent) => setId(e.gamepad.id)
    const onDisconnect = () => check()
    window.addEventListener("gamepadconnected", onConnect)
    window.addEventListener("gamepaddisconnected", onDisconnect)

    // Safari sometimes drops the connected event when the page didn't
    // have focus at the moment of connection. Poll once a second for
    // stragglers.
    const interval = setInterval(check, 1000)

    return () => {
      window.removeEventListener("gamepadconnected", onConnect)
      window.removeEventListener("gamepaddisconnected", onDisconnect)
      clearInterval(interval)
    }
  }, [])

  return id
}

// Trim the gamepad's noisy id ("Xbox 360 Controller (STANDARD GAMEPAD
// Vendor: 045e Product: 028e)") down to something readable for a badge.
export const shortGamepadName = (id: string): string => {
  const paren = id.indexOf("(")
  const trimmed = paren > 0 ? id.slice(0, paren).trim() : id
  return trimmed.length > 22 ? `${trimmed.slice(0, 22)}…` : trimmed
}
