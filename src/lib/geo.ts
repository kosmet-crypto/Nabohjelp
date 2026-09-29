import type { GeoPoint } from './types';

export const OSLO_CENTER: GeoPoint = { lat: 59.9139, lng: 10.7522 };

/** Rough bounding box of mainland Norway incl. Svalbard excluded. */
export const NORWAY_BOUNDS = { minLat: 57.9, maxLat: 71.3, minLng: 4.5, maxLng: 31.2 } as const;
export const OSLO_BOUNDS = { minLat: 59.80, maxLat: 60.14, minLng: 10.48, maxLng: 10.95 } as const;

type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };
const inBounds = (p: GeoPoint, b: Bounds) =>
  p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;

export const isInNorway = (p: GeoPoint) => inBounds(p, NORWAY_BOUNDS);
export const isInOslo = (p: GeoPoint) => inBounds(p, OSLO_BOUNDS);

/** EWKT accepted by PostgREST for geography columns. Note: lng first. */
export const toEwkt = ({ lat, lng }: GeoPoint) => `SRID=4326;POINT(${lng} ${lat})`;

/** Parse GeoJSON point returned by PostgREST for geography columns. */
export function fromGeoJson(value: unknown): GeoPoint | null {
  if (value && typeof value === 'object' && 'coordinates' in value) {
    const c = (value as { coordinates: unknown }).coordinates;
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      return { lng: c[0], lat: c[1] };
    }
  }
  return null;
}

/** Great-circle distance in metres. */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Snap to a ~1 km grid (same as public_profiles view) before exposing a location. */
export const fuzzLocation = ({ lat, lng }: GeoPoint, grid = 0.01): GeoPoint => ({
  lat: Math.round(lat / grid) * grid,
  lng: Math.round(lng / grid) * grid,
});

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
