import { Box, Center, Loader, Stack, Text } from "@mantine/core"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useParams } from "react-router-dom"
import { getGame } from "../api/index.ts"
import { PlayerProvider } from "./context.tsx"
import { Hud } from "./hud.tsx"
import { Stage } from "./stage.tsx"

type Mode = "local" | "stream"

export const Play = () => {
  const { id } = useParams<{ id: string }>()
  const q = useQuery({
    queryKey: ["game", id],
    queryFn: () => getGame(id as string),
    enabled: !!id,
  })
  const [mode, setMode] = useState<Mode>("stream")

  if (q.isLoading) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    )
  }
  if (q.isError || !q.data) {
    return (
      <Center h="100%">
        <Stack align="center" gap="xs">
          <Text c="red.4">Couldn’t load this game</Text>
          <Text size="sm" c="dimmed">
            It may have been removed.
          </Text>
        </Stack>
      </Center>
    )
  }

  return (
    <PlayerProvider>
      <Box
        style={{
          height: "100%",
          display: "grid",
          gridTemplateRows: "minmax(0, 1fr) auto",
          background: "#000",
          overflow: "hidden",
        }}
      >
        {/* minmax(0, 1fr) is critical — without it the grid child
            defaults to min-height: auto and grows past the viewport,
            pushing the HUD off the bottom on large monitors. The
            min-height: 0 below is belt-and-braces for older Safari. */}
        <Box style={{ minHeight: 0, overflow: "hidden", height: "100%" }}>
          <Stage game={q.data} mode={mode} onModeChange={setMode} />
        </Box>
        <Hud game={q.data} mode={mode} onModeChange={setMode} />
      </Box>
    </PlayerProvider>
  )
}
