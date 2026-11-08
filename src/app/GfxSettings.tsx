import { useState } from 'react';
import { Gauge, Map as MapIcon, X } from 'lucide-react';
import { accelHelp, useGfx, type Choice } from '../gfx';
import { LEVEL_LABEL } from '../quality';
import { Segmented } from './forms/Segmented';
import { useUi } from './state/ui';
import './forms/forms.css';

const OPTIONS: [Choice, string][] = [['auto', '자동'], ['high', LEVEL_LABEL.high], ['med', LEVEL_LABEL.med], ['low', LEVEL_LABEL.low], ['min', LEVEL_LABEL.min]];

/** 그래픽 가속 켜는 방법 + 설정 주소 복사 (웹페이지는 chrome:// 를 열 수 없다) */
function AccelHowTo() {
  const h = accelHelp();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!h.url) return;
    try { await navigator.clipboard.writeText(h.url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); }
  };
  return (
    <div className="ui-gfx-howto">
      <p>{h.steps}</p>
      {h.url && (
        <button type="button" className="ui-gfx-copy" onClick={copy} aria-live="polite">
          {copied ? '복사했어요 — 주소창에 붙여 넣기' : <>설정 주소 복사 <code>{h.url}</code></>}
        </button>
      )}
    </div>
  );
}

/** 더 보기 메뉴 안: 그래픽 품질 고르기 */
export function GfxSettings() {
  const { choice, level, autoLevel, gpu, fromUrl, Q, bootAntialias, setChoice } = useGfx();
  const [help, setHelp] = useState(false);
  return (
    <div className="ui-gfx">
      <div className="ui-gfx-head"><Gauge size={15} aria-hidden="true" /><span>그래픽</span>
        <span className="ui-gfx-now" data-testid="gfx-now">{choice === 'auto' ? `자동 · 지금 ${LEVEL_LABEL[level]}` : LEVEL_LABEL[level]}{fromUrl ? ' (주소로 고정)' : ''}</span>
      </div>
      <Segmented label="그래픽 품질" options={OPTIONS} value={choice} onChange={setChoice} className="ui-gfx-seg" />
      {choice === 'auto' && level !== autoLevel && <p className="ui-gfx-note">이 기기에서 화면이 느려서 {LEVEL_LABEL[autoLevel]} → {LEVEL_LABEL[level]}(으)로 낮췄어요.</p>}
      {Q.antialias !== bootAntialias && <p className="ui-gfx-note">계단 현상 처리는 새로고침하면 바뀌어요.</p>}
      {gpu.software
        ? <>
            <p className="ui-gfx-warn">그래픽 가속이 꺼져 있어요. 3D 를 CPU 로 그리고 있어서 느려요.</p>
            {help ? <AccelHowTo /> : <button type="button" className="ui-gfx-link" onClick={() => setHelp(true)}>켜는 방법 보기</button>}
          </>
        : gpu.renderer && <p className="ui-gfx-dev" title={gpu.renderer}>{shortRenderer(gpu.renderer)}</p>}
    </div>
  );
}

/** 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)' → 'Apple M3 Pro' */
export function shortRenderer(r: string): string {
  const inner = /^ANGLE \((.*)\)$/.exec(r.trim())?.[1];
  const name = (inner ? inner.split(', ')[1] ?? inner : r)
    .replace(/^ANGLE \w+ Renderer: /, '').replace(/\s*\(0x[0-9a-f]+\)/i, '').replace(/\s+(Direct3D|vs_|OpenGL|Vulkan).*$/, '');
  return name.trim().slice(0, 48);
}

/**
 * 3D 가 아주 느릴 때 화면 아래 안내: 그래픽 가속이 꺼졌거나(시작하자마자) 최저 품질에서도 너무 느릴 때(실행 중).
 * 지도(2D)로 보기·켜는 방법을 바로 고를 수 있고, 닫으면 이번 접속 동안 다시 안 뜬다.
 */
export function GfxNotice() {
  const { gpu, slow } = useGfx();
  const mapMode = useUi((s) => s.mapMode);
  const setMapMode = useUi((s) => s.setMapMode);
  const [closed, setClosed] = useState(() => { try { return sessionStorage.getItem('chatatda.gfxNotice') === '1'; } catch { return false; } });
  const [help, setHelp] = useState(false);
  if (closed || mapMode === '2d' || !(gpu.software || slow)) return null;
  const close = () => { setClosed(true); try { sessionStorage.setItem('chatatda.gfxNotice', '1'); } catch { /* 이번 화면에서만 닫힘 */ } };
  return (
    <div className="ui-gfx-notice glass" role="status" data-testid="gfx-notice">
      <button type="button" className="ui-gfx-x" aria-label="안내 닫기" onClick={close}><X size={16} aria-hidden="true" /></button>
      <p className="ui-gfx-notice-title">{gpu.software ? '그래픽 가속이 꺼져 있어 3D 가 느려요' : '이 기기에서는 3D 가 많이 느려요'}</p>
      <p className="ui-gfx-notice-sub">{gpu.software ? '가장 가벼운 화면(최저)으로 바꿨어요. 가속을 켜면 훨씬 부드러워요.' : '최저 품질로도 느려요. 지도로 보면 모든 기능을 그대로 쓸 수 있어요.'}</p>
      {help && <AccelHowTo />}
      <div className="ui-gfx-actions">
        <button type="button" className="ui-gfx-primary" onClick={() => setMapMode('2d')}><MapIcon size={15} aria-hidden="true" />지도로 보기</button>
        {gpu.software && !help && <button type="button" className="ui-gfx-link" onClick={() => setHelp(true)}>가속 켜는 방법</button>}
      </div>
    </div>
  );
}
