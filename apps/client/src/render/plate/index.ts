// The map plate (docs/ART.md §16): Spire's ground as one picture rendered ahead of time, with the painted ground
// (render/art/ground.ts) as the fallback until it has decoded.

export { fetchPlateLights, freePlate, loadPlate, mapPlate, onPlate, plateFor, type Plate } from './load';
export { lightFiles, padLook, patchOf, plateCos, plateFits, plateUrl, SPIRE_PLATE, type PlateLayout } from './layout';
