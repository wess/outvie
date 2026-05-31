import { SimpleGrid } from "@mantine/core"
import type { Game } from "@outvie/core"
import { Card } from "./card.tsx"

type Props = { games: Game[] }

export const Grid = ({ games }: Props) => (
  <SimpleGrid cols={{ base: 2, xs: 2, sm: 3, md: 4, lg: 5, xl: 6 }} spacing={{ base: "sm", sm: "lg" }}>
    {games.map((g) => (
      <Card key={g.id} game={g} />
    ))}
  </SimpleGrid>
)
