// 접속자 표시 거리 단계. 멀수록 그림자 → 이름표 → 몸 순서로 끈다 (30명이 모여도 프레임이 안 떨어지게)
export const LOD = { shadowM: 35, labelM: 50, hideM: 180 } as const;

export type Lod = { visible: boolean; label: boolean; shadow: boolean };
export const lodFor = (dist: number): Lod => ({ visible: dist <= LOD.hideM, label: dist <= LOD.labelM, shadow: dist <= LOD.shadowM });
