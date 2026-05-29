/**
 * Chrome Permissions Policy 는 `unload` 이벤트 등록을 차단하고 콘솔에 Violation 경고를 냅니다.
 * y-partykit 프로바이더는 생성자에서 `window.addEventListener("unload", …)` 를 호출하므로,
 * 앱 부트스트랩 시점에 addEventListener 를 가로채 `pagehide` 로 대체합니다.
 * (탭 종료 시 awareness 정리 목적은 pagehide 에서도 동일하게 동작합니다.)
 */
if (typeof window !== "undefined") {
  const nativeAdd = window.addEventListener.bind(window);
  const nativeRemove = window.removeEventListener.bind(window);

  window.addEventListener = function patchedAddEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type === "unload" && listener) {
      nativeAdd("pagehide", listener, options);
      return;
    }
    nativeAdd(type, listener as EventListener, options);
  };

  window.removeEventListener = function patchedRemoveEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (type === "unload" && listener) {
      nativeRemove("pagehide", listener as EventListener, options);
      return;
    }
    nativeRemove(type, listener as EventListener, options);
  };
}
