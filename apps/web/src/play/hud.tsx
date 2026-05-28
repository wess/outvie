import { ActionIcon, Badge, Group, SegmentedControl, Text, Tooltip } from "@mantine/core"
import { notifications } from "@mantine/notifications"
import {
  IconArrowBackUp,
  IconDeviceFloppy,
  IconKeyboard,
  IconPlayerPause,
  IconPlayerPlay,
  IconUpload,
} from "@tabler/icons-react"
import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import type { Game } from "@outvie/core"
import { systemMeta } from "@outvie/core"
import { systemColor } from "../theme/system.ts"
import { usePlayer } from "./context.tsx"

type Mode = "local" | "stream"
type Props = { game: Game; mode: Mode; onModeChange: (m: Mode) => void }

const STATE_MIME = "application/octet-stream"

export const Hud = ({ game, mode, onModeChange }: Props) => {
  const { player } = usePlayer()
  const [paused, setPaused] = useState(false)
  const loadInputRef = useRef<HTMLInputElement>(null)
  const meta = systemMeta[game.system]
  const streamAvailable = true

  const togglePause = () => {
    if (!player) return
    if (paused) {
      player.resume()
      setPaused(false)
    } else {
      player.pause()
      setPaused(true)
    }
  }

  const saveState = async () => {
    if (!player) return
    try {
      const blob = await player.saveState()
      if (!blob) {
        notifications.show({ color: "yellow", message: "Save states are local-only" })
        return
      }
      const typed = blob.type ? blob : new Blob([blob], { type: STATE_MIME })
      const url = URL.createObjectURL(typed)
      const a = document.createElement("a")
      a.href = url
      a.download = `${game.title.replace(/[^a-z0-9]+/gi, "_")}.state`
      a.click()
      URL.revokeObjectURL(url)
      notifications.show({ color: "violet", message: "Saved state to disk" })
    } catch (err) {
      notifications.show({ color: "red", message: `Save failed: ${err}` })
    }
  }

  const loadState = async (file: File) => {
    if (!player) return
    try {
      await player.loadState(file)
      notifications.show({ color: "violet", message: "Loaded state" })
    } catch (err) {
      notifications.show({ color: "red", message: `Load failed: ${err}` })
    }
  }

  return (
    <Group
      justify="space-between"
      px="md"
      py="xs"
      style={{
        background: "rgba(11,12,16,0.85)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(10px)",
      }}
    >
      <Group gap="sm" wrap="nowrap">
        <Tooltip label="Back to library" withArrow>
          <ActionIcon component={Link} to="/" variant="subtle" color="gray" aria-label="back">
            <IconArrowBackUp size={18} />
          </ActionIcon>
        </Tooltip>
        <Badge size="xs" variant="light" color={game.system === "nes" ? "red" : "violet"} radius="sm">
          {meta.shortName}
        </Badge>
        <Text size="sm" fw={600} lineClamp={1} maw={360}>
          {game.title}
        </Text>
      </Group>

      <Group gap="xs">
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => onModeChange(v as Mode)}
          data={[
            { label: "Stream", value: "stream", disabled: !streamAvailable },
            { label: "Local", value: "local" },
          ]}
          color="violet"
        />
        <Tooltip label={paused ? "Resume" : "Pause"} withArrow>
          <ActionIcon variant="subtle" color="gray" onClick={togglePause} disabled={!player} aria-label="pause">
            {paused ? <IconPlayerPlay size={18} /> : <IconPlayerPause size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label={mode === "stream" ? "Save states only available locally" : "Save state"} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={saveState}
            disabled={!player || mode === "stream"}
            aria-label="save state"
          >
            <IconDeviceFloppy size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={mode === "stream" ? "Load states only available locally" : "Load state"} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => loadInputRef.current?.click()}
            disabled={!player || mode === "stream"}
            aria-label="load state"
          >
            <IconUpload size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip
          label="Arrow keys = D-Pad · Z/X = B/A · Enter = Start · Shift = Select · Plug in a gamepad for full controls"
          withArrow
          multiline
          w={280}
        >
          <ActionIcon variant="subtle" color="gray" aria-label="controls">
            <IconKeyboard size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <input
        ref={loadInputRef}
        type="file"
        hidden
        accept=".state,application/octet-stream"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void loadState(file)
          if (loadInputRef.current) loadInputRef.current.value = ""
        }}
      />
    </Group>
  )
}
