import { useMemo, useState } from 'react';
import places from './data/campusPlaces.json';
import { filterPlaces, groupPlaces, type Place } from './campusSearch';
import { useWorld } from './state/world';

const ALL = places as Place[];

/** 캠퍼스 투어: 건물 이름(또는 번호)으로 찾아서 누르면 3D에서 그 건물 앞으로 이동 */
export function CampusTourPanel() {
  const api = useWorld((s) => s.api);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const groups = useMemo(() => groupPlaces(filterPlaces(ALL, q)), [q]);

  const go = (p: Place) => {
    if (!p.center || !api) return;
    setMsg(api.goToPlace(p.center[0], p.center[1]) ? '' : `${p.name} 앞으로는 갈 수 없어요`);
  };

  return (
    <>
      <label className="ui-tour-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="건물 이름 (예: 공학관)" aria-label="캠퍼스 건물 검색" />
      </label>
      {msg && <p className="ui-tour-msg" role="status">{msg}</p>}
      {groups.length === 0 && <p className="empty">찾는 건물이 없어요</p>}
      {groups.map((g) => (
        <section key={g.group} className="ui-tour-group" aria-label={g.label}>
          <h3>{g.label}</h3>
          <ul>
            {g.items.map((p) => (
              <li key={p.no}>
                <button type="button" className="ui-tour-item" disabled={!p.center} onClick={() => go(p)}>
                  <span className="ui-tour-no">{p.no}</span>
                  <span className="ui-tour-name">{p.name}</span>
                  {!p.center && <span className="ui-tour-note">3D 위치 준비 중</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
