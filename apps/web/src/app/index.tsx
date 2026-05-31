import { Button, Center, Loader, Stack, Text, Title } from "@mantine/core"
import { useEffect, useState } from "react"
import { Route, Routes } from "react-router-dom"
import { type AuthUser, adoptToken, getUser, ssoLogin } from "../api/auth.ts"
import { Library } from "../library/index.tsx"
import { Play } from "../play/index.tsx"
import { Shell } from "./shell.tsx"

type Phase = "adopting" | "ready" | "anonymous"

const initialPhase = (): Phase => {
  if (typeof window === "undefined") return "anonymous"
  if (window.location.hash.startsWith("#token=")) return "adopting"
  return getUser() ? "ready" : "anonymous"
}

export const App = () => {
  const [user, setUser] = useState<AuthUser | null>(getUser())
  const [phase, setPhase] = useState<Phase>(initialPhase)

  useEffect(() => {
    if (phase !== "adopting") return
    const hash = window.location.hash
    if (!hash.startsWith("#token=")) {
      setPhase(user ? "ready" : "anonymous")
      return
    }
    const t = decodeURIComponent(hash.slice("#token=".length))
    history.replaceState(null, "", window.location.pathname + window.location.search)
    adoptToken(t)
      .then((u) => {
        if (u) {
          setUser(u)
          setPhase("ready")
        } else {
          setPhase("anonymous")
        }
      })
      .catch(() => setPhase("anonymous"))
  }, [phase, user])

  if (phase === "adopting") {
    return (
      <Center mih="100dvh">
        <Stack align="center" gap="xs">
          <Loader />
          <Text size="sm" c="dimmed">
            Signing you in…
          </Text>
        </Stack>
      </Center>
    )
  }

  if (phase === "anonymous") return <SignedOut />

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/play/:id" element={<Play />} />
      </Routes>
    </Shell>
  )
}

// First-screen gate when no JWT is in localStorage. Hands the browser
// to the SSO start endpoint, which 302s to castle; castle auto-approves
// (you're already signed in on vegeta.local) and redirects back to
// /auth/sso/callback?code=… → /#token=<jwt>.
const SignedOut = () => (
  <Center mih="100dvh" p="md">
    <Stack align="center" gap="lg" maw={420} ta="center">
      <Title order={2} fw={700} style={{ letterSpacing: "-0.02em" }}>
        Outvie
      </Title>
      <Text c="dimmed" size="sm">
        Sign in with your Castle account to access your library.
      </Text>
      <Button
        size="md"
        variant="gradient"
        gradient={{ from: "violet", to: "grape", deg: 130 }}
        radius="md"
        onClick={() => ssoLogin()}
        fullWidth
      >
        Sign in with Castle
      </Button>
    </Stack>
  </Center>
)
