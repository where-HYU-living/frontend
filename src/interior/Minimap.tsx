import { useEffect, useMemo, useRef } from 'react';
import type { FloorPlan } from '../api/types';
import type { InteriorInput } from './input';
import { minimapLayout } from './minimapLayout';
import type { Pin } from './pins';
import { roomAt, roomKind } from './structure';

/** 방 종류별 면 색 (연하게) */
const FILL: Record<string, string> = { bathroom: '#cfe4f2', entrance: '#efe3c8', utility: '#dcdcd8', balcony: '#dcdcd8', other: '#d3d3cf', storage: '#dcdcd8', kitchen: '#f6ecd2' };

/**
 * 작은 평면도. 방 면·벽·후기 핀·내 위치(시선 쪽을 가리키는 삼각형).
 * 방을 누르면 onPick(x, z) — 그 자리로 이동 요청 (방 밖을 누르면 무시).
 */
export function Minimap({ plan, input, pins, size = 132, onPick }: { plan: FloorPlan; input: InteriorInput; pins: Pin[]; size?: number; onPick?: (x: number, z: number) => void }) {
  const m = useMemo(() => minimapLayout(plan, size, 8), [plan, size]);
  const me = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);
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

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !onPick || r.width === 0) return;
    const [x, z] = m.fromMap(((e.clientX - r.left) * m.width) / r.width, ((e.clientY - r.top) * m.height) / r.height);
    if (roomAt(plan, x, z) >= 0) onPick(x, z);
  };

  return (
    <svg ref={svg} className={`ui-in-minimap${onPick ? ' is-clickable' : ''}`} width={m.width} height={m.height} viewBox={`0 0 ${m.width} ${m.height}`} role="img" aria-label="평면도 미니맵. 방을 누르면 그 방으로 이동해요" onPointerUp={pick}>
      {plan.rooms.map((r, i) => (<polygon key={i} points={r.polygon.map(([x, y]) => m.toMap(x, y).join(',')).join(' ')} fill={FILL[roomKind(r)] ?? '#ffffff'} />))}
      {plan.walls.map((w, i) => { const a = m.toMap(...w.from), b = m.toMap(...w.to); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#33414f" strokeWidth={Math.max(1.4, w.thickness * m.scale)} strokeLinecap="round" />; })}
      {pins.map((p, i) => { const [x, y] = m.toMap(p[0], p[2]); return <circle key={i} cx={x} cy={y} r={2.4} fill="#ff8a1f" stroke="#fff" strokeWidth={0.8} />; })}
      <g ref={me}><circle r={4.2} fill="#0e6fd1" stroke="#fff" strokeWidth={1.3} /><polygon points="4.2,-3.4 9.5,0 4.2,3.4" fill="#0e6fd1" /></g>
    </svg>
  );
}
