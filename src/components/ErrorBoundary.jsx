import { Component } from 'react'

/** Shows `fallback` in place of children that fail to render, so one broken part cannot blank the page. */
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
