import { Alert, Button, Center, Divider, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core"
import { useQuery } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { type AuthUser, needsSetup, passwordLogin, setupOwner, ssoLogin } from "../api/auth.ts"

type Props = {
  onAuthed: (user: AuthUser) => void
}

// Anonymous landing. Offers the local owner-account path (password login, or
// first-run owner creation when the users table is empty) so a fresh install
// works without an external IdP, plus the optional SSO sign-in button.
export const Login = ({ onAuthed }: Props) => {
  const { data: setup } = useQuery({ queryKey: ["needsSetup"], queryFn: needsSetup })
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const user = setup ? await setupOwner(login, password) : await passwordLogin(login, password)
      onAuthed(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Center mih="100dvh">
      <Stack align="center" gap="md" w={320}>
        <Title order={1}>outvie</Title>
        <Text c="dimmed">Your self-hosted retro library</Text>
        <form onSubmit={submit} style={{ width: "100%" }}>
          <Stack gap="sm">
            {setup && <Text size="sm">Create the owner account to finish setup.</Text>}
            <TextInput
              label={setup ? "Owner email" : "Email or username"}
              value={login}
              onChange={(e) => setLogin(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <Button type="submit" loading={busy}>
              {setup ? "Create owner account" : "Sign in"}
            </Button>
          </Stack>
        </form>
        <Divider label="or" labelPosition="center" w="100%" />
        <Button variant="default" onClick={() => ssoLogin()} w="100%">
          Sign in with SSO
        </Button>
      </Stack>
    </Center>
  )
}
