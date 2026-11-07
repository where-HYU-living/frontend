import { useEffect, useState } from 'react';
import { Shirt } from 'lucide-react';
import { useWorld } from '../state/world';
import { useDepartments, useProfile } from '../features/catalog';
import { useAvatarLook } from '../../world/avatarStore';
import { DEFAULT_APPEARANCE, DEPT_JACKETS, HAIR_SWATCHES, SCHOOL_JACKETS, SKIN_SWATCHES, jacketForDepartment, loadAppearance, saveAppearance, type Appearance, type JacketId, type JacketInfo } from '../../world/avatar';
import './avatar.css';

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="ui-avatar-row" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="ui-avatar-sw">
        {colors.map((c) => <button key={c} type="button" style={{ background: c }} aria-label={`${label} ${c}`} aria-pressed={value === c} onClick={() => onPick(c)} />)}
      </div>
    </div>
  );
}

/** 잠바 한 벌의 썸네일 카드 */
function JacketCard({ j, selected, mine, onPick }: { j: JacketInfo; selected: boolean; mine?: boolean; onPick: (id: JacketId) => void }) {
  return (
    <button type="button" className="ui-jacket" aria-pressed={selected} aria-label={`잠바 ${j.label}`} onClick={() => onPick(j.id)}>
      <img className="ui-jacket-img" src={`${import.meta.env.BASE_URL}${j.thumb}`} alt="" width={192} height={192} loading="lazy" draggable={false} />
      <strong>{j.label}{mine && <em>내 학과</em>}</strong>
      <span className="ui-card-sub">{j.desc}</span>
    </button>
  );
}

export function AvatarPicker({ look, onChange, deptName }: { look: Appearance; onChange: (a: Appearance) => void; deptName?: string | null }) {
  const set = (k: 'hair' | 'skin') => (c: string) => onChange({ ...look, [k]: c });
  const pickJacket = (id: JacketId) => onChange({ ...look, jacket: id });
  const mineId = jacketForDepartment(deptName);
  return (
    <div className="ui-avatar-pop glass" role="dialog" aria-label="캐릭터 꾸미기">
      <h3>캐릭터 꾸미기</h3>
      <div className="ui-avatar-row" role="group" aria-label="학교 잠바">
        <span>학교 잠바</span>
        <div className="ui-jackets">{SCHOOL_JACKETS.map((j) => <JacketCard key={j.id} j={j} selected={look.jacket === j.id} onPick={pickJacket} />)}</div>
      </div>
      <div className="ui-avatar-row" role="group" aria-label="학과 잠바">
        <span>학과 잠바</span>
        <div className="ui-jackets">{DEPT_JACKETS.map((j) => <JacketCard key={j.id} j={j} selected={look.jacket === j.id} mine={j.id === mineId} onPick={pickJacket} />)}</div>
        <p className="ui-avatar-note">다른 학과 잠바는 준비 중이에요.</p>
      </div>
      <Swatches label="머리색" colors={HAIR_SWATCHES} value={look.hair} onPick={set('hair')} />
      <Swatches label="피부톤" colors={SKIN_SWATCHES} value={look.skin} onPick={set('skin')} />
      <div className="ui-avatar-actions">
        {mineId != null && <button type="button" onClick={() => pickJacket(mineId)}>내 학과 잠바 입기</button>}
        <button type="button" onClick={() => onChange({ ...DEFAULT_APPEARANCE })}>기본으로</button>
      </div>
      <p className="ui-avatar-note">같은 월드에 있는 다른 접속자에게도 바로 보여요.</p>
    </div>
  );
}

/** 상단바 버튼 + 팝오버. 저장된 외형은 월드가 준비되면 자동으로 적용 */
export function AvatarButton() {
  const api = useWorld((s) => s.api);
  const [open, setOpen] = useState(false);
  const [look, setLook] = useState<Appearance>(() => loadAppearance());
  const profile = useProfile().data;
  const deps = useDepartments().data;
  const deptName = deps?.find((d) => d.id === profile?.departmentId)?.name ?? null;

  useEffect(() => { api?.setAppearance?.(look); }, [api, look]);
  const change = (a: Appearance) => { setLook(a); saveAppearance(a); useAvatarLook.setState({ look: a }); };

  return (
    <div className="ui-avatar-wrap">
      <button className="iconbtn glass" type="button" aria-label="캐릭터 꾸미기" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Shirt size={18} aria-hidden="true" />
      </button>
      {open && <AvatarPicker look={look} onChange={change} deptName={deptName} />}
    </div>
  );
}
