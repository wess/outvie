import {
  ActionIcon,
  Box,
  Button,
  Center,
  Container,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core"
import type { Game, System } from "@outvie/core"
import { IconCloudUpload, IconPlus, IconSearch, IconX } from "@tabler/icons-react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { listGames } from "../api/index.ts"
import { Empty } from "./empty.tsx"
import { Grid } from "./grid.tsx"
import { UploadModal } from "./upload.tsx"

type Filter = "all" | System

// Match `query` against `title` as a case-insensitive substring. Splits
// the query on whitespace so "super mario" matches "Super Mario Bros 3"
// and also "Mario, Super Bros" — both terms must appear, order-free.
const matchesTitle = (title: string, query: string): boolean => {
  if (!query) return true
  const haystack = title.toLowerCase()
  for (const part of query.toLowerCase().split(/\s+/)) {
    if (part && !haystack.includes(part)) return false
  }
  return true
}

export const Library = () => {
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [params, setParams] = useSearchParams()

  const games = useQuery({
    queryKey: ["games", filter],
    queryFn: () => listGames(filter === "all" ? undefined : filter),
  })

  const filtered: Game[] = useMemo(() => {
    const data = games.data ?? []
    if (!search.trim()) return data
    return data.filter((g) => matchesTitle(g.title, search.trim()))
  }, [games.data, search])

  useEffect(() => {
    if (params.get("upload") === "1") {
      setUploadOpen(true)
      params.delete("upload")
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  return (
    <Container size="xl" py={{ base: "sm", sm: "md" }} px={{ base: "sm", sm: "md" }}>
      <Stack gap="md" mb={{ base: "md", sm: "xl" }}>
        <Stack gap={4}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: "0.14em" }}>
            Your Library
          </Text>
          <Title order={1} style={{ fontSize: "clamp(26px, 6vw, 36px)", letterSpacing: "-0.025em" }}>
            Pick a game
          </Title>
        </Stack>
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="Search the library…"
          size="md"
          radius="md"
          leftSection={<IconSearch size={16} />}
          rightSection={
            search ? (
              <ActionIcon variant="subtle" color="gray" onClick={() => setSearch("")} aria-label="clear search">
                <IconX size={14} />
              </ActionIcon>
            ) : null
          }
          aria-label="search games"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <Group gap="sm" wrap="wrap" justify={{ base: "flex-start", sm: "flex-end" } as never} style={{ rowGap: 8 }}>
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            data={[
              { label: "All", value: "all" },
              { label: "NES", value: "nes" },
              { label: "SNES", value: "snes" },
              { label: "Genesis", value: "genesis" },
            ]}
            size="sm"
            color="violet"
            style={{ flex: "1 1 auto", minWidth: 0 }}
            fullWidth
          />
          <Button
            leftSection={<IconPlus size={16} />}
            variant="gradient"
            gradient={{ from: "violet", to: "grape", deg: 130 }}
            onClick={() => setUploadOpen(true)}
            radius="md"
            visibleFrom="xs"
          >
            Add games
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            variant="gradient"
            gradient={{ from: "violet", to: "grape", deg: 130 }}
            onClick={() => setUploadOpen(true)}
            radius="md"
            size="sm"
            hiddenFrom="xs"
            fullWidth
          >
            Add games
          </Button>
        </Group>
      </Stack>

      <Box mih={300}>
        {games.isLoading ? (
          <Center mih={300}>
            <Loader />
          </Center>
        ) : games.isError ? (
          <Center mih={300}>
            <Stack align="center" gap="sm">
              <Text c="red.4">Couldn’t reach the server.</Text>
              <Text size="sm" c="dimmed">
                Is the API up on the configured port?
              </Text>
            </Stack>
          </Center>
        ) : !games.data || games.data.length === 0 ? (
          <Empty
            onUpload={() => setUploadOpen(true)}
            label={
              filter === "all"
                ? "Your library is empty"
                : `No ${filter === "nes" ? "NES" : filter === "snes" ? "SNES" : "Genesis"} games yet`
            }
          />
        ) : filtered.length === 0 ? (
          <Center mih={300}>
            <Stack align="center" gap="xs">
              <Text c="dimmed">No games match “{search}”.</Text>
              <Button variant="subtle" size="xs" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </Stack>
          </Center>
        ) : (
          <>
            {search && (
              <Text size="xs" c="dimmed" mb="xs">
                {filtered.length} of {games.data.length} games
              </Text>
            )}
            <Grid games={filtered} />
          </>
        )}
      </Box>

      <Box pt="xl" pb="lg">
        <Group justify="center" gap="xs">
          <IconCloudUpload size={14} color="rgba(255,255,255,0.4)" />
          <Text size="xs" c="dimmed">
            Streaming sessions are coming soon. Game data stays on your server.
          </Text>
        </Group>
      </Box>

      <UploadModal opened={uploadOpen} onClose={() => setUploadOpen(false)} />
    </Container>
  )
}
