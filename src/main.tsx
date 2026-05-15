import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

/**
 * React 18 StrictMode는 개발 모드에서 이펙트/마운트를 의도적으로 두 번 호출합니다.
 * Y.Doc + WebSocket처럼 “외부 자원 수명”과 맞물리면 중복 연결/파괴 레이스가 나기 쉬워
 * 이 프로젝트에서는 StrictMode를 켜지 않습니다(프로덕션 빌드와 동일한 한 번 마운트에 가깝게).
 */
createRoot(document.getElementById("root")!).render(<App />);
