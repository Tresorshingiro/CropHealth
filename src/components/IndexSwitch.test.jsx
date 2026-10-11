import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import IndexSwitch from './IndexSwitch.jsx'

describe('IndexSwitch', () => {
  it('marks the chosen index and switches', async () => {
    const onChange = vi.fn()
    render(<IndexSwitch value="ndmi" onChange={onChange} label="Index in the plot" />)
    expect(screen.getByRole('group', { name: 'Index in the plot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'NDMI' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'NDVI' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'NDRE' }))
    expect(onChange).toHaveBeenCalledWith('ndre')
  })
})
