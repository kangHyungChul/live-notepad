/**
 * 업로드 허용/차단 정책.
 * 대부분의 일반 파일은 허용하고, 실행·스크립트·XSS에 악용되기 쉬운 확장자/MIME 은 차단합니다.
 *
 * 명시적으로 허용하는 예: zip·7z·tar·gz 등 압축, py·rb·txt·docx·xlsx·mp4 등.
 * (차단 목록에 없으면 업로드 가능 — MIME 이 실행형으로 판별될 때만 추가 차단)
 */

/** 단일 파일 최대 크기 (Storage 버킷 limit 과 동일: 50MB) */
export const MAX_UPLOAD_BYTES = 52_428_800;

/** 방당 누적 저장 한도 (100MB) — DB 트리거(005)와 동일 값 */
export const MAX_ROOM_STORAGE_BYTES = 104_857_600;

/** 미리보기 허용 최대 크기 (대용량 PDF 렌더 부담 완화) */
export const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;

/**
 * 확장자 차단 목록 (소문자, 점 없음).
 * 이중 확장자(예: report.pdf.exe)도 검사합니다.
 */
const BLOCKED_EXTENSIONS = new Set([
  // Windows 실행·스크립트
  "exe",
  "msi",
  "msp",
  "bat",
  "cmd",
  "com",
  "scr",
  "pif",
  "cpl",
  "hta",
  "ps1",
  "ps2",
  "psm1",
  "psc1",
  "vbs",
  "vbe",
  "js",
  "jse",
  "ws",
  "wsf",
  "wsh",
  "reg",
  "inf",
  "lnk",
  "url",
  // 웹에서 스크립트 실행 가능
  "html",
  "htm",
  "xhtml",
  "svg",
  "shtml",
  // 서버/패키지 스크립트
  "php",
  "php3",
  "php4",
  "php5",
  "phtml",
  "asp",
  "aspx",
  "jsp",
  "cgi",
  "sh",
  "bash",
  "zsh",
  "fish",
  // 바이너리·라이브러리
  "dll",
  "so",
  "dylib",
  "jar",
  "war",
  "app",
  "deb",
  "rpm",
  "dmg",
  "pkg",
  // 매크로 포함 Office (일반 docx/xlsx 는 허용)
  "docm",
  "xlsm",
  "pptm",
  "dotm",
  "xltm",
  "potm",
]);

/** 미리보기 가능 확장자 (svg/html 은 보안상 업로드 자체가 차단됨) */
const PREVIEWABLE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "avif",
  "pdf",
]);

/**
 * MIME 차단 목록 (소문자).
 */
const BLOCKED_MIME_PREFIXES = [
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/vnd.microsoft.portable-executable",
  "application/x-sh",
  "application/x-bat",
  "application/hta",
  "application/javascript",
  "application/x-javascript",
  "text/javascript",
  "application/x-php",
  "application/x-httpd-php",
];

export type FilePolicyResult =
  | { ok: true }
  | { ok: false; reason: string };

/** 이중 확장자 등 모든 세그먼트 확장자 검사 */
function allExtensions(filename: string): string[] {
  const base = filename.trim().split(/[/\\]/).pop() ?? "";
  const parts = base.split(".");
  if (parts.length < 2) return [];
  return parts.slice(1).map((p) => p.toLowerCase());
}

/**
 * 업로드 전 파일 검증.
 */
export function validateUploadFile(file: File): FilePolicyResult {
  const name = file.name.trim();
  if (!name) {
    return { ok: false, reason: "파일 이름이 비어 있습니다." };
  }
  if (name.includes("..") || /[<>:"|?*\x00]/.test(name)) {
    return { ok: false, reason: "파일 이름에 허용되지 않는 문자가 있습니다." };
  }
  if (file.size <= 0) {
    return { ok: false, reason: "빈 파일은 업로드할 수 없습니다." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `파일 크기는 ${formatBytes(MAX_UPLOAD_BYTES)} 이하여야 합니다.` };
  }

  for (const ext of allExtensions(name)) {
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return {
        ok: false,
        reason: `보안상 업로드할 수 없는 확장자입니다: .${ext}`,
      };
    }
  }

  const mime = (file.type || "application/octet-stream").toLowerCase();
  for (const blocked of BLOCKED_MIME_PREFIXES) {
    if (mime === blocked || mime.startsWith(`${blocked};`)) {
      return { ok: false, reason: "보안상 업로드할 수 없는 파일 형식입니다." };
    }
  }
  if (mime === "text/html" || mime === "image/svg+xml") {
    return { ok: false, reason: "보안상 업로드할 수 없는 파일 형식입니다." };
  }

  return { ok: true };
}

/** 이미지·PDF 미리보기 가능 여부 */
export function canPreviewRoomFile(
  mimeType: string,
  originalName: string,
  sizeBytes: number,
): boolean {
  if (sizeBytes > MAX_PREVIEW_BYTES) return false;
  const mime = mimeType.toLowerCase();
  if (mime === "application/pdf") return true;
  if (mime.startsWith("image/") && mime !== "image/svg+xml") return true;
  const base = originalName.trim().split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return false;
  const ext = base.slice(dot + 1).toLowerCase();
  return PREVIEWABLE_EXTENSIONS.has(ext);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Storage 객체 키용 ASCII 파일명.
 * Supabase Storage 는 한글·공백 등 비 ASCII 키를 거부할 수 있어,
 * 표시용 이름은 DB `original_name` 에만 두고 경로는 id+확장자만 사용합니다.
 */
export function buildStorageObjectFileName(fileId: string, originalName: string): string {
  const base = originalName.trim().split(/[/\\]/).pop() ?? "file";
  const dot = base.lastIndexOf(".");
  const rawExt = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  const ext = rawExt.replace(/[^a-z0-9]/g, "").slice(0, 16);
  return ext ? `${fileId}.${ext}` : fileId;
}
