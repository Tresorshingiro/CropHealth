import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { presetRange } from '../lib/range.js'
import RangeBar from './RangeBar.jsx'

const NOW = Date.UTC(2026, 9, 6, 9)
const END_OF_TODAY = Date.UTC(2026, 9, 7) - 1
const from = () => screen.getByLabelText('From')
const to = () => screen.getByLabelText('To')

describe('RangeBar', () => {
  it('starts on All, with empty date fields and no Reset', () => {
    render(<RangeBar range={null} onChange={() => {}} now={NOW} />)
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(from()).toHaveValue('')
    expect(to()).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
  })

  it('picks a preset', async () => {
    const onChange = vi.fn()
    render(<RangeBar range={null} onChange={onChange} now={NOW} />)
    await userEvent.click(screen.getByRole('button', { name: '3 months' }))
    expect(onChange).toHaveBeenCalledWith(presetRange('3m', NOW))
  })

  it('marks the matching preset, fills the date fields and resets', async () => {
    const onChange = vi.fn()
    render(<RangeBar range={presetRange('3m', NOW)} onChange={onChange} now={NOW} />)
    expect(screen.getByRole('button', { name: '3 months' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
    expect(from()).toHaveValue('2026-07-06')
    expect(to()).toHaveValue('2026-10-06')
    expect(to()).toHaveAttribute('max', '2026-10-06')
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('sets exact dates, and marks no preset for them', () => {
    const onChange = vi.fn()
    const range = presetRange('3m', NOW)
    const { rerender } = render(<RangeBar range={range} onChange={onChange} now={NOW} />)
    fireEvent.change(from(), { target: { value: '2026-03-01' } })
    expect(onChange).toHaveBeenLastCalledWith({ from: Date.UTC(2026, 2, 1), to: range.to })
    fireEvent.change(to(), { target: { value: '2026-09-30' } })
    expect(onChange).toHaveBeenLastCalledWith({ from: range.from, to: Date.UTC(2026, 9, 1) - 1 })

    rerender(<RangeBar range={{ from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 4, 1) - 1 }} onChange={onChange} now={NOW} />)
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })

  it('fills the other end when starting from All, and swaps a reversed pair', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RangeBar range={null} onChange={onChange} now={NOW} />)
    fireEvent.change(from(), { target: { value: '2026-03-01' } })
    expect(onChange).toHaveBeenLastCalledWith({ from: Date.UTC(2026, 2, 1), to: END_OF_TODAY })
    fireEvent.change(to(), { target: { value: '2026-04-30' } })
    expect(onChange).toHaveBeenLastCalledWith({ from: Date.UTC(2025, 3, 30), to: Date.UTC(2026, 4, 1) - 1 })

    rerender(<RangeBar range={{ from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 4, 1) - 1 }} onChange={onChange} now={NOW} />)
    fireEvent.change(from(), { target: { value: '2026-06-01' } })
    expect(onChange).toHaveBeenLastCalledWith({ from: Date.UTC(2026, 3, 30), to: Date.UTC(2026, 5, 2) - 1 })
  })

  it('goes back to all dates when a field is cleared', () => {
    const onChange = vi.fn()
    render(<RangeBar range={presetRange('3m', NOW)} onChange={onChange} now={NOW} />)
    fireEvent.change(to(), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
