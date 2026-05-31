import { ActionIcon, AppShell, Box, Group, Text, Title, Tooltip } from "@mantine/core"
import { IconCloudUpload, IconDeviceGamepad2, IconLogout } from "@tabler/icons-react"
import type { ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { getUser, signOut } from "../api/auth.ts"

type Props = { children: ReactNode }

export const Shell = ({ children }: Props) => {
  const location = useLocation()
  const inGame = location.pathname.startsWith("/play/")
  const user = getUser()

  return (
    <AppShell header={{ height: inGame ? 56 : 64 }} padding={inGame ? 0 : { base: "sm", sm: "lg" }}>
      <AppShell.Header
        withBorder={false}
        style={{
          background: "rgba(11, 12, 16, 0.75)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          paddingTop: "env(safe-area-inset-top)",
          height: "calc(var(--app-shell-header-height, 64px) + env(safe-area-inset-top))",
        }}
      >
        <Group h={inGame ? 56 : 64} px={{ base: "md", sm: "lg" }} justify="space-between" wrap="nowrap">
          <Link to="/" style={{ textDecoration: "none", color: "inherit", minWidth: 0, flex: "1 1 auto" }}>
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <Box
                w={36}
                h={36}
                style={{
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #5e60ce, #d62828)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <IconDeviceGamepad2 size={20} color="#fff" />
              </Box>
              <div style={{ minWidth: 0 }}>
                <Title order={4} fw={700} lh={1} style={{ letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
                  Outvie
                </Title>
                <Text size="xs" c="dimmed" lh={1.4} truncate>
                  {user ? user.name : "NES · SNES · Genesis"}
                </Text>
              </div>
            </Group>
          </Link>
          <Group gap={4} wrap="nowrap">
            <Tooltip label="Upload ROMs" withArrow>
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
            {user && (
              <Tooltip label="Sign out" withArrow>
                <ActionIcon
                  size="lg"
                  variant="subtle"
                  color="gray"
                  onClick={() => {
                    signOut()
                    window.location.assign("/")
                  }}
                  aria-label="sign out"
                >
                  <IconLogout size={18} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main
        style={
          inGame
            ? {
                padding: 0,
                height: "calc(100dvh - 56px - env(safe-area-inset-top))",
              }
            : { paddingBottom: "calc(var(--mantine-spacing-lg) + env(safe-area-inset-bottom))" }
        }
      >
        {children}
      </AppShell.Main>
    </AppShell>
  )
}
