import 'pretendard/dist/web/static/pretendard.css';
import { createRoot } from 'react-dom/client';
import '../style.css'; // 3D 쪽 스타일 (라벨·조이스틱·미니맵)
import './app.css';
import { App } from './App';

// StrictMode 는 쓰지 않음: 개발 모드에서 effect 가 두 번 돌면 3D 장면이 두 번 만들어짐
createRoot(document.getElementById('root')!).render(<App />);
