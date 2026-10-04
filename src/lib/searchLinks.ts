export interface Engine { id: string; label: string; url: (q: string) => string }

export const ENGINES: Engine[] = [
  { id: 'google', label: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { id: 'yandex', label: 'Yandex', url: (q) => `https://yandex.com/search/?text=${encodeURIComponent(q)}` },
  { id: 'bing', label: 'Bing', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
];

export function osmUrl(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`;
}
export function googleMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}
