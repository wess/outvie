import { ActionIcon, Badge, Box, Group, Menu, Stack, Text } from "@mantine/core"
import { notifications } from "@mantine/notifications"
import type { Game } from "@outvie/core"
import { systemMeta } from "@outvie/core"
import { IconDots, IconPlayerPlayFilled, IconTrash } from "@tabler/icons-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "react-router-dom"
import { deleteGame } from "../api/index.ts"
import { systemColor } from "../theme/system.ts"

type Props = { game: Game }

const formatSize = (n: number): string => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export const Card = ({ game }: Props) => {
  const nav = useNavigate()
  const qc = useQueryClient()
  const meta = systemMeta[game.system]

  const remove = useMutation({
    mutationFn: () => deleteGame(game.id),
    onSuccess: () => {
      notifications.show({ message: `Removed ${game.title}`, color: "gray" })
      qc.invalidateQueries({ queryKey: ["games"] })
    },
    onError: (err) => notifications.show({ color: "red", message: String(err) }),
  })

  return (
    <Box className="outvie-card" data-system={game.system}>
      <Box component={Link} to={`/play/${game.id}`} style={{ display: "block" }} aria-label={`play ${game.title}`}>
        <Box className="outvie-art" data-system={game.system}>
          <span className="outvie-art-mark">{meta.shortName}</span>
        </Box>
      </Box>
      <Stack gap={6} p="md">
        <Group justify="space-between" wrap="nowrap" align="start">
          <Text fw={600} lh={1.2} lineClamp={2} title={game.title} style={{ minWidth: 0 }}>
            {game.title}
          </Text>
          <Menu shadow="md" position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label="game actions">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPlayerPlayFilled size={14} />} onClick={() => nav(`/play/${game.id}`)}>
                Play
              </Menu.Item>
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                Remove
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
        <Group justify="space-between" gap="xs">
          <Badge size="xs" radius="sm" variant="light" color={systemColor(game.system)}>
            {meta.shortName}
          </Badge>
          <Text size="xs" c="dimmed">
            {formatSize(game.size)}
          </Text>
        </Group>
      </Stack>
    </Box>
  )
}
