import { create } from 'zustand';
import { loadAppearance, type Appearance } from './avatar';

/** 내 캐릭터 꾸미기 현재값. 꾸미기 화면이 바꾸고, 멀티플레이가 이걸 서버로 보낸다 */
export const useAvatarLook = create<{ look: Appearance }>(() => ({ look: loadAppearance() }));
