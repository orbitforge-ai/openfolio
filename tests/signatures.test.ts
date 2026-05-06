import { describe, expect, it } from "vitest";
import type { SignatureAsset } from "../src/types";
import { createSignatureAsset, loadSignatureAssets, normalizeSignatureAsset, saveSignatureAssets } from "../src/lib/signatures";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const imageDataUrl = "data:image/png;base64,iVBORw0KGgo=";

describe("signature assets", () => {
  it("creates reusable signature assets with stable metadata", () => {
    const asset = createSignatureAsset({
      kind: "initials",
      mode: "typed",
      label: "MW",
      text: "MW",
      fontFamily: "Inter",
      imageDataUrl,
      width: 180,
      height: 80
    });

    expect(asset.id).toMatch(/^sig-asset-/);
    expect(asset.kind).toBe("initials");
    expect(asset.mode).toBe("typed");
    expect(asset.label).toBe("MW");
    expect(asset.width).toBe(180);
    expect(asset.height).toBe(80);
  });

  it("persists and reloads valid assets", () => {
    const storage = new MemoryStorage();
    const assets: SignatureAsset[] = [
      {
        id: "asset-1",
        label: "Signature",
        kind: "signature",
        mode: "imported",
        imageDataUrl,
        width: 420,
        height: 160,
        createdAt: "2026-05-05T00:00:00.000Z"
      }
    ];

    saveSignatureAssets(assets, storage);
    expect(loadSignatureAssets(storage)).toEqual(assets);
  });

  it("drops malformed stored assets", () => {
    expect(
      normalizeSignatureAsset({
        id: "bad",
        label: "Bad",
        kind: "secure",
        mode: "typed",
        imageDataUrl,
        width: 100,
        height: 40,
        createdAt: "2026-05-05T00:00:00.000Z"
      })
    ).toBeNull();
  });
});
