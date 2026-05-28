import type { System } from "@outvie/core"

export const systemColor = (system: System): string => {
  switch (system) {
    case "nes":
      return "red"
    case "snes":
      return "violet"
    case "genesis":
      return "teal"
  }
}
