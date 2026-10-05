import { Code2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Idea', end: true },
  { to: '/command', label: 'Command map' },
  { to: '/compare', label: 'Compare' },
  { to: '/runs', label: 'Runs' },
]

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="18" fill="none" stroke="#22d3ee" strokeWidth="4" />
      <circle cx="32" cy="32" r="7" fill="#22d3ee" />
      <path d="M32 6v8M32 50v8M6 32h8M50 32h8" stroke="#34d399" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function NavBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-4 px-4">
        <NavLink to="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">
            IrisVanguard<span className="text-cyan-400">.Z</span>
          </span>
        </NavLink>
        <nav className="ml-2 flex items-center gap-1 overflow-x-auto">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${isActive ? 'bg-white/10 text-white' : 'text-mute hover:text-white'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <a
          href="https://github.com/ankit1morecode/IrisVanguard.Z"
          target="_blank"
          rel="noreferrer"
          className="ml-auto hidden items-center gap-1.5 text-sm text-mute hover:text-white sm:flex"
        >
          <Code2 size={16} /> Source
        </a>
      </div>
    </header>
  )
}
