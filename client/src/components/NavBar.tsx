import { AnimatePresence, motion } from 'framer-motion'
import { Code2, Menu, Moon, Sun, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTheme } from '../lib/theme'

const links = [
  { to: '/', label: 'Idea', end: true },
  { to: '/command', label: 'Command map' },
  { to: '/compare', label: 'Compare' },
  { to: '/runs', label: 'Runs' },
]

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="18" fill="none" stroke="var(--signal)" strokeWidth="4" />
      <circle cx="32" cy="32" r="7" fill="var(--signal)" />
      <path d="M32 6v8M32 50v8M6 32h8M50 32h8" stroke="var(--safe)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      onClick={toggle}
      className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel-2 text-mute transition hover:border-line-strong hover:text-ink"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: 90, opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${isActive ? 'bg-signal/12 text-signal font-medium' : 'text-mute hover:text-ink'}`

export function NavBar() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-3 px-4">
        <NavLink to="/" className="flex shrink-0 items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">
            IrisVanguard<span className="text-signal">.Z</span>
          </span>
        </NavLink>
        <nav className="ml-3 hidden items-center gap-1 md:flex">
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>{l.label}</NavLink>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://github.com/ankit1morecode/IrisVanguard.Z"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-mute hover:text-ink lg:flex"
          >
            <Code2 size={16} /> Source
          </a>
          <ThemeToggle />
          <button
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel-2 text-mute hover:text-ink md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-line md:hidden"
          >
            <div className="flex flex-col gap-1 p-3">
              {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>{l.label}</NavLink>)}
              <a href="https://github.com/ankit1morecode/IrisVanguard.Z" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-mute">
                <Code2 size={15} /> Source
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
