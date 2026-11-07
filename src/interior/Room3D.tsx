import { useEffect, useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import type { FloorPlan, Review } from '../api/types';
import type { buildInterior } from './buildInterior';
import type { Furniture } from './furnish';
import { polygonArea, polygonCenter } from './geom';
import type { Pin } from './pins';
import { buildTrim } from './trim';

type Built = ReturnType<typeof buildInterior>;

/** 나무 마루 느낌의 작은 캔버스 텍스처 (파일 없이 코드로 그린다). 1타일 = 1.2m */
function useWoodTexture() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    if (g) {
      const cols = ['#c8a77c', '#bf9d70', '#cfae85', '#b99668'];
      for (let i = 0; i < 4; i++) {
        g.fillStyle = cols[i]; g.fillRect(0, i * 64, 256, 64);
        g.fillStyle = 'rgba(70,45,20,0.35)'; g.fillRect(0, i * 64, 256, 2); // 판 사이 틈
        const joint = (i * 97) % 200 + 20;
        g.fillRect(joint, i * 64, 2, 64);
        g.strokeStyle = 'rgba(90,60,30,0.10)';
        for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(0, i * 64 + 10 + k * 11); g.lineTo(256, i * 64 + 14 + k * 11); g.stroke(); }
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / 1.2, 1 / 1.2);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function useLabelTexture(text: string) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 112;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = 'rgba(20,32,48,0.62)';
      g.beginPath(); g.roundRect(4, 4, 504, 104, 28); g.fill();
      g.fillStyle = '#fff'; g.font = '600 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 256, 58, 480);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function RoomLabel({ name, area, x, z, y }: { name: string; area: number; x: number; z: number; y: number }) {
  const tex = useLabelTexture(`${name} · ${area.toFixed(1)}㎡`);
  return (
    <sprite position={[x, y, z]} scale={[1.5, 0.33, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

const ratingColor = (n: number) => (n >= 4 ? '#2fa968' : n === 3 ? '#e0a82e' : '#d9453b');

export const PIN_KEY = 'reviewId';

type Props = {
  plan: FloorPlan;
  built: Built;
  furniture: Furniture[];
  showFurniture: boolean;
  pins: (Review & { pin: Pin })[];
  selectedPin: number | null;
  draft: Pin | null;
};

/** 벽·바닥·천장·문틀·창·가구·조명·방 이름·핀. pickRef 안의 메쉬만 길게 누르기로 핀을 찍을 수 있고, pinRef 안은 눌러서 후기를 본다 */
export function Room3D({ plan, built, furniture, showFurniture, pins, selectedPin, draft, pickRef, pinRef }: Props & { pickRef: RefObject<THREE.Group>; pinRef: RefObject<THREE.Group> }) {
  const H = plan.ceilingHeight;
  const trim = useMemo(() => buildTrim(plan), [plan]);
  const wood = useWoodTexture();
  const plaster = useLoader(THREE.TextureLoader, '/tex/plaster_diff.jpg');
  useMemo(() => { plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping; plaster.repeat.set(1.5, 1); plaster.colorSpace = THREE.SRGBColorSpace; }, [plaster]);

  const shapes = useMemo(() => built.floor.map((poly) => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y))));
    g.rotateX(Math.PI / 2); // 평면 (x,y) → (x,0,y)
    return g;
  }), [built]);
  useEffect(() => () => shapes.forEach((g) => g.dispose()), [shapes]);

  const rooms = useMemo(() => plan.rooms.map((r) => ({ name: r.name, area: polygonArea(r.polygon), c: polygonCenter(r.polygon) })), [plan]);
  const lamps = rooms.slice(0, 6); // 점광원은 6개까지만 (성능)

  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#fff6ea', '#a99b88', 0.55]} />
      <directionalLight position={[3, 6, 2]} intensity={0.55} />

      <group ref={pickRef}>
        {built.wallPieces.map((b, i) => (
          <mesh key={i} position={b.center} rotation={[0, b.rotationY, 0]}>
            <boxGeometry args={b.size} />
            <meshStandardMaterial map={plaster} color="#f4eee4" roughness={0.92} />
          </mesh>
        ))}
        {shapes.map((g, i) => (<mesh key={i} geometry={g} position={[0, 0.001, 0]}><meshStandardMaterial map={wood} roughness={0.6} side={THREE.DoubleSide} /></mesh>))}
      </group>

      {shapes.map((g, i) => (<mesh key={`c${i}`} geometry={g} position={[0, H, 0]}><meshStandardMaterial color="#f7f4ee" side={THREE.DoubleSide} /></mesh>))}

      {trim.baseboards.map((b, i) => (<mesh key={`b${i}`} position={b.center} rotation={[0, b.rotationY, 0]}><boxGeometry args={b.size} /><meshStandardMaterial color="#fbfaf7" roughness={0.6} /></mesh>))}
      {trim.frames.map((b, i) => (<mesh key={`f${i}`} position={b.center} rotation={[0, b.rotationY, 0]}><boxGeometry args={b.size} /><meshStandardMaterial color="#f2eee6" roughness={0.5} /></mesh>))}
      {trim.leaves.map((l, i) => (
        <group key={`l${i}`} position={l.pivot} rotation={[0, l.rotationY, 0]}>
          <mesh position={[l.size[0] / 2, l.size[1] / 2, 0]}><boxGeometry args={l.size} /><meshStandardMaterial color="#d9c3a2" roughness={0.55} /></mesh>
          <mesh position={[l.size[0] - 0.08, 1.0, 0.04]}><sphereGeometry args={[0.025, 10, 8]} /><meshStandardMaterial color="#b9b9b9" metalness={0.8} roughness={0.3} /></mesh>
        </group>
      ))}
      {trim.glass.map((b, i) => (
        <mesh key={`g${i}`} position={b.center} rotation={[0, b.rotationY, 0]}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color="#cfe6f5" transparent opacity={0.24} roughness={0.05} metalness={0.1} depthWrite={false} />
        </mesh>
      ))}

      {showFurniture && furniture.map((f, i) => (
        <group key={`m${i}`} position={f.position} rotation={[0, f.rotationY, 0]}>
          {f.parts.map((p, k) => (<mesh key={k} position={p.offset}><boxGeometry args={p.size} /><meshStandardMaterial color={p.color} roughness={0.8} /></mesh>))}
        </group>
      ))}

      {lamps.map((r, i) => (
        <group key={`lamp${i}`} position={[r.c[0], H, r.c[1]]}>
          <mesh position={[0, -0.02, 0]}><cylinderGeometry args={[0.2, 0.2, 0.04, 20]} /><meshStandardMaterial color="#fff6dc" emissive="#ffeab8" emissiveIntensity={1.4} /></mesh>
          <pointLight position={[0, -0.35, 0]} color="#ffe6bd" intensity={4} distance={7} decay={2} />
        </group>
      ))}

      {rooms.map((r, i) => (<RoomLabel key={`t${i}`} name={r.name} area={r.area} x={r.c[0]} z={r.c[1]} y={H - 0.4} />))}

      <group ref={pinRef}>
        {pins.map((r) => (
          <group key={r.id} position={r.pin} userData={{ [PIN_KEY]: r.id }}>
            <mesh userData={{ [PIN_KEY]: r.id }}><sphereGeometry args={[selectedPin === r.id ? 0.13 : 0.09, 16, 12]} /><meshStandardMaterial color={ratingColor(r.rating)} emissive={ratingColor(r.rating)} emissiveIntensity={selectedPin === r.id ? 1.1 : 0.5} /></mesh>
            <mesh userData={{ [PIN_KEY]: r.id }}><sphereGeometry args={[0.2, 8, 6]} /><meshBasicMaterial visible={false} /></mesh>
          </group>
        ))}
        {draft && (
          <mesh position={draft}><sphereGeometry args={[0.11, 16, 12]} /><meshStandardMaterial color="#ff8a1f" emissive="#ff8a1f" emissiveIntensity={1} /></mesh>
        )}
      </group>
    </>
  );
}
