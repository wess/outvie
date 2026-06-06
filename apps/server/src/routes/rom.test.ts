import { describe, expect, test } from "bun:test"
import { computeRange } from "./rom.ts"

const SIZE = 1000

describe("computeRange", () => {
  test("returns null (full 200) when no Range header is present", () => {
    expect(computeRange(null, SIZE)).toBeNull()
  })

  test("returns null for a malformed Range header", () => {
    expect(computeRange("bytes=abc", SIZE)).toBeNull()
    expect(computeRange("items=0-10", SIZE)).toBeNull()
  })

  test("resolves a closed range as inclusive start/end (206)", () => {
    expect(computeRange("bytes=0-99", SIZE)).toEqual({ start: 0, end: 99 })
  })

  test("treats an open-ended range as running to the last byte", () => {
    expect(computeRange("bytes=200-", SIZE)).toEqual({ start: 200, end: 999 })
  })

  test("clamps an end past the resource size to the last byte", () => {
    expect(computeRange("bytes=0-99999", SIZE)).toEqual({ start: 0, end: 999 })
  })

  test("rejects a range whose start is beyond the resource (start > end)", () => {
    expect(computeRange("bytes=2000-3000", SIZE)).toBeNull()
  })

  test("rejects an inverted range where start exceeds the clamped end", () => {
    expect(computeRange("bytes=999-0", SIZE)).toBeNull()
  })

  test("allows a single-byte range", () => {
    expect(computeRange("bytes=0-0", SIZE)).toEqual({ start: 0, end: 0 })
  })
})
