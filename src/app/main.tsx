import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'; // 가변 글꼴 한 벌(굵기 45~920)을 쓰는 글자 묶음만. 굵기별 정적 글꼴 CSS(542KB, @font-face 828개) 대신 56KB, 550·650·750 같은 중간 굵기도 진짜로 그린다
import { createRoot } from 'react-dom/client';
import '../style.css'; // 3D 쪽 스타일 (라벨·조이스틱·미니맵)
import './app.css';
import { App } from './App';

// StrictMode 는 쓰지 않음: 개발 모드에서 effect 가 두 번 돌면 3D 장면이 두 번 만들어짐
createRoot(document.getElementById('root')!).render(<App />);
