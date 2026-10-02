// The chart library takes colours as values, not CSS variables, so the index
// colours and chart chrome live here, keyed by theme. Both sets pass the
// dataviz palette validator against their surface (all pairs, CVD included).
export const SERIES = [
  { key: 'ndvi', code: 'NDVI', hint: 'green cover' },
  { key: 'ndmi', code: 'NDMI', hint: 'water' },
  { key: 'ndre', code: 'NDRE', hint: 'chlorophyll' },
]

export const CHART_COLORS = {
  light: {
    ndvi: '#1baf7a',
    ndmi: '#2a78d6',
    ndre: '#eb6834',
    surface: '#fcfcfb',
    ink: '#0b0b0b',
    ink2: '#52514e',
    text: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
  },
  dark: {
    ndvi: '#199e70',
    ndmi: '#3987e5',
    ndre: '#d95926',
    surface: '#1a1a19',
    ink: '#ffffff',
    ink2: '#c3c2b7',
    text: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
  },
}
