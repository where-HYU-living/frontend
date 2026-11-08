import { useEffect, useState } from 'react';
import { useBuildingNames, useDepartments, useProfile, useSaveProfile } from './features/catalog';
import { DepartmentPicker } from './DepartmentPicker';
import { BuildingPicker } from './BuildingPicker';
import { visiblePlaces } from './data/hiddenBuildings';
import { useSession } from './state/session';
import { useUi } from './state/ui';
import { UnitInput } from './forms/Field';
import { ChipSelect } from './forms/Segmented';
import { FormSection, StickyActions } from './forms/FormSection';
import './forms/forms.css';

const won = (man: string) => (man.trim() === '' || !Number.isFinite(Number(man)) || Number(man) < 0 ? null : Math.round(Number(man) * 10000));
const man = (w: number | null | undefined) => (w == null ? '' : String(w / 10000));

/** 로그인 직후 학과·예산을 받는다 (건너뛰기 가능). 내 계정 버튼으로 다시 열 수 있다 */
export function ProfileModal() {
  const token = useSession((s) => s.token);
  const open = useUi((s) => s.profileOpen);
  const profile = useProfile();
  const deps = useDepartments();
  const save = useSaveProfile();
  const buildingNames = useBuildingNames();
  const [buildingIds, setBuildingIds] = useState<number[]>([]);
  // 건물 후보: 앱 건물 목록(서버 이름이 있으면 그걸로)
  const options = visiblePlaces.map((p) => ({ id: p.id, name: buildingNames.get(p.id) ?? p.name }));
  const [dep, setDep] = useState('');
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');

  // 처음 로그인했는데 학과도 예산도 없으면 자동으로 연다
  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setDep(p.departmentId == null ? '' : String(p.departmentId));
    setBuildingIds(p.buildingIds ?? []);
    setRent(man(p.budget?.rentCap)); setDeposit(man(p.budget?.depositCap));
    if (p.departmentId == null && p.budget == null && !sessionStorage.getItem('chatatda.onboarded')) useUi.setState({ profileOpen: true });
  }, [profile.data]);

  if (!open || !token) return null;
  const close = () => { try { sessionStorage.setItem('chatatda.onboarded', '1'); } catch { /* 무시 */ } useUi.setState({ profileOpen: false }); };
  const submit = () => {
    const d = deps.data?.find((x) => String(x.id) === dep);
    const rentCap = won(rent), depositCap = won(deposit);
    save.mutate(
      { departmentId: d ? d.id : undefined, buildingIds, budget: rentCap == null && depositCap == null ? undefined : { rentCap, depositCap } },
      { onSuccess: close },
    );
  };

  return (
    <div className="ui-modal-back" onMouseDown={close}>
      <div className="ui-modal ui-modal-lg glass" role="dialog" aria-label="내 정보" onMouseDown={(e) => e.stopPropagation()}>
        <h2>내 정보</h2>
        <p className="ui-modal-sub">학과를 고르면 집마다 과 건물까지 걸어서 몇 분인지 보여 줘요. 예산을 넣으면 넘는 집을 표시해요. 둘 다 나중에 해도 돼요.</p>
        <FormSection title="학과">
        <DepartmentPicker departments={deps.data ?? []} value={dep === '' ? null : Number(dep)} onChange={(id) => { setDep(id == null ? '' : String(id)); const d = deps.data?.find((x) => x.id === id); if (d) setBuildingIds(d.defaultBuildingIds); }} />
        <BuildingPicker selected={buildingIds} options={options} onChange={setBuildingIds} />
        </FormSection>
        <FormSection title="예산" hint="이 금액을 넘는 집은 판결 카드에 '예산 초과'로 알려 줘요. 비워 둬도 돼요">
          <div className="ui-budget-row">
            <UnitInput label="월세는 최대" unit="만원" value={rent} onChange={setRent} ariaLabel="월세 상한(만원)" placeholder="제한 없음" />
            <ChipSelect label="월세 상한 빠른 선택" options={[40, 50, 60, 70]} suffix="만" value={rent} onPick={(v) => setRent(rent === v ? '' : v)} />
          </div>
          <div className="ui-budget-row">
            <UnitInput label="보증금은 최대" unit="만원" value={deposit} onChange={setDeposit} ariaLabel="보증금 상한(만원)" placeholder="제한 없음" />
            <ChipSelect label="보증금 상한 빠른 선택" options={[500, 1000, 2000, 3000]} suffix="만" value={deposit} onPick={(v) => setDeposit(deposit === v ? '' : v)} />
          </div>
        </FormSection>
        {save.isError && <p className="ui-field-error" role="alert">저장하지 못했어요. 잠시 뒤 다시 해 보세요.</p>}
        <StickyActions>
          <div className="ui-modal-actions">
            <button type="button" className="ghost" onClick={close}>나중에 할게요</button>
            <button type="button" className="primary" disabled={save.isPending} onClick={submit}>저장</button>
          </div>
        </StickyActions>
      </div>
    </div>
  );
}
