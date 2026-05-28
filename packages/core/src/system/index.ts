export type System = "nes" | "snes" | "genesis"

export type SystemMeta = {
  id: System
  name: string
  shortName: string
  extensions: readonly string[]
  core: string
  accent: string
}

export const systemMeta: Record<System, SystemMeta> = {
  nes: {
    id: "nes",
    name: "Nintendo Entertainment System",
    shortName: "NES",
    extensions: [".nes"],
    core: "fceumm",
    accent: "#d62828",
  },
  snes: {
    id: "snes",
    name: "Super Nintendo",
    shortName: "SNES",
    extensions: [".sfc", ".smc"],
    core: "snes9x",
    accent: "#5e60ce",
  },
  genesis: {
    id: "genesis",
    name: "Sega Genesis / Mega Drive",
    shortName: "Genesis",
    extensions: [".md", ".gen", ".smd"],
    core: "genesis_plus_gx",
    accent: "#11a35a",
  },
}

export const systems: readonly System[] = ["nes", "snes", "genesis"]

const lowerExt = (filename: string): string => {
  const dot = filename.lastIndexOf(".")
  return dot < 0 ? "" : filename.slice(dot).toLowerCase()
}

export const systemFromExtension = (filename: string): System | null => {
  const ext = lowerExt(filename)
  if (!ext) return null
  for (const sys of systems) {
    if (systemMeta[sys].extensions.includes(ext)) return sys
  }
  return null
}

const NES_MAGIC = [0x4e, 0x45, 0x53, 0x1a]
const SMD_MAGIC = "SEGA"
const SMD_MAGIC_OFFSETS = [0x100, 0x101]

const startsWithNesMagic = (bytes: Uint8Array): boolean => {
  if (bytes.length < 4) return false
  for (let i = 0; i < 4; i++) if (bytes[i] !== NES_MAGIC[i]) return false
  return true
}

const containsGenesisMagic = (bytes: Uint8Array): boolean => {
  // Genesis ROMs have "SEGA" near byte 0x100 ("SEGA GENESIS" / "SEGA MEGA DRIVE").
  if (bytes.length < 0x108) return false
  for (const offset of SMD_MAGIC_OFFSETS) {
    let match = true
    for (let i = 0; i < SMD_MAGIC.length; i++) {
      if (bytes[offset + i] !== SMD_MAGIC.charCodeAt(i)) {
        match = false
        break
      }
    }
    if (match) return true
  }
  return false
}

export const systemFromBytes = (bytes: Uint8Array): System | null => {
  if (startsWithNesMagic(bytes)) return "nes"
  if (containsGenesisMagic(bytes)) return "genesis"
  return null
}

// Extensions shared with non-ROM file types (Markdown, generic .bin) — only
// trust them when magic bytes confirm the system.
const AMBIGUOUS_EXTS = new Set([".md"])

export const detectSystem = (filename: string, bytes?: Uint8Array): System | null => {
  const fromBytes = bytes ? systemFromBytes(bytes) : null
  if (fromBytes) return fromBytes
  const ext = lowerExt(filename)
  if (AMBIGUOUS_EXTS.has(ext) && bytes) return null
  return systemFromExtension(filename)
}
