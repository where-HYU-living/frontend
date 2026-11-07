import { useEffect, useRef, useState } from 'react';
import type { InteriorInput } from './input';

const R = 42; // 손잡이가 움직이는 반경(px)

/** 터치 기기에서만 보이는 왼쪽 아래 가상 조이스틱. 위로 밀면 앞으로 */
export function Joystick({ input }: { input: InteriorInput }) {
  const [touch] = useState(() => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0));
  const knob = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  useEffect(() => () => { input.joy.x = 0; input.joy.y = 0; }, [input]);
  if (!touch) return null;

  const set = (dx: number, dy: number) => {
    const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    const x = dx * k, y = dy * k;
    if (knob.current) knob.current.style.transform = `translate(${x}px, ${y}px)`;
    const dead = 0.15;
    const jx = x / R, jy = -y / R;
    input.joy.x = Math.abs(jx) < dead ? 0 : jx;
    input.joy.y = Math.abs(jy) < dead ? 0 : jy;
  };
  const rel = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)] as const; };
  const end = () => { id.current = null; set(0, 0); };
  return (
    <div className="ui-in-joy" role="group" aria-label="이동 조이스틱"
      onPointerDown={(e) => { if (id.current != null) return; id.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); set(...rel(e)); }}
      onPointerMove={(e) => { if (e.pointerId === id.current) set(...rel(e)); }}
      onPointerUp={(e) => { if (e.pointerId === id.current) end(); }} onPointerCancel={end}>
      <div ref={knob} className="ui-in-joy-knob" />
    </div>
  );
}
