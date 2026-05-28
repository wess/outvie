const ROM_SUFFIXES = [".nes", ".sfc", ".smc"]
const ROUND_BRACKETS = /\s*\([^)]*\)/g
const SQUARE_BRACKETS = /\s*\[[^\]]*\]/g

export const titleFromFilename = (filename: string): string => {
  let name = filename
  const dot = name.lastIndexOf(".")
  if (dot > 0 && ROM_SUFFIXES.includes(name.slice(dot).toLowerCase())) {
    name = name.slice(0, dot)
  }
  return name.replace(ROUND_BRACKETS, "").replace(SQUARE_BRACKETS, "").replace(/_/g, " ").trim() || filename
}
