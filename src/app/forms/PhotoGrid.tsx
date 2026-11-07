import { useRef } from 'react';
import { Plus, X } from 'lucide-react';

/** 사진 썸네일 격자 + 추가 칸. 파일 선택은 숨은 input(aria-label="사진")으로 */
export function PhotoGrid({ photos, onAdd, onRemove, error, busy, max = 6 }: { photos: string[]; onAdd: (files: File[]) => void; onRemove: (i: number) => void; error?: string | null; busy?: boolean; max?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="ui-photos">
      <ul className="ui-photo-grid">
        {photos.map((src, i) => (
          <li key={src + i} className="ui-photo">
            <img src={src} alt={`증거 사진 ${i + 1}`} loading="lazy" />
            <button type="button" className="ui-photo-x" aria-label={`사진 ${i + 1} 빼기`} onClick={() => onRemove(i)}><X size={12} aria-hidden="true" /></button>
          </li>
        ))}
        {photos.length < max && (
          <li>
            <button type="button" className="ui-photo ui-photo-add" disabled={busy} onClick={() => ref.current?.click()}>
              <Plus size={18} aria-hidden="true" /><span>{busy ? '올리는 중' : '사진 추가'}</span>
            </button>
          </li>
        )}
      </ul>
      <input ref={ref} className="ui-photo-input" type="file" accept="image/jpeg,image/png" multiple aria-label="사진" tabIndex={-1}
        onChange={(e) => { const fs = Array.from(e.target.files ?? []).slice(0, Math.max(0, max - photos.length)); if (fs.length) onAdd(fs); e.target.value = ''; }} />
      <p className="ui-field-hint">jpg·png, 5MB 이하, 최대 {max}장</p>
      {error && <p className="ui-field-error" role="alert">{error}</p>}
    </div>
  );
}
