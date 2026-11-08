import * as THREE from 'three';

/** 장면에 올라간 것을 모두 내리고 GPU 자원을 해제한다 (월드를 다른 월드로 바꿀 때) */
export function disposeScene(scene: THREE.Scene): { geometries: number; materials: number; textures: number } {
  const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), texs = new Set<THREE.Texture>();
  const lights: THREE.Light[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight) lights.push(o as THREE.Light); // 그림자 맵(렌더 타깃 텍스처)은 light.dispose() 로만 풀린다
    const el = (o as unknown as { element?: HTMLElement }).element;
    if (el && typeof el.remove === 'function') el.remove();
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    // 품질에 따라 바꿔 끼우는 지오메트리·재질(예: 가벼운 지형)은 장면에 안 걸려 있어도 같이 해제
    const also = (o.userData?.disposeAlso as (THREE.BufferGeometry | THREE.Material)[] | undefined) ?? [];
    for (const a of also) if ((a as THREE.BufferGeometry).isBufferGeometry) geos.add(a as THREE.BufferGeometry);
    const ms = [...(m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : []), ...also.filter((a): a is THREE.Material => (a as THREE.Material).isMaterial)];
    for (const mt of ms) {
      mats.add(mt);
      for (const v of Object.values(mt)) if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture);
      // onBeforeCompile·ShaderMaterial 이 uniform 으로 들고 있는 텍스처
      const un = (mt as THREE.ShaderMaterial).uniforms;
      if (un) for (const u of Object.values(un)) { const v = (u as { value?: unknown }).value; if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture); }
      for (const t of (mt.userData?.textures as THREE.Texture[] | undefined) ?? []) if (t?.isTexture) texs.add(t);
      const sh = (mt as THREE.Material & { userData?: { shader?: { uniforms?: Record<string, { value?: unknown }> } } }).userData?.shader?.uniforms;
      if (sh) for (const u of Object.values(sh)) { const v = u.value; if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture); }
    }
  });
  for (const c of [...scene.children]) scene.remove(c);
  geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose());
  lights.forEach((l) => l.dispose());
  (scene.userData.envRT as THREE.WebGLRenderTarget | undefined)?.dispose(); delete scene.userData.envRT; // PMREM 결과(렌더 타깃)
  (scene.userData.skyBg as THREE.Texture | undefined)?.dispose(); delete scene.userData.skyBg; // 하늘 사진 (품질 최저에선 배경에서 빠져 있음)
  scene.environment?.dispose?.(); (scene.background as THREE.Texture | null)?.dispose?.(); scene.background = null; scene.environment = null; scene.fog = null;
  return { geometries: geos.size, materials: mats.size, textures: texs.size };
}
