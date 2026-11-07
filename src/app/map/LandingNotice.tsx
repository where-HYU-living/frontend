import { useEffect } from 'react';
import { useUi } from '../state/ui';
import { useMapFocus } from './mapFocus';

/** 지도에서 3D 로 넘어간 직후 한 번 보여 줄 안내 (서비스 밖이라 가까운 곳으로 왔어요 등). 지도 본체(KakaoMap)와 따로 둬서 지도 청크 없이도 뜬다 */
export function LandingNotice() {
  const notice = useMapFocus((s) => s.notice);
  const mapMode = useUi((s) => s.mapMode);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => useMapFocus.setState({ notice: null }), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice || mapMode !== '3d') return null;
  return <p className="ui-land-note glass" role="status">{notice}</p>;
}
