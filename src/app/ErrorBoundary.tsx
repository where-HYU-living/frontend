import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode; label: string; place: 'panel' | 'center'; onClose?: () => void };

/** 새로 배포된 뒤 옛 탭이 지운 파일(지도·실내 코드 조각)을 부를 때 나는 오류 */
const isStaleChunk = (e: Error) => /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|Loading chunk/i.test(e.message);

/**
 * 화면 일부(패널·지도·실내)에서 오류가 나도 앱 전체(3D 포함)가 하얗게 사라지지 않게 그 자리만 안내로 바꾼다.
 * 새 버전 때문이면 새로고침을, 아니면 닫기·다시 시도를 준다.
 */
export class ErrorBoundary extends Component<Props, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error(`[${this.props.label}]`, err); }
  render() {
    const { err } = this.state;
    if (!err) return this.props.children;
    const stale = isStaleChunk(err);
    const reset = () => this.setState({ err: null });
    return (
      <div className={`ui-crash glass is-${this.props.place}`} role="alert">
        <p className="ui-crash-title">{stale ? '새 버전이 올라왔어요' : `${this.props.label}을(를) 보여 주지 못했어요`}</p>
        <p className="ui-crash-sub">{stale ? '새로고침하면 바로 이어서 볼 수 있어요.' : '잠시 뒤 다시 해 보거나 새로고침해 주세요.'}</p>
        <div className="ui-crash-actions">
          {this.props.onClose && <button type="button" className="ui-secondary" onClick={() => { reset(); this.props.onClose?.(); }}>닫기</button>}
          {!stale && <button type="button" className="ui-secondary" onClick={reset}>다시 시도</button>}
          <button type="button" className="ui-primary" onClick={() => location.reload()}>새로고침</button>
        </div>
      </div>
    );
  }
}
