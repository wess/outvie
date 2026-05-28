import { createTheme, type MantineThemeOverride } from "@mantine/core"

export const theme: MantineThemeOverride = createTheme({
  primaryColor: "violet",
  defaultRadius: "lg",
  fontFamily: '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
  headings: {
    fontFamily: '"Inter Display", "Inter", ui-sans-serif, system-ui, sans-serif',
    fontWeight: "700",
  },
  colors: {
    nes: [
      "#fde7e7",
      "#f9c1c1",
      "#f59595",
      "#f06868",
      "#e94747",
      "#d62828",
      "#b51d1d",
      "#911414",
      "#6d0d0d",
      "#480606",
    ],
    snes: [
      "#ece6ff",
      "#d2c5fa",
      "#b39ff4",
      "#9279ee",
      "#7559e7",
      "#5e60ce",
      "#4948b4",
      "#363391",
      "#241e6c",
      "#130f47",
    ],
    genesis: [
      "#e3f9eb",
      "#c5f0d5",
      "#9be1b4",
      "#6cd190",
      "#3bc16d",
      "#11a35a",
      "#0d8c4d",
      "#0b733e",
      "#075a31",
      "#053f22",
    ],
  },
})
