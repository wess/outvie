import { describe, expect, test } from "bun:test"
import { titleFromFilename } from "./index.ts"

describe("titleFromFilename", () => {
  test("strips known ROM suffixes case-insensitively", () => {
    expect(titleFromFilename("Super Mario Bros.nes")).toBe("Super Mario Bros")
    expect(titleFromFilename("Chrono Trigger.SFC")).toBe("Chrono Trigger")
    expect(titleFromFilename("Secret of Mana.smc")).toBe("Secret of Mana")
  })

  test("leaves unknown extensions intact", () => {
    expect(titleFromFilename("Sonic.md")).toBe("Sonic.md")
  })

  test("removes round-bracket region/version tags", () => {
    expect(titleFromFilename("Mega Man (USA).nes")).toBe("Mega Man")
    expect(titleFromFilename("Mega Man (USA) (Rev A).nes")).toBe("Mega Man")
  })

  test("removes square-bracket dump tags", () => {
    expect(titleFromFilename("Metroid [!].nes")).toBe("Metroid")
  })

  test("removes mixed bracket tags", () => {
    expect(titleFromFilename("Kirby (USA) [!].nes")).toBe("Kirby")
  })

  test("converts underscores to spaces", () => {
    expect(titleFromFilename("Donkey_Kong_Country.smc")).toBe("Donkey Kong Country")
  })

  test("trims surrounding whitespace", () => {
    expect(titleFromFilename("Tetris (USA).nes")).toBe("Tetris")
  })

  test("falls back to the original filename when stripping yields empty", () => {
    expect(titleFromFilename("(USA).nes")).toBe("(USA).nes")
  })

  test("handles a filename with no extension", () => {
    expect(titleFromFilename("Earthbound")).toBe("Earthbound")
  })
})
