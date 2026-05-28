import { Box, Button, Group, Modal, Progress, Stack, Text, ThemeIcon } from "@mantine/core"
import { notifications } from "@mantine/notifications"
import { useQueryClient } from "@tanstack/react-query"
import { IconCheck, IconFile, IconUpload, IconX } from "@tabler/icons-react"
import { useEffect, useRef, useState } from "react"
import { systemFromExtension } from "@outvie/core"
import { uploadRom } from "../api/index.ts"

type Props = { opened: boolean; onClose: () => void }

type Status = "queued" | "uploading" | "done" | "error"

type Item = {
  id: string
  file: File
  loaded: number
  total: number
  status: Status
  message?: string
}

const ACCEPT = ".nes,.sfc,.smc,.md,.gen,.smd"
const CONCURRENCY = 3

const isSupported = (f: File) => systemFromExtension(f.name) !== null

const formatSize = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

const reasonText = (reason?: string) => {
  switch (reason) {
    case "unsupported":
      return "Unsupported file"
    case "duplicate":
      return "Already in library"
    case "empty":
      return "Empty file"
    case "io":
      return "Disk write failed"
    default:
      return reason ?? "Upload failed"
  }
}

const newId = () => Math.random().toString(36).slice(2, 10)

export const UploadModal = ({ opened, onClose }: Props) => {
  const [items, setItems] = useState<Item[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inFlightRef = useRef(new Set<string>())
  const qc = useQueryClient()

  useEffect(() => {
    if (!opened) {
      setItems([])
      inFlightRef.current.clear()
    }
  }, [opened])

  const patch = (id: string, fn: (it: Item) => Item) =>
    setItems((prev) => prev.map((it) => (it.id === id ? fn(it) : it)))

  const startUpload = async (item: Item) => {
    inFlightRef.current.add(item.id)
    patch(item.id, (it) => ({ ...it, status: "uploading", loaded: 0 }))
    try {
      const result = await uploadRom(item.file, (p) => {
        patch(item.id, (it) => ({ ...it, loaded: p.loaded, total: p.total }))
      })
      if (result.ok) {
        patch(item.id, (it) => ({ ...it, status: "done", loaded: it.total, message: "Added" }))
        qc.invalidateQueries({ queryKey: ["games"] })
      } else {
        patch(item.id, (it) => ({ ...it, status: "error", message: reasonText(result.reason) }))
      }
    } catch (err) {
      patch(item.id, (it) => ({ ...it, status: "error", message: String(err) }))
    } finally {
      inFlightRef.current.delete(item.id)
    }
  }

  useEffect(() => {
    if (inFlightRef.current.size >= CONCURRENCY) return
    const slots = CONCURRENCY - inFlightRef.current.size
    const pending = items.filter((it) => it.status === "queued" && !inFlightRef.current.has(it.id)).slice(0, slots)
    pending.forEach(startUpload)
    if (items.length > 0 && items.every((it) => it.status === "done" || it.status === "error")) {
      const errors = items.filter((it) => it.status === "error").length
      const ok = items.length - errors
      if (ok > 0) notifications.show({ color: "violet", message: `Added ${ok} game${ok === 1 ? "" : "s"}` })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const addFiles = (files: File[]) => {
    const next: Item[] = files.map((file) =>
      isSupported(file)
        ? { id: newId(), file, loaded: 0, total: file.size, status: "queued" }
        : { id: newId(), file, loaded: 0, total: file.size, status: "error", message: "Unsupported file" },
    )
    setItems((prev) => [...prev, ...next])
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const allDone = items.length > 0 && items.every((it) => it.status === "done" || it.status === "error")

  return (
    <Modal opened={opened} onClose={onClose} title="Add games" centered size="lg" overlayProps={{ blur: 6 }}>
      <Stack gap="md">
        <Box
          className="outvie-dropzone"
          data-active={dragging}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Stack align="center" gap="xs">
            <ThemeIcon size={48} radius="xl" variant="light" color="violet">
              <IconUpload size={22} />
            </ThemeIcon>
            <Text fw={600}>Drop ROM files here</Text>
            <Text size="xs" c="dimmed">
              .nes, .sfc, .smc, .md, .gen, .smd · multiple files · no timeout limit
            </Text>
          </Stack>
          <input
            type="file"
            ref={inputRef}
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const files = e.target.files
              if (files) addFiles(Array.from(files))
              if (inputRef.current) inputRef.current.value = ""
            }}
          />
        </Box>

        {items.length > 0 ? (
          <Stack gap="xs" mah={320} style={{ overflowY: "auto" }}>
            {items.map((it) => (
              <FileRow key={it.id} item={it} />
            ))}
          </Stack>
        ) : null}

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {items.length === 0
              ? "Drop ROMs to get started"
              : `${items.length} file${items.length === 1 ? "" : "s"} · ${formatSize(
                  items.reduce((s, it) => s + it.total, 0),
                )}`}
          </Text>
          <Group gap="sm">
            <Button variant="subtle" onClick={onClose}>
              {allDone ? "Close" : "Hide"}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}

const FileRow = ({ item }: { item: Item }) => {
  const pct = item.total > 0 ? Math.min(100, Math.round((item.loaded / item.total) * 100)) : 0
  return (
    <Group gap="md" wrap="nowrap" align="center">
      <ThemeIcon
        size={36}
        radius="md"
        variant="light"
        color={
          item.status === "done"
            ? "teal"
            : item.status === "error"
              ? "red"
              : item.status === "uploading"
                ? "violet"
                : "gray"
        }
      >
        {item.status === "done" ? (
          <IconCheck size={16} />
        ) : item.status === "error" ? (
          <IconX size={16} />
        ) : (
          <IconFile size={16} />
        )}
      </ThemeIcon>
      <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
        <Group justify="space-between" gap="sm">
          <Text size="sm" lineClamp={1} title={item.file.name}>
            {item.file.name}
          </Text>
          <Text size="xs" c="dimmed">
            {item.status === "uploading"
              ? `${pct}%`
              : item.status === "done"
                ? "Added"
                : item.status === "error"
                  ? item.message
                  : "Queued"}
          </Text>
        </Group>
        <Progress
          value={item.status === "done" ? 100 : pct}
          size="xs"
          radius="xl"
          color={item.status === "error" ? "red" : item.status === "done" ? "teal" : "violet"}
          animated={item.status === "uploading"}
        />
      </Stack>
    </Group>
  )
}
