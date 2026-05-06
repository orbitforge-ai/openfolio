import { invoke } from "@tauri-apps/api/core";

export interface OpenPdfResult {
  path: string;
  name: string;
  bytes: number[];
  size: number;
  modified?: number;
}

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openPdfFromPath(path: string): Promise<OpenPdfResult> {
  return invoke<OpenPdfResult>("open_pdf", { path });
}

export async function savePdfToPath(path: string, bytes: Uint8Array): Promise<void> {
  await invoke("save_pdf", { path, bytes: Array.from(bytes) });
}

export async function getRecentFiles(): Promise<RecentFile[]> {
  if (!isTauriRuntime()) return [];
  return invoke<RecentFile[]>("get_recent_files");
}

export async function setRecentFile(path: string, name: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("set_recent_file", { path, name });
}
