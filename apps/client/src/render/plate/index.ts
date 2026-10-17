// The map plate (docs/ART.md §16): Spire's ground as one picture rendered ahead of time, with the painted ground
// (render/art/ground.ts) as the fallback until it has decoded.

export { loadPlate, mapPlate, onPlate, type Plate } from './load';
export { padLook, patchOf, plateFits, plateUrl, SPIRE_PLATE, type PlateLayout } from './layout';
