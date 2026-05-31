import { Box, Button, Stack, Text } from "@mantine/core"
import { IconUpload } from "@tabler/icons-react"

type Props = { label: string; onUpload: () => void }

export const Empty = ({ label, onUpload }: Props) => (
  <Box
    style={{
      border: "1px dashed rgba(255,255,255,0.1)",
      borderRadius: 18,
      padding: "56px 24px",
    }}
  >
    <Stack align="center" gap="md">
      <Box
        w={56}
        h={56}
        style={{
          borderRadius: 14,
          background: "rgba(149,117,255,0.12)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <IconUpload size={26} color="#b39ff4" />
      </Box>
      <Stack gap={4} align="center">
        <Text fw={600}>{label}</Text>
        <Text size="sm" c="dimmed" maw={420} ta="center">
          Drop .nes, .sfc or .smc files to add them to your library. Files stream straight to the server — no size
          limits, no timeouts.
        </Text>
      </Stack>
      <Button
        leftSection={<IconUpload size={16} />}
        onClick={onUpload}
        variant="gradient"
        gradient={{ from: "violet", to: "grape", deg: 130 }}
      >
        Add games
      </Button>
    </Stack>
  </Box>
)
