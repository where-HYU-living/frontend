import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Bus, GraduationCap, Hand, Heart, PartyPopper, Store, TrainFront, WashingMachine, ChevronLeft } from 'lucide-react';
import type { Nearby } from '../api/types';

/** 3D 말풍선은 React 밖(DOM)이라 아이콘을 SVG 문자열로 만들어 넘긴다 */
export const svgOf = (el: ReactElement): string => renderToStaticMarkup(el);

export const NEARBY_ICON: Record<Nearby['category'], { label: string; svg: string }> = {
  CONVENIENCE: { label: '편의점', svg: svgOf(<Store size={14} />) },
  LAUNDRY: { label: '세탁방', svg: svgOf(<WashingMachine size={14} />) },
  BUS_STOP: { label: '버스정류장', svg: svgOf(<Bus size={14} />) },
  SUBWAY: { label: '지하철역', svg: svgOf(<TrainFront size={14} />) },
};

/** 이모트 (lucide 아이콘, 색으로 구분). 3D 말풍선에는 같은 아이콘을 SVG 문자열로 넣는다 */
export const EMOTE = {
  wave: { label: '손 흔들기', Icon: Hand, color: '#e0a100' },
  heart: { label: '하트', Icon: Heart, color: '#e5484d' },
  clap: { label: '박수', Icon: PartyPopper, color: '#d6409f' },
} as const;
export const EMOTE_SVG: Record<string, string> = Object.fromEntries(Object.entries(EMOTE).map(([k, v]) => [k, svgOf(<v.Icon size={16} color={v.color} strokeWidth={2.4} />)]));

export const HEART_SVG = svgOf(<Heart size={12} fill="currentColor" />);
export const CAMPUS_SVG = svgOf(<GraduationCap size={14} />);

export function BackButton({ onClick, children = '목록' }: { onClick: () => void; children?: string }) {
  return <button type="button" className="ui-back" onClick={onClick}><ChevronLeft size={14} aria-hidden="true" />{children}</button>;
}
