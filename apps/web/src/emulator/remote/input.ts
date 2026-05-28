type Button = "up" | "down" | "left" | "right" | "a" | "b" | "start" | "select"

const keyMap: Record<string, Button> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  KeyZ: "b",
  KeyX: "a",
  Slash: "a",
  Period: "b",
  Enter: "start",
  ShiftRight: "select",
  ShiftLeft: "select",
  Backspace: "select",
}

const gamepadButtonMap: Record<number, Button> = {
  0: "a",
  1: "b",
  8: "select",
  9: "start",
  12: "up",
  13: "down",
  14: "left",
  15: "right",
}

const send = (ws: WebSocket, button: Button, pressed: boolean, player = 1) => {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: "input", player, button, pressed }))
}

export const attachInputBridge = (ws: WebSocket, target: HTMLElement): (() => void) => {
  const pressedKeys = new Set<string>()
  const pressedPadBtns = new Map<string, boolean>()
  let rafId = 0

  const onKeyDown = (e: KeyboardEvent) => {
    const btn = keyMap[e.code]
    if (!btn) return
    e.preventDefault()
    if (pressedKeys.has(e.code)) return
    pressedKeys.add(e.code)
    send(ws, btn, true)
  }
  const onKeyUp = (e: KeyboardEvent) => {
    const btn = keyMap[e.code]
    if (!btn) return
    e.preventDefault()
    if (!pressedKeys.has(e.code)) return
    pressedKeys.delete(e.code)
    send(ws, btn, false)
  }

  const sendAxis = (gamepadIndex: number, axis: number, posBtn: Button, negBtn: Button) => {
    const id = `${gamepadIndex}:axis:${axis}:${posBtn}/${negBtn}`
    const value = navigator.getGamepads()[gamepadIndex]?.axes[axis] ?? 0
    const threshold = 0.45
    const posKey = `${id}:pos`
    const negKey = `${id}:neg`
    const wasPos = pressedPadBtns.get(posKey) ?? false
    const wasNeg = pressedPadBtns.get(negKey) ?? false
    const isPos = value > threshold
    const isNeg = value < -threshold
    if (isPos !== wasPos) {
      send(ws, posBtn, isPos)
      pressedPadBtns.set(posKey, isPos)
    }
    if (isNeg !== wasNeg) {
      send(ws, negBtn, isNeg)
      pressedPadBtns.set(negKey, isNeg)
    }
  }

  const pollGamepads = () => {
    const pads = navigator.getGamepads()
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i]
      if (!pad) continue
      for (const indexStr of Object.keys(gamepadButtonMap)) {
        const idx = Number(indexStr)
        const btn = gamepadButtonMap[idx]
        if (!btn) continue
        const key = `${i}:btn:${idx}`
        const pressed = pad.buttons[idx]?.pressed ?? false
        if (pressed !== (pressedPadBtns.get(key) ?? false)) {
          send(ws, btn, pressed)
          pressedPadBtns.set(key, pressed)
        }
      }
      if (pad.axes.length >= 2) {
        sendAxis(i, 0, "right", "left")
        sendAxis(i, 1, "down", "up")
      }
    }
    rafId = requestAnimationFrame(pollGamepads)
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  target.tabIndex = 0
  target.focus({ preventScroll: true })
  rafId = requestAnimationFrame(pollGamepads)

  return () => {
    cancelAnimationFrame(rafId)
    window.removeEventListener("keydown", onKeyDown)
    window.removeEventListener("keyup", onKeyUp)
    for (const [key, was] of pressedPadBtns) {
      if (was) {
        const seg = key.split(":")
        const btnName = seg[seg.length - 1]
        if (btnName) send(ws, btnName as Button, false)
      }
    }
    for (const code of pressedKeys) {
      const btn = keyMap[code]
      if (btn) send(ws, btn, false)
    }
  }
}
