import { Badge, Box, Center, Group, Loader, Stack, Text } from "@mantine/core"
import type { Game } from "@outvie/core"
import { IconDeviceGamepad } from "@tabler/icons-react"
import { useEffect, useRef, useState } from "react"
import { romUrl } from "../api/index.ts"
import { mountLocalPlayer, mountRemotePlayer, type Player } from "../emulator/index.ts"
import { usePlayer } from "./context.tsx"
import { shortGamepadName, useGamepad } from "./gamepad.ts"

type Mode = "local" | "stream"

type Props = { game: Game; mode: Mode; onModeChange: (mode: Mode) => void }

export const Stage = ({ game, mode, onModeChange }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playerRef = useRef<Player | null>(null)
  const gamepad = useGamepad()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { setPlayer } = usePlayer()

  // Key the mount on game.id, not the whole game object — only a different game
  // should tear down and re-create the emulator; an unrelated game object identity
  // change must not.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional, see above
  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    setLoading(true)
    setError(null)

    const mount = mode === "stream" ? mountRemotePlayer : mountLocalPlayer
    mount({
      canvas,
      game,
      romUrl: romUrl(game.id),
      onError: (err) => {
        if (!cancelled) setError(String(err))
      },
    })
      .then((p) => {
        if (cancelled) {
          void p.dispose()
          return
        }
        playerRef.current = p
        setPlayer(p)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        const isRemoteFailure = mode === "stream"
        if (isRemoteFailure) {
          setError(`${message} · falling back to local play`)
          setTimeout(() => onModeChange("local"), 800)
        } else {
          setError(message)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      const current = playerRef.current
      playerRef.current = null
      setPlayer(null)
      void current?.dispose()
    }
  }, [game.id, mode, setPlayer, onModeChange])

  return (
    <Box style={{ position: "relative", height: "100%", overflow: "hidden" }} className="outvie-player">
      {/* No inline width/height — global.css sizes the canvas to fill
          this cell and uses object-fit: contain to scale the picture up
          or down (aspect-preserved) on any monitor size, the way a
          remote-desktop viewport does. */}
      <canvas ref={canvasRef} />
      <Group pos="absolute" top={12} left={12} gap={6} wrap="nowrap">
        <Badge size="xs" radius="sm" variant="light" color={mode === "stream" ? "violet" : "gray"}>
          <span className="outvie-status-dot" style={{ background: mode === "stream" ? "#9b87f5" : "#888" }} />
          &nbsp;{mode === "stream" ? "Streaming · server" : "Local · browser"}
        </Badge>
        {gamepad && (
          <Badge
            size="xs"
            radius="sm"
            variant="light"
            color="teal"
            leftSection={<IconDeviceGamepad size={10} />}
            title={gamepad}
          >
            {shortGamepadName(gamepad)}
          </Badge>
        )}
      </Group>
      {loading ? (
        <Center pos="absolute" inset={0}>
          <Stack align="center" gap="xs">
            <Loader color="violet" />
            <Text size="sm" c="dimmed">
              {mode === "stream" ? "Negotiating stream…" : "Booting"} {game.title}
            </Text>
          </Stack>
        </Center>
      ) : null}
      {error ? (
        <Center pos="absolute" inset={0}>
          <Stack align="center" gap="xs" maw={520} px="md">
            <Text c="red.4" fw={600}>
              Stage error
            </Text>
            <Text size="xs" c="dimmed" ta="center">
              {error}
            </Text>
          </Stack>
        </Center>
      ) : null}
    </Box>
  )
}
