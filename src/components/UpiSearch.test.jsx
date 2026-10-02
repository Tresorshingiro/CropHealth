import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UpiSearch from './UpiSearch.jsx'

const MESSAGE = 'Enter a UPI in the form 5/05/10/02/1939'

function renderSearch(props) {
  const onSubmit = vi.fn()
  render(<UpiSearch defaultValue="" history={[]} busy={false} onSubmit={onSubmit} {...props} />)
  return onSubmit
}

describe('UpiSearch', () => {
  it('submits a cleaned UPI when Run is pressed', async () => {
    const onSubmit = renderSearch()
    await userEvent.type(screen.getByLabelText('UPI'), '  5/05/10/02/1939 ')
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onSubmit).toHaveBeenCalledWith('5/05/10/02/1939')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('submits on Enter', async () => {
    const onSubmit = renderSearch()
    await userEvent.type(screen.getByLabelText('UPI'), '5/05/10/02/1939{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('5/05/10/02/1939')
  })

  it('shows the format message and sends nothing for a malformed UPI', async () => {
    const onSubmit = renderSearch()
    await userEvent.type(screen.getByLabelText('UPI'), '5-05-10-02-1939')
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the format message at once for a malformed UPI from a link', () => {
    renderSearch({ defaultValue: 'abc' })
    expect(screen.getByLabelText('UPI')).toHaveValue('abc')
    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
  })

  it('disables Run while a parcel is loading', () => {
    renderSearch({ busy: true })
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  })

  it('lists history and opens a parcel from it', async () => {
    const onSubmit = renderSearch({ history: ['5/05/10/02/2206', '5/02/06/06/1702'] })
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: '5/02/06/06/1702' }))
    expect(onSubmit).toHaveBeenCalledWith('5/02/06/06/1702')
  })

  it('says when there is no history', async () => {
    renderSearch()
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getByText('No parcels opened yet.')).toBeInTheDocument()
  })
})
