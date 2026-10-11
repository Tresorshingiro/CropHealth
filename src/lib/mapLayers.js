// What the map can show. Every service here is public: the browser loads it
// directly, with no token.
import RWANDA from './rwanda.json'

const ESRI_TILES = 'https://services.arcgisonline.com/ArcGIS/rest/services'

// Rwanda's border, from Esri's World Countries layer (Living Atlas), kept with
// the app. The reference layers (every country's borders and place names) are
// left out, so Rwanda's is the only border drawn.
export const RWANDA_RINGS = RWANDA.rings

const ringBounds = (ring) => ({
  xmin: Math.min(...ring.map(([x]) => x)),
  ymin: Math.min(...ring.map(([, y]) => y)),
  xmax: Math.max(...ring.map(([x]) => x)),
  ymax: Math.max(...ring.map(([, y]) => y)),
})
const bounds = ringBounds(RWANDA_RINGS[0])
const MARGIN = 0.06 // degrees, about 6 km, so the border is not on the map's edge

export const RWANDA_EXTENT = {
  xmin: bounds.xmin - MARGIN,
  ymin: bounds.ymin - MARGIN,
  xmax: bounds.xmax + MARGIN,
  ymax: bounds.ymax + MARGIN,
  spatialReference: { wkid: 4326 },
}

/**
 * Base maps as tiled services. `plain` follows the app theme. Esri's raster
 * tiles are used rather than the vector basemap styles, which need an API key.
 */
export const BASEMAPS = [
  {
    id: 'satellite',
    label: 'Satellite',
    hint: 'Sharpest picture, but it can be years old',
    base: () => [`${ESRI_TILES}/World_Imagery/MapServer`],
    reference: () => [],
  },
  {
    id: 'streets',
    label: 'Streets',
    hint: 'Roads, places and names',
    base: () => [`${ESRI_TILES}/World_Street_Map/MapServer`],
    reference: () => [],
  },
  {
    id: 'plain',
    label: 'Plain',
    hint: 'A quiet background for the imagery and outlines',
    base: (theme) => [`${ESRI_TILES}/Canvas/World_${theme === 'dark' ? 'Dark' : 'Light'}_Gray_Base/MapServer`],
    reference: () => [],
  },
]

export const SENTINEL_URL = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer'

// The service's colour maps, read from its legend every 0.05 from -1 to 1.
// Its NDVI and NDMI functions colour the value 100 + 100 × index, checked
// against "NDVI Raw" at sample points.
const NDVI_COLORS = [
  '#bee8ff', '#bee8ff', '#bee8ff', '#bee8ff', '#946b1f', '#9e7426', '#a67d2d', '#b08633', '#b88f3d', '#bf9849',
  '#c7a054', '#cca75e', '#d4b06a', '#dbba76', '#e0c182', '#e8ca8e', '#ebd09b', '#edd5a4', '#f2ddb3', '#dcdee0',
  '#dcdee0', '#ba7654', '#ba7654', '#ba7654', '#cda915', '#fdfe03', '#e5ee00', '#d0df00', '#b9cf00', '#a2c000',
  '#8bb000', '#739f00', '#468c6f', '#268062', '#146652', '#004d46', '#00332d', '#00332d', '#00332d', '#00332d',
  '#00332d',
]
const NDMI_COLORS = [
  '#784d22', '#794d22', '#7b4e22', '#7c5023', '#7e5123', '#805224', '#815324', '#835425', '#855526', '#865626',
  '#885727', '#8a5827', '#8b5928', '#8d5a28', '#8f5c29', '#905d29', '#98622c', '#b67636', '#d5a12d', '#f8ef07',
  '#2ce3fc', '#22c6fd', '#19aaff', '#098ad6', '#006cc0', '#0050c8', '#004ac4', '#0044c0', '#003ebc', '#0038b8',
  '#0032b4', '#002db0', '#0028ac', '#0023a8', '#001ea4', '#0019a0', '#00149c', '#000f98', '#000a94', '#000590',
  '#00008c',
]

// Our own ramp for NDRE: the service has it only as raw values. Brown to green
// over -0.2 to 0.6, where nearly all crop readings fall.
const NDRE_COLORS = ['#8c510a', '#d8b365', '#f6e8c3', '#c7e9c0', '#74c476', '#238b45', '#00441b']

const NDVI_SCALE = { colors: NDVI_COLORS, min: -1, max: 1, low: 'Bare or sparse', high: 'Dense green' }
const NDMI_SCALE = { colors: NDMI_COLORS, min: -1, max: 1, low: 'Dry', high: 'Moist' }

/** Sentinel-2 renderings drawn over the base map (raster function names as the service publishes them). */
export const SENTINEL_LAYERS = [
  { id: 'none', label: 'None', functionName: null },
  {
    id: 'natural',
    label: 'Natural colour',
    hint: 'Recent Sentinel-2 picture, 10 m pixels',
    functionName: 'Natural Color with DRA',
  },
  {
    id: 'ndvi',
    label: 'NDVI',
    hint: 'Green cover',
    functionName: 'NDVI Colormap',
    scale: NDVI_SCALE,
  },
  {
    id: 'ndmi',
    label: 'NDMI',
    hint: 'Moisture',
    functionName: 'NDMI Colorized',
    scale: NDMI_SCALE,
  },
]

