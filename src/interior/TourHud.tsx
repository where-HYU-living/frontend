import { Fragment, useEffect, useState } from 'react';
import { ArrowLeft, CircleHelp, DoorOpen, Hand, MapPin, Moon, MousePointer2, Move, Sofa, Sun, UserPlus } from 'lucide-react';
import type { FloorPlan } from '../api/types';
import { clockLabel } from '../world/timeOfDay';
import type { InteriorInput } from './input';
import { InviteButton } from '../app/InviteButton';
import { Minimap } from './Minimap';
import type { Pin } from './pins';
import type { Jump } from './tourNav';

const COACH_KEY = 'ui-tour-coach-v1';
const coachSeen = () => { try { return localStorage.getItem(COACH_KEY) === '1'; } catch { return false; } };
const markCoachSeen = () => { try { localStorage.setItem(COACH_KEY, '1'); } catch { /* 저장 못 해도 화면은 정상 */ } };

type Props = {
  title: string;
  floorplanId: number;
  /** 초대 링크로 들어왔는지 (잠깐 안내) */
  invited?: boolean;
  plan: FloorPlan;
  input: InteriorInput;
  pins: Pin[];
  jumps: Jump[];
  hasFurniture: boolean;
  showFurniture: boolean;
  onFurniture: () => void;
  time: number;
  onTime: (t: number) => void;
  onExit: () => void;
  onJump: (to: { x: number; z: number; yaw: number }) => void;
  onPickPoint: (x: number, z: number) => void;
  /** 핀 시트가 열려 있으면 바닥 쪽 조작 UI 를 숨긴다 */
  quiet: boolean;
};

/** 지금 서 있는 방(rooms 인덱스)을 걸을 때마다 따라간다. 방이 바뀔 때만 React 가 다시 그린다 */
function useCurrentRoom(input: InteriorInput) {
  const [room, setRoom] = useState(-1);
  useEffect(() => {
    let raf = 0, last = -2;
    const tick = () => { if (input.pose.room !== last) { last = input.pose.room; setRoom(last); } raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [input]);
  return room;
}

/** 처음 한 번만 보이는 조작법. 오른쪽 위 ‘?’ 로 다시 볼 수 있다 */
function Coach({ onClose }: { onClose: () => void }) {
  const rows: [React.ReactNode, string, string][] = [
    [<Move size={18} aria-hidden="true" />, '걷기', 'W A S D 또는 방향키 (Shift 를 누르면 빠르게). 휴대폰은 왼쪽 아래 조이스틱'],
    [<Hand size={18} aria-hidden="true" />, '둘러보기', '화면을 끌어서 시선을 돌려요'],
    [<MousePointer2 size={18} aria-hidden="true" />, '후기 남기기', '벽이나 바닥을 길게 누르면 그 자리에 핀을 꽂아요'],
    [<DoorOpen size={18} aria-hidden="true" />, '방 옮기기', '아래 방 이름이나 오른쪽 아래 평면도를 누르면 바로 가요'],
  ];
  return (
    <section className="ui-tour-coach glass" role="dialog" aria-label="조작법">
      <h2>이렇게 둘러봐요</h2>
      <ul>{rows.map(([icon, name, text]) => (<li key={name}><span className="ui-tour-coach-icon">{icon}</span><span><strong>{name}</strong><small>{text}</small></span></li>))}</ul>
      <button type="button" className="ui-tour-coach-ok" onClick={onClose}>확인했어요</button>
    </section>
  );
}

/** 초대 링크로 들어왔을 때 5초만 보이는 안내 */
function InvitedToast() {
  const [show, setShow] = useState(true);
  useEffect(() => { const t = setTimeout(() => setShow(false), 5000); return () => clearTimeout(t); }, []);
  if (!show) return null;
  return <p className="ui-tour-toast glass" role="status"><UserPlus size={15} aria-hidden="true" />초대받은 방이에요. 초대한 사람이 있던 자리 옆에 섰어요</p>;
}

export function TourHud({ title, floorplanId, invited, plan, input, pins, jumps, hasFurniture, showFurniture, onFurniture, time, onTime, onExit, onJump, onPickPoint, quiet }: Props) {
  const here = useCurrentRoom(input);
  const [coach, setCoach] = useState(() => !coachSeen());
  const closeCoach = () => { markCoachSeen(); setCoach(false); };
  const roomName = here >= 0 ? plan.rooms[here]?.name : '건물 밖';
  const roomCount = Math.max(0, jumps.length - 1);

  return (
    <>
      <header className="ui-tour-top">
        <button type="button" className="ui-tour-back glass" onClick={onExit} aria-label="실내 투어를 끝내고 동네로 돌아가기" title="나가기 (Esc)">
          <ArrowLeft size={18} aria-hidden="true" /><span>나가기</span>
        </button>
        <div className="ui-tour-id glass">
          <h1>{title}</h1>
          <p><span>전용 {plan.areaM2}㎡</span><span>방 {roomCount}개</span></p>
        </div>
        <div className="ui-tour-tools glass" role="toolbar" aria-label="보기 설정">
          {hasFurniture && (
            <button type="button" className="ui-tour-tool has-text" onClick={onFurniture} title={showFurniture ? '방의 가구와 설비를 숨겨요' : '방에 가구와 설비를 놓아요'}>
              <Sofa size={15} aria-hidden="true" /><span>{showFurniture ? '가구 제거' : '가구 추가'}</span>
            </button>
          )}
 <InviteButton className="ui-tour-tool has-text ui-tour-invite" room={() => ({ floorplanId, title, x: input.pose.x, z: input.pose.z, yaw: input.pose.yaw })} />
          <div className="tod ui-tour-tod" title="시간대: 왼쪽 낮, 오른쪽 밤">
            <Sun size={15} aria-hidden="true" />
            <input type="range" min={0} max={1000} step={1} value={Math.round(time * 1000)} onChange={(e) => onTime(Number(e.target.value) / 1000)} aria-label="시간대 (왼쪽 낮, 오른쪽 밤)" aria-valuetext={clockLabel(time)} />
            <Moon size={15} aria-hidden="true" />
          </div>
          <button type="button" className="ui-tour-tool is-icon" aria-label="조작법 보기" title="조작법" onClick={() => setCoach(true)}><CircleHelp size={17} aria-hidden="true" /></button>
        </div>
      </header>

      {invited && <InvitedToast />}
      {coach && <Coach onClose={closeCoach} />}

      {!quiet && (
        <>
          <nav className="ui-tour-rail glass" aria-label="방 바로가기">
            {jumps.map((j) => {
              const isHere = j.key !== 'entrance' && j.room === here;
              return (
                <Fragment key={j.key}>
                  <button type="button" className={`ui-tour-chip${isHere ? ' is-here' : ''}${j.key === 'entrance' ? ' is-start' : ''}`} aria-current={isHere ? 'location' : undefined} onClick={() => onJump(j)}>
                    <span className="name">{j.key === 'entrance' && <DoorOpen size={15} aria-hidden="true" />}{j.label}</span>
                    {j.area != null && <span className="area">{j.area.toFixed(1)}㎡</span>}
                  </button>
                  {j.key === 'entrance' && <span className="ui-tour-sep" aria-hidden="true" />}
                </Fragment>
              );
            })}
          </nav>
          <aside className="ui-tour-map glass" aria-label="평면도">
            <Minimap plan={plan} input={input} pins={pins} size={150} onPick={onPickPoint} />
            <p className="ui-tour-here" aria-live="polite"><MapPin size={13} aria-hidden="true" />{roomName}</p>
          </aside>
        </>
      )}
    </>
  );
}
