export type Tool =
  | "select"
  | "text"
  | "highlight"
  | "ink"
  | "rectangle"
  | "note"
  | "signature";

export type AnnotationKind = "text" | "highlight" | "ink" | "rectangle" | "note" | "signature";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfAnnotation {
  id: string;
  kind: AnnotationKind;
  pageIndex: number;
  rect: Rect;
  text?: string;
  color: string;
  opacity?: number;
  points?: Point[];
  imageDataUrl?: string;
  signatureAsset?: {
    assetId: string;
    kind: SignatureAssetKind;
    mode: SignatureAssetMode;
    label: string;
  };
}

export type SignatureAssetKind = "signature" | "initials" | "date";

export type SignatureAssetMode = "imported" | "drawn" | "typed";

export interface SignatureAsset {
  id: string;
  label: string;
  kind: SignatureAssetKind;
  mode: SignatureAssetMode;
  imageDataUrl: string;
  width: number;
  height: number;
  createdAt: string;
  text?: string;
  fontFamily?: string;
}

export interface FormEdit {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "optionList" | "unknown";
  value: string | boolean | string[];
}

export interface PageState {
  sourceIndex: number;
  rotation: number;
  deleted: boolean;
}

export interface DocumentSession {
  id: string;
  path?: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  pages: PageState[];
  selectedPage: number;
  zoom: number;
  dirty: boolean;
  annotations: PdfAnnotation[];
  formEdits: Record<string, FormEdit>;
}

export interface DocumentHistorySnapshot {
  pages: PageState[];
  selectedPage: number;
  dirty: boolean;
  annotations: PdfAnnotation[];
  formEdits: Record<string, FormEdit>;
}

export interface PdfFormFieldSummary {
  name: string;
  type: FormEdit["type"];
  value: string | boolean | string[];
  options?: string[];
}

export interface PdfFormWidget {
  id: string;
  name: string;
  type: FormEdit["type"];
  rect: Rect;
  value: string | boolean | string[];
  options?: string[];
  buttonValue?: string;
  readOnly?: boolean;
}

export interface RenderedPageInfo {
  pageIndex: number;
  width: number;
  height: number;
}
