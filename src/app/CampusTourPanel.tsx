import { useEffect, useMemo, useState } from 'react';
import { useWorld } from './state/world';
import { visiblePlaces } from './data/hiddenBuildings';
import { filterPlaces, groupPlaces, type Place } from './campusSearch';
import { useGoToCampus } from './goTo';
import './dossier/dossier.css';

const ALL = visiblePlaces;

/** 캠퍼스 투어: 건물 이름(또는 번호)으로 찾아서 누르면 3D에서 그 건물 앞으로 이동 */
export function CampusTourPanel() {
  const goToCampus = useGoToCampus();
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const areaId = useWorld((s) => s.areaId);
  useEffect(() => setMsg(''), [areaId]); // 캠퍼스에 도착하면 '이동하는 중' 안내를 지운다
  const groups = useMemo(() => groupPlaces(filterPlaces(ALL, q)), [q]);

  const go = (p: Place) => {
    if (!p.center) return;
    // 입구가 있으면 문 앞에 서서 문을 본다. 문 앞이 막혀 있으면(나무·벽) 건물이 보이는 빈자리로
    const e = p.entrance;
    const r = (e && goToCampus(e.stand[0], e.stand[1], e.door)) || goToCampus(p.center[0], p.center[1]);
    setMsg(r === 'switching' ? '캠퍼스로 이동하는 중…' : r ? '' : `${p.name} 앞으로는 갈 수 없어요`);
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
