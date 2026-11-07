import campusPlaces from '../../app/data/campusPlaces.json';
import departmentsJson from '../../app/data/departments.json';
import type { CampusBuilding, Department } from '../../api/types';
import { at, round7, toLatLng } from '../util';

type Place = { id: number; name: string; group: string; center: [number, number] | null };

/** 입구 2곳 + 캠퍼스 건물/기숙사(앱에 들어 있는 campusPlaces.json 의 3D 좌표를 위경도로) */
export function makeBuildings(): CampusBuilding[] {
  const gates: CampusBuilding[] = [
    { id: 901, name: '한양대 정문', type: 'GATE', ...at(0, -40) },
    { id: 902, name: '한양대 후문', type: 'GATE', ...at(-60, -420) },
  ];
  const places = (campusPlaces as Place[])
    .filter((p) => p.center)
    .map((p): CampusBuilding => {
      const [lat, lng] = toLatLng(p.center![0], p.center![1]);
      return { id: p.id, name: p.name, type: p.group === 'dorm' ? 'DORM' : 'CAMPUS', lat: round7(lat), lng: round7(lng) };
    });
  return [...gates, ...places];
}

export const DEPARTMENTS: Department[] = departmentsJson as Department[];
