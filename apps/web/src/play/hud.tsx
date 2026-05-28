import { ActionIcon, Badge, Group, SegmentedControl, Text, Tooltip } from "@mantine/core"
import { notifications } from "@mantine/notifications"
import {
  IconArrowBackUp,
  IconCloudDownload,
  IconCloudUpload,
  IconKeyboard,
  IconPlayerPause,
  IconPlayerPlay,
} from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import type { Game } from "@outvie/core"
import { systemMeta } from "@outvie/core"
import { downloadSave, type GameSave, listSaves, uploadSave } from "../api/index.ts"
import { systemColor } from "../theme/system.ts"
import { usePlayer } from "./context.tsx"

type Mode = "local" | "stream"
type Props = { game: Game; mode: Mode; onModeChange: (m: Mode) => void }

const STATE_MIME = "application/octet-stream"
const QUICK_SLOT = 0 // single quick-save slot; UI for multiple slots is future work

export const Hud = ({ game, mode, onModeChange }: Props) => {
  const { player } = usePlayer()
  const [paused, setPaused] = useState(false)
  const [quickSave, setQuickSave] = useState<GameSave | null>(null)
  const [busy, setBusy] = useState(false)
  const meta = systemMeta[game.system]
  const streamAvailable = true

  // Pull the existing quick-save metadata on mount so Load isn't enabled
  // until we know there's something to load.
  useEffect(() => {
    let cancelled = false
    listSaves(game.id)
      .then((saves) => {
        if (cancelled) return
        const slot = saves.find((s) => s.slot === QUICK_SLOT) ?? null
        setQuickSave(slot)
      })
      .catch(() => {
        /* server unreachable — Save is still enabled, Load will just 404 */
      })
    return () => {
      cancelled = true
    }
  }, [game.id])

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
    if (mode === "stream") {
      notifications.show({ color: "yellow", message: "Save states are local-only — switch to Local mode" })
      return
    }
    setBusy(true)
    try {
      const blob = await player.saveState()
      if (!blob) {
        notifications.show({ color: "yellow", message: "Player didn't return a save state" })
        return
      }
      const typed = blob.type ? blob : new Blob([blob], { type: STATE_MIME })
      const result = await uploadSave(game.id, QUICK_SLOT, typed)
      setQuickSave(result)
      notifications.show({ color: "violet", message: `Saved to your library (${(result.size / 1024).toFixed(0)} KB)` })
    } catch (err) {
      notifications.show({ color: "red", message: `Save failed: ${err}` })
    } finally {
      setBusy(false)
    }
  }

  const loadState = async () => {
    if (!player) return
    if (mode === "stream") {
      notifications.show({ color: "yellow", message: "Save states are local-only — switch to Local mode" })
      return
    }
    setBusy(true)
    try {
      const blob = await downloadSave(game.id, QUICK_SLOT)
      if (!blob) {
        notifications.show({ color: "yellow", message: "No save yet for this game" })
        return
      }
      // Pass a File so player.loadState (which accepts Blob | File) gets
      // a content-type-stable input across both nostalgist and the
      // remote player.
      const file = new File([blob], `${game.id}-${QUICK_SLOT}.state`, { type: STATE_MIME })
      await player.loadState(file)
      notifications.show({ color: "violet", message: "Loaded your save" })
    } catch (err) {
      notifications.show({ color: "red", message: `Load failed: ${err}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Group
      justify="space-between"
      px={{ base: "xs", sm: "md" }}
      py="xs"
      wrap="nowrap"
      gap="xs"
      style={{
        background: "rgba(11,12,16,0.85)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        paddingBottom: "calc(var(--mantine-spacing-xs) + env(safe-area-inset-bottom))",
      }}
    >
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: "1 1 auto" }}>
        <Tooltip label="Back to library" withArrow>
          <ActionIcon component={Link} to="/" variant="subtle" color="gray" aria-label="back">
            <IconArrowBackUp size={18} />
          </ActionIcon>
        </Tooltip>
        <Badge
          size="xs"
          variant="light"
          color={game.system === "nes" ? "red" : "violet"}
          radius="sm"
          visibleFrom="xs"
        >
          {meta.shortName}
        </Badge>
        <Text size="sm" fw={600} lineClamp={1} style={{ minWidth: 0 }}>
          {game.title}
        </Text>
      </Group>

      <Group gap={4} wrap="nowrap">
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => onModeChange(v as Mode)}
          data={[
            { label: "Stream", value: "stream", disabled: !streamAvailable },
            { label: "Local", value: "local" },
          ]}
          color="violet"
          visibleFrom="sm"
        />
        <Tooltip label={paused ? "Resume" : "Pause"} withArrow>
          <ActionIcon variant="subtle" color="gray" onClick={togglePause} disabled={!player} aria-label="pause">
            {paused ? <IconPlayerPlay size={18} /> : <IconPlayerPause size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip
          label={mode === "stream" ? "Save states only available locally" : "Save to your library"}
          withArrow
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={saveState}
            disabled={!player || mode === "stream" || busy}
            aria-label="save state"
            visibleFrom="sm"
          >
            <IconCloudUpload size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip
          label={
            mode === "stream"
              ? "Save states only available locally"
              : quickSave
                ? `Load your save (${new Date(quickSave.updated_at).toLocaleString()})`
                : "No save yet"
          }
          withArrow
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={loadState}
            disabled={!player || mode === "stream" || busy || !quickSave}
            aria-label="load state"
            visibleFrom="sm"
          >
            <IconCloudDownload size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip
          label="Arrow keys = D-Pad · Z/X = B/A · Enter = Start · Shift = Select · Plug in a gamepad for full controls"
          withArrow
          multiline
          w={280}
        >
          <ActionIcon variant="subtle" color="gray" aria-label="controls" visibleFrom="sm">
            <IconKeyboard size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  )
}
