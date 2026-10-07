import { Route, Routes } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { useTheme } from './lib/theme'
import { CommandMap } from './pages/CommandMap'
import { Compare } from './pages/Compare'
import { Landing } from './pages/Landing'
import { Runs } from './pages/Runs'

export default function App() {
  // Subscribing here re-renders the tree (SVG glyphs read the live palette) when the theme flips.
  const theme = useTheme((s) => s.theme)
  return (
    <div className="min-h-full" data-app-theme={theme}>
      <NavBar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/command" element={<CommandMap />} />
        <Route path="/command/:runId" element={<CommandMap />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/compare/:groupId" element={<Compare />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="*" element={<div className="p-10 text-mute">Page not found.</div>} />
      </Routes>
    </div>
  )
}
