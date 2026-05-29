import { useEffect } from "react";
import type YPartyKitProvider from "y-partykit/provider";

type ProviderWithUnloadHandler = YPartyKitProvider & {
  _unloadHandler?: () => void;
};

/**
 * y-partykit 은 생성 시 `unload` 리스너를 등록하는데 Chrome Permissions Policy 에서 경고가 납니다.
 * 동일 핸들러를 `pagehide` 로 옮겨 탭 종료 시 awareness 정리는 유지합니다.
 */
export function usePartyKitPageHideAwareness(provider: YPartyKitProvider): void {
  useEffect(() => {
    const handler = (provider as ProviderWithUnloadHandler)._unloadHandler;
    if (!handler || typeof window === "undefined") return;

    window.removeEventListener("unload", handler);
    window.addEventListener("pagehide", handler);

    return () => {
      window.removeEventListener("pagehide", handler);
    };
  }, [provider]);
}
