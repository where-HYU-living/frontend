// 3D 좌표(m, 원점 = 사자상, x = 동, z = 남) ↔ 위경도. 원점은 public/world.json 의 origin 과 같다.
export const ORIGIN = { lat: 37.5561486, lng: 127.044341 };
const M_PER_DEG_LAT = 110540;
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

export function toLatLng(x: number, z: number): [lat: number, lng: number] {
  return [ORIGIN.lat - z / M_PER_DEG_LAT, ORIGIN.lng + x / mPerDegLng(ORIGIN.lat)];
}

export function toLocal(lat: number, lng: number): [x: number, z: number] {
  return [(lng - ORIGIN.lng) * mPerDegLng(ORIGIN.lat), -(lat - ORIGIN.lat) * M_PER_DEG_LAT];
}
