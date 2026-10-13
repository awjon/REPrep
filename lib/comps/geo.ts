// Distance helpers. Pure. The SQL in query.ts uses the same formula and bounding box.

export const EARTH_RADIUS_MILES = 3958.8;
export const MILES_PER_DEGREE_LAT = 69.0;

const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Box that contains the whole circle of `miles` around the point (a cheap index-friendly prefilter). */
export function boundingBox(lat: number, lon: number, miles: number) {
  const dLat = miles / MILES_PER_DEGREE_LAT;
  const dLon = miles / (MILES_PER_DEGREE_LAT * Math.max(0.01, Math.cos(rad(lat))));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}
