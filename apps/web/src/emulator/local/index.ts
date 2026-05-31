import { systemMeta } from "@outvie/core"
import { Nostalgist } from "nostalgist"
import type { Player, PlayerMount } from "../index.ts"

export const mountLocalPlayer = async ({ canvas, game, romUrl, onError }: PlayerMount): Promise<Player> => {
  const core = systemMeta[game.system].core
  let instance: Nostalgist | null = null

  try {
    const romResponse = await fetch(romUrl)
    if (!romResponse.ok) throw new Error(`failed to fetch rom: ${romResponse.status}`)
    const romBlob = await romResponse.blob()

    instance = await Nostalgist.launch({
      element: canvas,
      core,
      rom: { fileName: game.filename, fileContent: romBlob },
      size: "auto",
    })
  } catch (err) {
    onError?.(err)
    throw err
  }

  return {
    pause: () => {
      instance?.pause()
    },
    resume: () => {
      instance?.resume()
    },
    saveState: async () => {
      if (!instance) return null
      const result = await instance.saveState()
      return result.state ?? null
    },
    loadState: async (data) => {
      if (!instance) return
      await instance.loadState(data)
    },
    dispose: async () => {
      try {
        await instance?.exit()
      } finally {
        instance = null
      }
    },
  }
}
