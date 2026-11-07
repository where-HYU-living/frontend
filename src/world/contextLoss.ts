import { useWorld } from '../app/state/world';

/** WebGL 컨텍스트가 끊기면 로딩 화면에 안내를 띄운다. */
export function handleContextLost(): void {
  useWorld.setState({ status: 'error', error: 'WebGL 컨텍스트가 끊겼어요. 새로고침해 주세요' });
}
