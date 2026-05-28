import { Box, Button, Center, Container, Group, Loader, SegmentedControl, Stack, Text, Title } from "@mantine/core"
import { useQuery } from "@tanstack/react-query"
import { IconCloudUpload, IconPlus } from "@tabler/icons-react"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import type { System } from "@outvie/core"
import { listGames } from "../api/index.ts"
import { Empty } from "./empty.tsx"
import { Grid } from "./grid.tsx"
import { UploadModal } from "./upload.tsx"

type Filter = "all" | System

export const Library = () => {
  const [filter, setFilter] = useState<Filter>("all")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [params, setParams] = useSearchParams()

  const games = useQuery({
    queryKey: ["games", filter],
    queryFn: () => listGames(filter === "all" ? undefined : filter),
  })

  useEffect(() => {
    if (params.get("upload") === "1") {
      setUploadOpen(true)
      params.delete("upload")
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  return (
    <Container size="xl" py="md">
      <Group justify="space-between" align="end" mb="xl">
        <Stack gap={4}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: "0.14em" }}>
            Your Library
          </Text>
          <Title order={1} style={{ fontSize: 36, letterSpacing: "-0.025em" }}>
            Pick a game
          </Title>
        </Stack>
        <Group gap="sm">
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
          />
          <Button
            leftSection={<IconPlus size={16} />}
            variant="gradient"
            gradient={{ from: "violet", to: "grape", deg: 130 }}
            onClick={() => setUploadOpen(true)}
            radius="md"
          >
            Add games
          </Button>
        </Group>
      </Group>

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
        ) : (
          <Grid games={games.data} />
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
