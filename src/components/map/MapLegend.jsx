import { formatScene } from '../../lib/format.js'
import { HEALTH_COLORS, HEALTH_ORDER, OUTLINES, PLOT_INDICES, SENTINEL_LAYERS, scaleGradient } from '../../lib/mapLayers.js'
import { SCENE_TEXT } from './PlotCard.jsx'

function Outline({ color, width, label, note, dashed = false }) {
  return (
    <li className="flex items-start gap-2">
      {/* A dark, imagery-like swatch, so the white outline shows in the light theme too. */}
      <span
        aria-hidden="true"
        className="mt-px h-3 w-4 shrink-0 rounded-[3px] bg-[#3d4636]"
        style={dashed ? { border: `${width}px dashed ${color}` } : { boxShadow: `inset 0 0 0 ${width}px ${color}` }}
      />
      <span>
        <span className="block">{label}</span>
        {note && <span className="block text-ink-2">{note}</span>}
      </span>
    </li>
  )
}

function Scale({ label, scale }) {
  const { colors, low, high, min = -1, max = 1 } = scale
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <div
        role="img"
        aria-label={`${label} colour scale from ${min} to ${max}, ${low} to ${high}`}
        className="mt-1.5 h-2.5 rounded-full ring-1 ring-line"
        style={{ backgroundImage: scaleGradient(colors) }}
      />
      <div className="relative mt-1 h-4 text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span className="absolute left-0">{String(min)}</span>
        {min < 0 && max > 0 && (
          <span className="absolute -translate-x-1/2" style={{ left: `${(-min / (max - min)) * 100}%` }}>
            0
          </span>
        )}
        <span className="absolute right-0">{String(max)}</span>
      </div>
      <div className="flex justify-between gap-3 text-ink-2">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  )
}

/** What the colours and outlines on the map mean. Opens from a button, so it can stay out of the way. */
export default function MapLegend({ open, onToggle, settings, hasSelected, plot = null }) {
  const layer = SENTINEL_LAYERS.find((item) => item.id === settings.sentinel)
  const plotLayer = plot ? PLOT_INDICES.find((item) => item.id === plot.index) : null
  const imageText = plot?.scene?.status === 'ready' ? formatScene(plot.scene.scene) : SCENE_TEXT[plot?.scene?.status] ?? ''

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
        <div id="map-legend" className="max-h-72 space-y-3 overflow-y-auto border-t border-line px-3 pb-3 pt-2.5">
          {plotLayer && (
            <div>
              <Scale label={`${plotLayer.label} in the plot`} scale={plotLayer.scale} />
              {imageText && <p className="mt-1 text-ink-2">{imageText}</p>}
            </div>
          )}
          {layer?.scale && <Scale label={layer.label} scale={layer.scale} />}
          {layer?.functionName && !layer.scale && (
            <div>
              <p className="font-semibold">{layer.label}</p>
              <p className="text-ink-2">{layer.hint}</p>
            </div>
          )}
          <ul className="space-y-1.5">
            {hasSelected && <Outline color={OUTLINES.selected.css} width={2.5} label="Selected" />}
            {settings.analysed && (
              <li>
                <span className="block">Areas of interest by health</span>
                <span className="block text-ink-2">dots when zoomed out</span>
                <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                  {HEALTH_ORDER.map((key) => (
                    <li key={key} className="flex items-center gap-1.5">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: HEALTH_COLORS[key].css }} />
                      {HEALTH_COLORS[key].label}
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {settings.districts && <Outline color={OUTLINES.district.css} width={1.5} dashed label="District boundary" />}
            {settings.land && (
              <Outline color={OUTLINES.land.css} width={1} label="Land parcel (NLA)" note="shown when zoomed in" />
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