/**
 * The index pixels drawn inside the selected plot. NDVI and NDMI
 * come coloured by the service; NDRE ("NDVI - with VRE Raw", (B8 - B5) / (B8 + B5))
 * comes as raw values in `lerc` and is coloured in the browser.
 */
export const PLOT_INDICES = [
  { id: 'ndvi', label: 'NDVI', functionName: 'NDVI Colormap', format: 'jpgpng', scale: NDVI_SCALE },
  { id: 'ndmi', label: 'NDMI', functionName: 'NDMI Colorized', format: 'jpgpng', scale: NDMI_SCALE },
  {
    id: 'ndre',
    label: 'NDRE',
    functionName: 'NDVI - with VRE Raw',
    format: 'lerc',
    scale: { colors: NDRE_COLORS, min: -0.2, max: 0.6, low: 'Little chlorophyll', high: 'Much chlorophyll' },
  },
]

/** A CSS gradient through a colour map, evenly spaced from -1 to 1. */
export const scaleGradient = (colors) =>
  `linear-gradient(to right, ${colors.map((c, i) => `${c} ${((i / (colors.length - 1)) * 100).toFixed(1)}%`).join(', ')})`

// The National Land Authority's public parcel layers (LAIS), one per district;
// Kigali's three districts share one service, with parcels in layer 1. The same
// list the GIS team's analysis tool uses.
const LAIS_BASE = 'https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services'
const LAIS_SERVICES = [
  ['Kigali_Parcels', 1],
  ['Nyanza_Parcels', 0], ['Gisagara_Parcels', 0], ['Nyaruguru_Parcels', 0], ['Huye_Parcels', 0],
  ['Nyamagabe_Parcels', 0], ['Ruhango_Parcels', 0], ['Muhanga_Parcels', 0], ['Kamonyi_Parcels', 0],
  ['Karongi_Parcels_0142026', 0], ['Rutsiro_Parcels', 0], ['Rubavu_Parcels', 0], ['Nyabihu_Parcels', 0],
  ['Ngororero_Parcels', 0], ['Rusizi_Parcels', 0], ['Nyamasheke_Parcels', 0],
  ['Rulindo_Parcels', 0], ['Gakenke_Parcels', 0], ['Musanze_Parcels', 0], ['Burera_Parcels', 0], ['Gicumbi_Parcels', 0],
  ['Rwamagana_Parcels', 0], ['Nyagatare_Parcels', 0], ['Gatsibo_Parcels', 0], ['Kayonza_Parcels', 0],
  ['Kirehe_Parcels', 0], ['Ngoma_Parcels', 0], ['Bugesera_Parcels', 0],
]
export const LAIS_LAYER_URLS = LAIS_SERVICES.map(([service, layer]) => `${LAIS_BASE}/${service}/FeatureServer/${layer}`)

/** Land parcels are drawn only from this scale in, where single fields can be told apart. */
export const LAIS_MIN_SCALE = 20000

// Rwanda's 30 districts (Admin Boundaries 2022), a public GeoHub layer the
// browser loads directly, as the GIS team's notebook does.
export const DISTRICTS_URL = 'https://gh.space.gov.rw/server/rest/services/Admin_Boundaries/FeatureServer/1'
/** District names are written between these scales: not over the whole country, not over single fields. */
export const DISTRICT_LABEL_SCALES = { min: 1500000, max: 40000 }

// Outline colours, as [r, g, b] (and alpha) for the map and as CSS for the
// legend. Cyan stays visible over the photo and both index maps; land parcels
// are a faint white so they sit behind the fields; districts a dashed, softer
// white, under the solid country border and told from the parcels by the dash.
export const OUTLINES = {
  selected: { rgb: [0, 229, 255], css: 'rgb(0 229 255)' },
  land: { rgb: [255, 255, 255], alpha: 0.35, css: 'rgb(255 255 255 / 0.35)' },
  district: { rgb: [255, 255, 255], alpha: 0.6, css: 'rgb(255 255 255 / 0.6)' },
}

// Analysed parcels coloured by crop health, on the map and in the overview.
// Bright enough to read over imagery and over both themes; the verdict word
// always goes with the colour.
export const HEALTH_COLORS = {
  good: { rgb: [16, 185, 129], css: 'rgb(16 185 129)', label: 'Good' },
  moderate: { rgb: [245, 158, 11], css: 'rgb(245 158 11)', label: 'Moderate' },
  poor: { rgb: [239, 68, 68], css: 'rgb(239 68 68)', label: 'Poor' },
  unrated: { rgb: [148, 163, 184], css: 'rgb(148 163 184)', label: 'Not rated' },
}
export const HEALTH_ORDER = ['good', 'moderate', 'poor', 'unrated']
