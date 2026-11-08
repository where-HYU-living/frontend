import { WorldCanvas } from '../world/WorldCanvas';
import { GfxNotice } from './GfxSettings';

/** 3D 층: 화면 전체를 3D 캔버스가 채운다. 미니맵·조이스틱·출처 표기는 3D 코드가 id로 찾아 쓴다 */
export function WorldLayer() {
  return (
    <>
      <div id="world"><WorldCanvas /></div>
      <canvas id="minimap" width={220} height={174} title="미니맵을 누르면 그 위치로 이동해요" />
      <div id="joystick"><div id="joystick-knob" /></div>
      <div id="attrib" />
      <GfxNotice />
    </>
  );
}
