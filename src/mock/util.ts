import { ORIGIN, toLatLng } from '../app/map/geo';

export { ORIGIN, toLatLng };

/** 두 위경도 사이 직선거리(m) */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 직선거리 → 도보 분 (돌아가는 길 1.25배, 분당 80m) */
export function walkMinutesFor(distance: number): number {
  return Math.max(1, Math.round((distance * 1.25) / 80));
}

export const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

/** 3D 미터 오프셋(원점=사자상, x 동, z 남) → {lat,lng} */
export function at(x: number, z: number): { lat: number; lng: number } {
  const [lat, lng] = toLatLng(x, z);
  return { lat: round7(lat), lng: round7(lng) };
}

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ym = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** 오늘 기준 n일 뒤 날짜(YYYY-MM-DD) */
export function dayOffset(n: number, base: Date = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
  return ymd(d);
}

/** 오늘 기준 n개월 뒤 'YYYY-MM' */
export function monthOffset(n: number, base: Date = new Date()): string {
  return ym(new Date(base.getFullYear(), base.getMonth() + n, 1));
}

/** 'YYYY-MM' 두 개 사이 개월 수 (같은 달이면 0) */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export const nowIso = () => {
  const d = new Date();
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+09:00`;
};

export function placeholderImage(label: string, color = '#7c8aa5'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="${color}"/><text x="320" y="220" font-family="sans-serif" font-size="30" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
