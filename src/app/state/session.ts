import { create } from 'zustand';

const KEY = 'chatatda.token';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (t: string | null) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* 저장 불가 시 메모리만 */ } };

type SessionState = {
  token: string | null;
  nickname: string | null;
  loginOpen: boolean;
  setLogin: (token: string, nickname: string) => void;
  logout: () => void;
  openLogin: () => void;
  closeLogin: () => void;
  /** 게스트면 로그인 창을 열고 false. 로그인이 필요한 동작 앞에서 쓴다 */
  requireLogin: () => boolean;
};

export const useSession = create<SessionState>((set, get) => ({
  token: read(),
  nickname: null,
  loginOpen: false,
  setLogin: (token, nickname) => { write(token); set({ token, nickname, loginOpen: false }); },
  logout: () => { write(null); set({ token: null, nickname: null }); },
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),
  requireLogin: () => {
    if (get().token) return true;
    set({ loginOpen: true });
    return false;
  },
}));
