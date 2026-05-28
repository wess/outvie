import { join } from "node:path"
import type { System } from "@outvie/core"

export type Paths = {
  root: string
  roms: string
  saves: string
  states: string
}

export const paths = (root: string): Paths => ({
  root,
  roms: join(root, "roms"),
  saves: join(root, "saves"),
  states: join(root, "states"),
})

export const romPath = (root: string, system: System, id: string, ext: string): string =>
  join(paths(root).roms, system, `${id}${ext}`)

export const savePath = (root: string, system: System, id: string): string =>
  join(paths(root).saves, system, `${id}.sav`)
