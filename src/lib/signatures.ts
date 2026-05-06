import type { SignatureAsset, SignatureAssetKind, SignatureAssetMode } from "../types";
import { createId } from "./id";

const SIGNATURE_STORAGE_KEY = "openfolio.signature-assets.v1";
const LEGACY_SIGNATURE_STORAGE_KEY = "pdf-forge.signature-assets.v1";

export const signatureFonts = [
  { label: "Script", value: "Brush Script MT, Snell Roundhand, cursive" },
  { label: "Elegant", value: "Georgia, Times New Roman, serif" },
  { label: "Clean", value: "Inter, Arial, sans-serif" }
];

export interface CreateSignatureAssetInput {
  kind: SignatureAssetKind;
  mode: SignatureAssetMode;
  imageDataUrl: string;
  width: number;
  height: number;
  label?: string;
  text?: string;
  fontFamily?: string;
}

export interface StoredSignatureAsset {
  id?: unknown;
  label?: unknown;
  kind?: unknown;
  mode?: unknown;
  imageDataUrl?: unknown;
  width?: unknown;
  height?: unknown;
  createdAt?: unknown;
  text?: unknown;
  fontFamily?: unknown;
}

interface SignatureStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function createSignatureAsset(input: CreateSignatureAssetInput): SignatureAsset {
  return {
    id: createId("sig-asset"),
    label: input.label?.trim() || defaultSignatureLabel(input.kind),
    kind: input.kind,
    mode: input.mode,
    imageDataUrl: input.imageDataUrl,
    width: Math.max(1, Math.round(input.width)),
    height: Math.max(1, Math.round(input.height)),
    createdAt: new Date().toISOString(),
    text: input.text,
    fontFamily: input.fontFamily
  };
}

export function loadSignatureAssets(storage = defaultStorage()): SignatureAsset[] {
  if (!storage) return [];

  try {
    const raw = storage.getItem(SIGNATURE_STORAGE_KEY) ?? storage.getItem(LEGACY_SIGNATURE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSignatureAsset).filter((asset): asset is SignatureAsset => Boolean(asset));
  } catch {
    return [];
  }
}

export function saveSignatureAssets(assets: SignatureAsset[], storage = defaultStorage()): void {
  if (!storage) return;
  storage.setItem(SIGNATURE_STORAGE_KEY, JSON.stringify(assets));
}

export function normalizeSignatureAsset(asset: StoredSignatureAsset): SignatureAsset | null {
  if (
    typeof asset.id !== "string" ||
    typeof asset.label !== "string" ||
    !isSignatureAssetKind(asset.kind) ||
    !isSignatureAssetMode(asset.mode) ||
    typeof asset.imageDataUrl !== "string" ||
    !asset.imageDataUrl.startsWith("data:image/") ||
    typeof asset.width !== "number" ||
    typeof asset.height !== "number" ||
    typeof asset.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: asset.id,
    label: asset.label,
    kind: asset.kind,
    mode: asset.mode,
    imageDataUrl: asset.imageDataUrl,
    width: Math.max(1, Math.round(asset.width)),
    height: Math.max(1, Math.round(asset.height)),
    createdAt: asset.createdAt,
    text: typeof asset.text === "string" ? asset.text : undefined,
    fontFamily: typeof asset.fontFamily === "string" ? asset.fontFamily : undefined
  };
}

export function renderTypedSignatureDataUrl(
  text: string,
  options: { kind: SignatureAssetKind; fontFamily: string; width?: number; height?: number }
): { imageDataUrl: string; width: number; height: number } {
  const width = options.width ?? (options.kind === "date" ? 260 : 420);
  const height = options.height ?? (options.kind === "date" ? 110 : 160);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create signature image.");

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#111827";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${options.kind === "date" ? 42 : 64}px ${options.fontFamily}`;
  context.fillText(text, width / 2, height / 2, width - 28);

  if (options.kind === "date") {
    context.strokeStyle = "#111827";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(28, height - 24);
    context.lineTo(width - 28, height - 24);
    context.stroke();
  }

  return { imageDataUrl: canvas.toDataURL("image/png"), width, height };
}

export function transparentCanvasHasInk(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d");
  if (!context) return false;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) return true;
  }
  return false;
}

export function defaultSignatureLabel(kind: SignatureAssetKind): string {
  if (kind === "initials") return "Initials";
  if (kind === "date") return "Date";
  return "Signature";
}

export function defaultDateStamp(date = new Date()): string {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function signaturePlacementSize(asset: SignatureAsset): { width: number; height: number } {
  const defaultWidth = asset.kind === "initials" ? 90 : asset.kind === "date" ? 130 : 180;
  const aspect = asset.width / asset.height || 2.5;
  return { width: defaultWidth, height: Math.max(28, defaultWidth / aspect) };
}

function isSignatureAssetKind(value: unknown): value is SignatureAssetKind {
  return value === "signature" || value === "initials" || value === "date";
}

function isSignatureAssetMode(value: unknown): value is SignatureAssetMode {
  return value === "imported" || value === "drawn" || value === "typed";
}

function defaultStorage(): SignatureStorage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}
