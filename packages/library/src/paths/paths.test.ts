import { describe, expect, test } from "bun:test"
import { paths, romPath, savePath } from "./index.ts"

describe("paths", () => {
  test("derives canonical subdirectories under the data root", () => {
    expect(paths("/data")).toEqual({
      root: "/data",
      roms: "/data/roms",
      saves: "/data/saves",
      states: "/data/states",
    })
  })

  test("works with a relative root", () => {
    expect(paths("data").roms).toBe("data/roms")
  })
})

describe("romPath", () => {
  test("nests roms by system and joins id with extension", () => {
    expect(romPath("/data", "nes", "abc123", ".nes")).toBe("/data/roms/nes/abc123.nes")
    expect(romPath("/data", "genesis", "xyz", ".md")).toBe("/data/roms/genesis/xyz.md")
  })
})

describe("savePath", () => {
  test("nests saves by system with a .sav extension", () => {
    expect(savePath("/data", "snes", "abc123")).toBe("/data/saves/snes/abc123.sav")
  })
})
