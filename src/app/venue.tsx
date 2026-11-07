import type { ReactNode } from 'react';
import { DoorOpen } from 'lucide-react';

export type Fact = { label: string; value: string };

/** 실내 투어로 들어가는 버튼. 도면이 없으면 눌러지는 척하지 않고 이유를 보여 준다 */
export function IndoorButton({ floorplanId, onEnter }: { floorplanId: number | null; onEnter: () => void }) {
  if (floorplanId == null) return <p className="ui-v-noplan">실내 도면 준비 중</p>;
  return <button type="button" className="ui-v-enter" onClick={onEnter}><DoorOpen size={17} aria-hidden="true" />실내 보기</button>;
}

/**
 * 주택형·호실 한 칸. 위에서 아래로: 이름과 규모 → 큰 가격 → 세부 항목(칸으로 나눔) → 행동.
 * 단지 목록 카드(ui-v-place)와는 일부러 구조가 다르다: 거긴 상태(모집 중·D-day)가 먼저고, 여기는 가격이 먼저다.
 */
export function UnitCard({ name, chip, priceLabel, price, facts, floorplanId, onEnter }: {
  name: string; chip: string; priceLabel: string; price: string; facts: Fact[]; floorplanId: number | null; onEnter: () => void;
}) {
  return (
    <li className="ui-v-unit">
      <div className="ui-v-unit-head"><h4>{name}</h4><span className="ui-v-pill">{chip}</span></div>
      <p className="ui-v-price"><span>{priceLabel}</span><strong>{price}</strong></p>
      <dl className="ui-v-facts" style={{ '--cols': facts.length } as React.CSSProperties}>
        {facts.map((f) => (<div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>))}
      </dl>
      <IndoorButton floorplanId={floorplanId} onEnter={onEnter} />
    </li>
  );
}

export function SectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return <h4 className="ui-v-sec">{children}{count != null && <span className="ui-v-count">{count}</span>}</h4>;
}

export function InfoChip({ icon, muted, children }: { icon: ReactNode; muted?: boolean; children: ReactNode }) {
  return <li className={`ui-v-chip${muted ? ' is-muted' : ''}`}>{icon}{children}</li>;
}
