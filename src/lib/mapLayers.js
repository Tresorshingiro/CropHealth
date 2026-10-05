// What the map can show. Every service here is public: the browser loads it
// directly, with no token.

const ESRI_TILES = 'https://services.arcgisonline.com/ArcGIS/rest/services'

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
    reference: () => [`${ESRI_TILES}/Reference/World_Boundaries_and_Places/MapServer`],
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
    reference: (theme) => [`${ESRI_TILES}/Canvas/World_${theme === 'dark' ? 'Dark' : 'Light'}_Gray_Reference/MapServer`],
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
    scale: { colors: NDVI_COLORS, low: 'Bare or sparse', high: 'Dense green' },
  },
  {
    id: 'ndmi',
    label: 'NDMI',
    hint: 'Moisture',
    functionName: 'NDMI Colorized',
    scale: { colors: NDMI_COLORS, low: 'Dry', high: 'Moist' },
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

// Outline colours, as [r, g, b] for the map and as CSS for the legend. Amber,
// cyan and white each stay visible over the photo and over both index maps.
export const OUTLINES = {
  analysed: { rgb: [251, 191, 36], css: 'rgb(251 191 36)' },
  selected: { rgb: [0, 229, 255], css: 'rgb(0 229 255)' },
  land: { rgb: [255, 255, 255], css: 'rgb(255 255 255 / 0.7)' },
}
