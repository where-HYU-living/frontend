import { useEffect, useState } from 'react';
import { useDepartments, useProfile, useSaveProfile } from './features/catalog';
import { useSession } from './state/session';
import { useUi } from './state/ui';

const won = (man: string) => (man.trim() === '' || !Number.isFinite(Number(man)) || Number(man) < 0 ? null : Math.round(Number(man) * 10000));
const man = (w: number | null | undefined) => (w == null ? '' : String(w / 10000));

/** 로그인 직후 학과·예산을 받는다 (건너뛰기 가능). 내 계정 버튼으로 다시 열 수 있다 */
export function ProfileModal() {
  const token = useSession((s) => s.token);
  const open = useUi((s) => s.profileOpen);
  const profile = useProfile();
  const deps = useDepartments();
  const save = useSaveProfile();
  const [dep, setDep] = useState('');
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');

  // 처음 로그인했는데 학과도 예산도 없으면 자동으로 연다
  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setDep(p.departmentId == null ? '' : String(p.departmentId));
    setRent(man(p.budget?.rentCap)); setDeposit(man(p.budget?.depositCap));
    if (p.departmentId == null && p.budget == null && !sessionStorage.getItem('chatatda.onboarded')) useUi.setState({ profileOpen: true });
  }, [profile.data]);

  if (!open || !token) return null;
  const close = () => { try { sessionStorage.setItem('chatatda.onboarded', '1'); } catch { /* 무시 */ } useUi.setState({ profileOpen: false }); };
  const submit = () => {
    const d = deps.data?.find((x) => String(x.id) === dep);
    const rentCap = won(rent), depositCap = won(deposit);
    save.mutate(
      { departmentId: d ? d.id : undefined, buildingIds: d ? d.defaultBuildingIds : undefined, budget: rentCap == null && depositCap == null ? undefined : { rentCap, depositCap } },
      { onSuccess: close },
    );
  };

  return (
    <div className="ui-modal-back" onMouseDown={close}>
      <div className="ui-modal glass" role="dialog" aria-label="내 정보" onMouseDown={(e) => e.stopPropagation()}>
        <h2>내 정보</h2>
        <p className="ui-modal-sub">학과를 고르면 과 건물까지 도보 시간을 보여주고, 예산을 넣으면 초과 여부를 알려줘요. 건너뛰어도 돼요.</p>
        <select value={dep} onChange={(e) => setDep(e.target.value)} aria-label="학과">
          <option value="">학과 선택 안 함</option>
          {(deps.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.college} · {d.name}</option>)}
        </select>
        <label className="ui-modal-row">월세 상한 <input inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value)} aria-label="월세 상한(만원)" /> 만원</label>
        <label className="ui-modal-row">보증금 상한 <input inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} aria-label="보증금 상한(만원)" /> 만원</label>
        {save.isError && <p className="ui-modal-error" role="alert">저장하지 못했어요. 잠시 뒤 다시 해 보세요.</p>}
        <div className="ui-modal-actions">
          <button type="button" className="ghost" onClick={close}>건너뛰기</button>
          <button type="button" className="primary" disabled={save.isPending} onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  );
}
