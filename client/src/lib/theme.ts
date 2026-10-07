import { create } from 'zustand'
import { applyPalette } from './visual'

export type Theme = 'dark' | 'light'

const KEY = 'ivz.theme'

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f7fb' : '#0b0b10')
  applyPalette(theme)
}

const first = initial()
apply(first)

export const useTheme = create<{ theme: Theme; toggle: () => void }>((set, get) => ({
  theme: first,
  toggle: () => {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    apply(theme)
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
    set({ theme })
  },
}))
