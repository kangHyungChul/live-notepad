import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // BlockNote 는 소비자 앱의 React 단일 인스턴스를 써야 nodeView DOM 이 정상입니다
    include: ["react", "react-dom", "@blocknote/core", "@blocknote/react", "@blocknote/mantine"],
  },
  resolve: {
    // React·Tiptap·ProseMirror 이 중복 번들되면 nodeView DOM spec 이 깨질 수 있음
    dedupe: [
      "react",
      "react-dom",
      "@tiptap/core",
      "@tiptap/pm",
      "@tiptap/react",
      "prosemirror-model",
      "prosemirror-state",
      "prosemirror-view",
      "prosemirror-transform",
    ],
  },
})
