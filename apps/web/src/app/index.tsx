import { Center, Loader, Stack, Text } from "@mantine/core"
import { lazy, Suspense, useEffect, useState } from "react"
import { Route, Routes } from "react-router-dom"
import { type AuthUser, adoptToken, getUser } from "../api/auth.ts"
import { Library } from "../library/index.tsx"
import { Login } from "./login.tsx"
import { Shell } from "./shell.tsx"

// The player pulls in the WASM libretro emulator (nostalgist) and its
// decompression deps. Loading it on demand keeps the library/home route's
// bundle small for users who never open a game.
const Play = lazy(() => import("../play/index.tsx").then((m) => ({ default: m.Play })))

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

  if (phase === "anonymous") {
    return (
      <Login
        onAuthed={(u) => {
          setUser(u)
          setPhase("ready")
        }}
      />
    )
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route
          path="/play/:id"
          element={
            <Suspense
              fallback={
                <Center h="100%">
                  <Loader />
                </Center>
              }
            >
              <Play />
            </Suspense>
          }
        />
      </Routes>
    </Shell>
  )
}
