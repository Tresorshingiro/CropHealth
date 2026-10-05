import { OUTLINES, SENTINEL_LAYERS, scaleGradient } from '../../lib/mapLayers.js'

function Outline({ color, width, label, note }) {
  return (
    <li className="flex items-start gap-2">
      {/* A dark, imagery-like swatch, so the white outline shows in the light theme too. */}
      <span
        aria-hidden="true"
        className="mt-px h-3 w-4 shrink-0 rounded-[3px] bg-[#3d4636]"
        style={{ boxShadow: `inset 0 0 0 ${width}px ${color}` }}
      />
      <span>
        <span className="block">{label}</span>
        {note && <span className="block text-ink-2">{note}</span>}
      </span>
    </li>
  )
}

function Scale({ layer }) {
  const { colors, low, high } = layer.scale
  return (
    <div>
      <p className="font-semibold">{layer.label}</p>
      <div
        role="img"
        aria-label={`${layer.label} colour scale from -1 to 1, ${low} to ${high}`}
        className="mt-1.5 h-2.5 rounded-full ring-1 ring-line"
        style={{ backgroundImage: scaleGradient(colors) }}
      />
      <div className="relative mt-1 h-4 text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span className="absolute left-0">-1</span>
        <span className="absolute left-1/2 -translate-x-1/2">0</span>
        <span className="absolute right-0">1</span>
      </div>
      <div className="flex justify-between gap-3 text-ink-2">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  )
}

/** What the colours and outlines on the map mean. Opens from a button, so it can stay out of the way. */
export default function MapLegend({ open, onToggle, settings, hasSelected }) {
  const layer = SENTINEL_LAYERS.find((item) => item.id === settings.sentinel)

  return (
    <div className="glass pointer-events-auto w-56 max-w-full overflow-hidden rounded-2xl text-xs shadow-float">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="map-legend"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 font-medium text-ink-2 hover:text-ink"
      >
        Legend
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? '' : 'rotate-180'}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div id="map-legend" className="space-y-3 border-t border-line px-3 pb-3 pt-2.5">
          {layer?.scale && <Scale layer={layer} />}
          {layer?.functionName && !layer.scale && (
            <div>
              <p className="font-semibold">{layer.label}</p>
              <p className="text-ink-2">{layer.hint}</p>
            </div>
          )}
          <ul className="space-y-1.5">
            {hasSelected && <Outline color={OUTLINES.selected.css} width={2.5} label="Selected" />}
            {settings.analysed && <Outline color={OUTLINES.analysed.css} width={1.5} label="Analysed parcel" />}
            {settings.land && (
              <Outline color={OUTLINES.land.css} width={1} label="Land parcel (NLA)" note="shown when zoomed in" />
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
