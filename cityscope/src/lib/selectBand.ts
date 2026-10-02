/**
 * The isochrone band to show: the one the user picked, if it still exists,
 * otherwise the outermost (the last; bands arrive sorted ascending by
 * contour), which is the travel time the user actually asked about.
 * Undefined only for an empty list.
 */
export function selectBand<B extends { contour: number }>(
  bands: ReadonlyArray<B>,
  pickedContour: number | null,
): B | undefined {
  return bands.find((b) => b.contour === pickedContour) ?? bands[bands.length - 1];
}
