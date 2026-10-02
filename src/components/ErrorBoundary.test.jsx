import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary.jsx'

function Broken() {
  throw new Error('WebGL is not available')
}

describe('ErrorBoundary', () => {
  it('shows its fallback when a child fails, and keeps the rest of the page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <p>still here</p>
        <ErrorBoundary fallback={<p role="alert">The map could not be shown.</p>}>
          <Broken />
        </ErrorBoundary>
      </div>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('The map could not be shown.')
    expect(screen.getByText('still here')).toBeInTheDocument()
  })

  it('renders its children when nothing fails', () => {
    render(
      <ErrorBoundary fallback={<p>fallback</p>}>
        <p>fine</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
    expect(screen.queryByText('fallback')).toBeNull()
  })
})
