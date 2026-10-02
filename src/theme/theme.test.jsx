import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './ThemeContext.jsx'
import ThemeToggle from './ThemeToggle.jsx'

function systemPrefersDark(matches) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
}

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

const isDark = () => document.documentElement.classList.contains('dark')

describe('theme', () => {
  it('follows the system setting when nothing is stored', () => {
    systemPrefersDark(true)
    renderToggle()
    expect(isDark()).toBe(true)
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument()
  })

  it('starts light when the system prefers light', () => {
    systemPrefersDark(false)
    renderToggle()
    expect(isDark()).toBe(false)
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('switches and remembers the choice', async () => {
    systemPrefersDark(false)
    renderToggle()
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(isDark()).toBe(true)
    expect(window.localStorage.getItem('crophealth-theme')).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(isDark()).toBe(false)
    expect(window.localStorage.getItem('crophealth-theme')).toBe('light')
  })

  it('lets a stored choice win over the system setting', () => {
    window.localStorage.setItem('crophealth-theme', 'light')
    systemPrefersDark(true)
    renderToggle()
    expect(isDark()).toBe(false)
  })

  it('ignores a stored value that is not a theme', () => {
    window.localStorage.setItem('crophealth-theme', 'purple')
    systemPrefersDark(true)
    renderToggle()
    expect(isDark()).toBe(true)
  })

  it('still works when browser storage is blocked', async () => {
    systemPrefersDark(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    renderToggle()
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(isDark()).toBe(true)
  })
})
