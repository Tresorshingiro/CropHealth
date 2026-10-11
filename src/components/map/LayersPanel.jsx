import { BASEMAPS, SENTINEL_LAYERS } from '../../lib/mapLayers.js'

function Choice({ name, option, checked, onPick }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-raised">
      <input
        type="radio"
        name={name}
        value={option.id}
        checked={checked}
        onChange={() => onPick(option.id)}
        className="mt-0.5 accent-[rgb(var(--accent))]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{option.label}</span>
        {option.hint && <span className="block text-xs leading-snug text-ink-2">{option.hint}</span>}
      </span>
    </label>
  )
}

function Group({ title, children }) {
  return (
    <div role="radiogroup" aria-label={title}>
      <p className="px-2 pb-1 text-xs font-semibold text-ink-2">{title}</p>
      {children}
    </div>
  )
}

function Toggle({ label, hint, checked, onToggle }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-raised">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onToggle(event.target.checked)}
        className="mt-0.5 accent-[rgb(var(--accent))]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {hint && <span className="block text-xs leading-snug text-ink-2">{hint}</span>}
      </span>
    </label>
  )
}

/**
 * What the map shows: the base map, one Sentinel-2 layer over it and its
 * opacity, and which outlines are drawn. `onChange` gets only what changed.
 */
export default function LayersPanel({ settings, onChange }) {
  const percent = Math.round(settings.opacity * 100)
  const imagery = settings.sentinel !== 'none'

  return (
    <div className="space-y-3">
      <Group title="Base map">
        {BASEMAPS.map((option) => (
          <Choice
            key={option.id}
            name="basemap"
            option={option}
            checked={settings.basemap === option.id}
            onPick={(basemap) => onChange({ basemap })}
          />
        ))}
      </Group>

      <Group title="Sentinel-2 layer">
        {SENTINEL_LAYERS.map((option) => (
          <Choice
            key={option.id}
            name="sentinel"
            option={option}
            checked={settings.sentinel === option.id}
            onPick={(sentinel) => onChange({ sentinel })}
          />
        ))}
        <div className={`px-2 pt-1 ${imagery ? '' : 'opacity-50'}`}>
          <div className="flex items-center justify-between text-xs text-ink-2">
            <label htmlFor="sentinel-opacity">Opacity</label>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{`${percent}%`}</span>
          </div>
          <input
            id="sentinel-opacity"
            type="range"
            min="20"
            max="100"
            step="10"
            value={percent}
            disabled={!imagery}
            onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })}
            className="w-full accent-[rgb(var(--accent))]"
          />
        </div>
      </Group>

      <div>
        <p className="px-2 pb-1 text-xs font-semibold text-ink-2">Outlines</p>
        <Toggle label="Areas of interest" checked={settings.analysed} onToggle={(analysed) => onChange({ analysed })} />
        <Toggle
          label="Land parcels (NLA)"
          hint="Every registered parcel, shown when zoomed in"
          checked={settings.land}
          onToggle={(land) => onChange({ land })}
        />
        <Toggle
          label="District boundaries"
          hint="Rwanda's 30 districts, named as you zoom in"
          checked={settings.districts}
          onToggle={(districts) => onChange({ districts })}
        />
      </div>
    </div>
  )
}
