import { describe, expect, test } from "bun:test"
import { detectSystem, systemFromBytes, systemFromExtension } from "./index.ts"

const bytesOf = (parts: number[]): Uint8Array => Uint8Array.from(parts)

const genesisBytes = (offset: number): Uint8Array => {
  const buf = new Uint8Array(0x110)
  buf.set(Uint8Array.from([0x53, 0x45, 0x47, 0x41]), offset) // "SEGA"
  return buf
}

describe("systemFromExtension", () => {
  test("maps known extensions case-insensitively", () => {
    expect(systemFromExtension("Mario.nes")).toBe("nes")
    expect(systemFromExtension("Zelda.SFC")).toBe("snes")
    expect(systemFromExtension("game.smc")).toBe("snes")
    expect(systemFromExtension("sonic.md")).toBe("genesis")
    expect(systemFromExtension("sonic.gen")).toBe("genesis")
    expect(systemFromExtension("sonic.smd")).toBe("genesis")
  })

  test("returns null for unknown or missing extension", () => {
    expect(systemFromExtension("readme.txt")).toBeNull()
    expect(systemFromExtension("noext")).toBeNull()
    expect(systemFromExtension("")).toBeNull()
  })
})

describe("systemFromBytes", () => {
  test("detects NES magic header", () => {
    expect(systemFromBytes(bytesOf([0x4e, 0x45, 0x53, 0x1a, 0x00]))).toBe("nes")
  })

  test("rejects truncated NES header", () => {
    expect(systemFromBytes(bytesOf([0x4e, 0x45, 0x53]))).toBeNull()
  })

  test("detects Genesis SEGA magic at 0x100 and 0x101", () => {
    expect(systemFromBytes(genesisBytes(0x100))).toBe("genesis")
    expect(systemFromBytes(genesisBytes(0x101))).toBe("genesis")
  })

  test("rejects buffers too small for Genesis check", () => {
    expect(systemFromBytes(new Uint8Array(0x80))).toBeNull()
  })

  test("returns null when no magic matches", () => {
    expect(systemFromBytes(new Uint8Array(0x110))).toBeNull()
  })
})

describe("detectSystem", () => {
  test("prefers magic bytes over extension", () => {
    expect(detectSystem("mislabeled.smc", bytesOf([0x4e, 0x45, 0x53, 0x1a]))).toBe("nes")
  })

  test("falls back to extension when bytes are absent", () => {
    expect(detectSystem("Mario.nes")).toBe("nes")
  })

  test("falls back to extension when bytes do not match a magic", () => {
    expect(detectSystem("Zelda.sfc", new Uint8Array(0x110))).toBe("snes")
  })

  test("never trusts the ambiguous .md extension when bytes are present but unmatched", () => {
    expect(detectSystem("notes.md", new Uint8Array(0x110))).toBeNull()
  })

  test("trusts .md extension when no bytes are supplied", () => {
    expect(detectSystem("sonic.md")).toBe("genesis")
  })

  test("confirms .md as genesis when SEGA magic is present", () => {
    expect(detectSystem("sonic.md", genesisBytes(0x100))).toBe("genesis")
  })

  test("returns null for unsupported files", () => {
    expect(detectSystem("readme.txt")).toBeNull()
  })
})
