import { ActionIcon, AppShell, Box, Group, Text, Title, Tooltip } from "@mantine/core"
import { IconCloudUpload, IconDeviceGamepad2 } from "@tabler/icons-react"
import type { ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"

type Props = { children: ReactNode }

export const Shell = ({ children }: Props) => {
  const location = useLocation()
  const inGame = location.pathname.startsWith("/play/")

  return (
    <AppShell header={{ height: inGame ? 56 : 72 }} padding={inGame ? 0 : "lg"}>
      <AppShell.Header
        withBorder={false}
        style={{
          background: "rgba(11, 12, 16, 0.7)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Group h="100%" px="lg" justify="space-between" wrap="nowrap">
          <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
            <Group gap="sm" wrap="nowrap">
              <Box
                w={36}
                h={36}
                style={{
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #5e60ce, #d62828)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <IconDeviceGamepad2 size={20} color="#fff" />
              </Box>
              <div>
                <Title order={4} fw={700} lh={1} style={{ letterSpacing: "-0.02em" }}>
                  Outvie
                </Title>
                <Text size="xs" c="dimmed" lh={1.4}>
                  NES &middot; SNES
                </Text>
              </div>
            </Group>
          </Link>
          <Group gap="xs">
            <Tooltip label="Upload coming via library page" withArrow>
              <ActionIcon
                size="lg"
                variant="subtle"
                color="gray"
                component={Link}
                to="/?upload=1"
                aria-label="upload roms"
              >
                <IconCloudUpload size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main style={inGame ? { padding: 0, height: "calc(100dvh - 56px)" } : {}}>{children}</AppShell.Main>
    </AppShell>
  )
}
