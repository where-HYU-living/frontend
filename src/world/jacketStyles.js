// 과잠(야구잠바) 종류별 3D 스타일. 색은 three 의 hex 숫자, 등판·앞 패치는 캔버스에 그린다.
// 새 잠바를 늘릴 때는 STYLES 에 한 항목 + src/world/avatar.ts 의 JACKETS 에 같은 id 를 추가한다.
export const STYLES = {
  // 학교잠바 1: 남색 몸판 + 흰 소매, HANYANG UNIV., 앞은 흰 H (실물 사진 기준)
  school1: {
    body: 0x141f3c, sleeve: 0xf3efe6, sleeveRough: 0.8, trim: 0x141f3c, stripe: 0xf3efe6, button: 0xf3efe6,
    ink: '#f3efe6', back: 'arch', line1: 'HANYANG', line2: 'UNIV.', footer: 'Since 1939', patch: 'plainH',
  },
  // 학교잠바 2: 검정 + 은색 사자, 漢陽大學校
  school2: {
    body: 0x0d0d10, sleeve: 0x0d0d10, sleeveRough: 0.85, trim: 0x0d0d10, stripe: 0x3a3a40, button: 0x8a8d93,
    ink: '#c9ccd2', back: 'kanji', line1: '漢陽大學校', footer: 'Since 1939', patch: 'outlineH',
  },
  // 학교잠바 3: 검정 몸판 + 가죽 소매 + 금색 자수, 흰 줄 리브
  school3: {
    body: 0x0e0e10, sleeve: 0x060607, sleeveRough: 0.32, trim: 0x0e0e10, stripe: 0xf5f5f0, button: 0xc9a24a,
    ink: '#c9a24a', outline: '#5b4515', back: 'arch', line1: 'HANYANG', line2: 'UNIV.', footer: 'Since 1939', patch: 'none',
  },
  // 학과잠바: 정보시스템학과 — 남색 몸판 + 흰 소매, HANYANG TECH / Department of Information Systems
  'dept-is': {
    body: 0x14224a, sleeve: 0xf5f5f2, sleeveRough: 0.8, trim: 0x14224a, stripe: 0xf5f5f2, button: 0xf5f5f2,
    ink: '#f5f5f2', back: 'arch', line1: 'HANYANG', line2: 'TECH', footer: 'Department of Information Systems', footerSize: 30, patch: 'plainH',
  },
};

export const hasStyle = (id) => Object.prototype.hasOwnProperty.call(STYLES, id);

/** 사자 패치(크림색+투명)를 단색으로 물들인 캔버스. 이미지가 아직 없으면 null */
function tinted(img, color) {
  if (!img || !img.complete || !img.naturalWidth) return null;
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** 등판 512x512. 둥근 글자(아치) 또는 한자 + 사자 + 아래 글귀 */
export function paintBack(cg, st, lionImg) {
  const W = 512, H = 512, cx = W / 2;
  cg.clearRect(0, 0, W, H);
  cg.fillStyle = st.ink; cg.strokeStyle = st.outline || st.ink; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.lineJoin = 'round';
  const fill = (txt, x, y) => { if (st.outline) { cg.lineWidth = 7; cg.strokeText(txt, x, y); } cg.fillText(txt, x, y); };
  const arcText = (word, size, R, span, cy, font) => {
    cg.font = `${font} ${size}px "Pretendard Variable", Pretendard, Arial Black, sans-serif`;
    for (let i = 0; i < word.length; i++) {
      const a = -span / 2 + (span * (i + 0.5)) / word.length;
      cg.save(); cg.translate(cx + Math.sin(a) * R, cy - Math.cos(a) * R); cg.rotate(a); fill(word[i], 0, 0); cg.restore();
    }
  };
  if (st.back === 'kanji') {
    arcText(st.line1, 86, 330, 1.3, 330, '700');
  } else {
    arcText(st.line1, 96, 290, 1.75, 345, '900');
    cg.font = '900 88px "Pretendard Variable", Pretendard, Arial Black, sans-serif'; fill(st.line2, cx, 170);
  }
  const lion = tinted(lionImg, st.ink);
  if (lion) cg.drawImage(lion, cx - 105, 218, 210, 186);
  cg.font = `italic ${st.footerSize || 44}px Georgia, serif`; cg.fillStyle = st.ink; cg.fillText(st.footer, cx, 458);
}

/** 앞판 왼가슴 128x128 */
export function paintPatch(hg, st) {
  hg.clearRect(0, 0, 128, 128);
  if (st.patch === 'none') return;
  hg.textAlign = 'center'; hg.textBaseline = 'middle';
  hg.font = '900 100px "Pretendard Variable", Pretendard, Arial Black, sans-serif';
  if (st.patch === 'square') {
    hg.fillStyle = st.ink; hg.fillRect(8, 8, 112, 112); hg.fillStyle = st.patchInk; hg.fillText('H', 64, 70);
  } else if (st.patch === 'outlineH') {
    hg.lineWidth = 6; hg.strokeStyle = st.ink; hg.strokeText('H', 64, 70);
  } else {
    hg.fillStyle = st.ink; hg.fillText('H', 64, 70);
  }
}
