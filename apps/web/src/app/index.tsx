import { Route, Routes } from "react-router-dom"
import { Library } from "../library/index.tsx"
import { Play } from "../play/index.tsx"
import { Shell } from "./shell.tsx"

export const App = () => (
  <Shell>
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/play/:id" element={<Play />} />
    </Routes>
  </Shell>
)
