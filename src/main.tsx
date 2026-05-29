// y-partykit 이 unload 리스너를 등록하기 전에 pagehide 로 우회 패치
import "./lib/patchUnloadPolicy";
import { installRenderSpecPatch } from "./lib/patchRenderSpec";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

installRenderSpecPatch();

/**
 * Y.Doc + WebSocket처럼 “외부 자원 수명”과 맞물리면 StrictMode 이중 마운트가
 * 중복 연결/파괴 레이스를 유발할 수 있어 StrictMode 는 켜지 않습니다.
 */
createRoot(document.getElementById("root")!).render(<App />);
