import { MantineProvider } from "@mantine/core";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";

/**
 * 단일 페이지 앱 라우팅.
 * - `/` : 방 생성·코드 입장
 * - `/room/:slug` : 협업 에디터
 *
 * BlockNote Mantine UI 는 MantineProvider 컨텍스트가 필요합니다.
 */
function App() {
  return (
    <MantineProvider defaultColorScheme="dark">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:slug" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  );
}

export default App;
