import { useEffect, useRef } from 'react';
import { initWorld } from '../main';
import { useWorld } from './state/world';
import { WorldCanvas } from '../world/WorldCanvas';

/** 3D 층: 화면 전체를 3D 캔버스가 채운다. 미니맵·조이스틱·출처 표기는 3D 코드가 id로 찾아 쓴다 */
function ClassicWorld() {
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !ref.current) return;
    started.current = true;
    let api: Awaited<ReturnType<typeof initWorld>> | null = null;
    initWorld(ref.current, { onProgress: (p) => useWorld.setState({ progress: p }) })
      .then((a) => {
        api = a;
        useWorld.setState({ status: 'ready', api: a, progress: 1 });
      })
      .catch((e: unknown) => {
        console.error(e);
        useWorld.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      });
    return () => api?.dispose();
  }, []);

  return <div id="world" ref={ref} />;
}

/** 3D 층: 화면 전체를 3D 캔버스가 채운다. 미니맵·조이스틱·출처 표기는 3D 코드가 id로 찾아 쓴다 */
export function WorldLayer() {
  // 기본은 R3F 경로. ?classic=1 이면 기존 initWorld 경로 (육안 확인이 끝나면 삭제 예정)
  const r3f = new URLSearchParams(location.search).get('classic') !== '1';
  return (
    <>
      {r3f ? <div id="world"><WorldCanvas /></div> : <ClassicWorld />}
      <canvas id="minimap" width={220} height={174} title="미니맵을 누르면 그 위치로 이동해요" />
      <div id="joystick"><div id="joystick-knob" /></div>
      <div id="attrib" />
    </>
  );
}
