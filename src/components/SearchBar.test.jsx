import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SearchBar from './SearchBar.jsx'

const MESSAGE = 'Enter a UPI in the form 5/05/10/02/1939'

function renderBar(props) {
  const onSubmit = vi.fn()
  const onOpenParcels = vi.fn()
  const view = render(<SearchBar selected="" history={[]} onSubmit={onSubmit} onOpenParcels={onOpenParcels} {...props} />)
  return { onSubmit, onOpenParcels, ...view }
}

describe('SearchBar', () => {
  it('submits a cleaned UPI when Run is pressed', async () => {
    const { onSubmit } = renderBar()
    await userEvent.type(screen.getByLabelText('UPI'), '  5/05/10/02/1939 ')
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onSubmit).toHaveBeenCalledWith('5/05/10/02/1939')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('submits on Enter', async () => {
    const { onSubmit } = renderBar()
    await userEvent.type(screen.getByLabelText('UPI'), '5/05/10/02/1939{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('5/05/10/02/1939')
  })

  it('shows the format message and sends nothing for a malformed UPI', async () => {
    const { onSubmit } = renderBar()
    await userEvent.type(screen.getByLabelText('UPI'), '5-05-10-02-1939')
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the format message at once for a malformed UPI from a link', () => {
    renderBar({ selected: 'abc' })
    expect(screen.getByLabelText('UPI')).toHaveValue('abc')
    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
  })

  it('follows the selected parcel when it changes elsewhere', () => {
    const { rerender, onSubmit, onOpenParcels } = renderBar({ selected: '5/05/10/02/1939' })
    expect(screen.getByLabelText('UPI')).toHaveValue('5/05/10/02/1939')
    rerender(<SearchBar selected="5/02/06/06/1702" history={[]} onSubmit={onSubmit} onOpenParcels={onOpenParcels} />)
    expect(screen.getByLabelText('UPI')).toHaveValue('5/02/06/06/1702')
  })

  it('offers recent parcels when the field is focused, and opens one', async () => {
    const { onSubmit } = renderBar({ history: ['5/05/10/02/2206', '5/02/06/06/1702'] })
    expect(screen.queryByText('Recent parcels')).toBeNull()
    await userEvent.click(screen.getByLabelText('UPI'))
    expect(screen.getByText('Recent parcels')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: '5/02/06/06/1702' }))
    expect(onSubmit).toHaveBeenCalledWith('5/02/06/06/1702')
    expect(screen.queryByText('Recent parcels')).toBeNull()
  })

  it('closes the recent list on Escape and when focus leaves', async () => {
    renderBar({ history: ['5/05/10/02/2206'] })
    await userEvent.click(screen.getByLabelText('UPI'))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('Recent parcels')).toBeNull()
    await userEvent.click(screen.getByLabelText('UPI'))
    expect(screen.getByText('Recent parcels')).toBeInTheDocument()
    await userEvent.click(document.body)
    expect(screen.queryByText('Recent parcels')).toBeNull()
  })

  it('shows no recent list when there is no history', async () => {
    renderBar()
    await userEvent.click(screen.getByLabelText('UPI'))
    expect(screen.queryByText('Recent parcels')).toBeNull()
  })

  it('opens the parcels list', async () => {
    const { onOpenParcels } = renderBar()
    await userEvent.click(screen.getByRole('button', { name: 'Analysed parcels' }))
    expect(onOpenParcels).toHaveBeenCalledTimes(1)
  })
})
