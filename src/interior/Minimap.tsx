import { useEffect, useMemo, useRef } from 'react';
import type { FloorPlan } from '../api/types';
import type { InteriorInput } from './input';
import { minimapLayout } from './minimapLayout';
import type { Pin } from './pins';

/** 상단 바의 작은 평면도: 방 면, 벽 선, 후기 핀 점, 내 위치(시선 쪽을 가리키는 삼각형) */
export function Minimap({ plan, input, pins, size = 76 }: { plan: FloorPlan; input: InteriorInput; pins: Pin[]; size?: number }) {
  const m = useMemo(() => minimapLayout(plan, size), [plan, size]);
  const me = useRef<SVGGElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const [x, y] = m.toMap(input.pose.x, input.pose.z);
      // 시선(-sin yaw, -cos yaw) 을 지도 각도로: 지도 x = 장면 x, 지도 y = 장면 z
      const deg = (Math.atan2(-Math.cos(input.pose.yaw), -Math.sin(input.pose.yaw)) * 180) / Math.PI;
      me.current?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(0)})`);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [m, input]);
  return (
    <svg className="ui-in-minimap" width={m.width} height={m.height} viewBox={`0 0 ${m.width} ${m.height}`} role="img" aria-label="평면도 미니맵">
      {plan.rooms.map((r, i) => (<polygon key={i} points={r.polygon.map(([x, y]) => m.toMap(x, y).join(',')).join(' ')} fill="rgba(255,255,255,0.55)" />))}
      {plan.walls.map((w, i) => { const a = m.toMap(...w.from), b = m.toMap(...w.to); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#33414f" strokeWidth={Math.max(1.5, w.thickness * m.scale)} strokeLinecap="round" />; })}
      {pins.map((p, i) => { const [x, y] = m.toMap(p[0], p[2]); return <circle key={i} cx={x} cy={y} r={2.2} fill="#ff8a1f" />; })}
      <g ref={me}><circle r={4} fill="#0e6fd1" stroke="#fff" strokeWidth={1.2} /><polygon points="4,-3.2 9,0 4,3.2" fill="#0e6fd1" /></g>
    </svg>
  );
}
