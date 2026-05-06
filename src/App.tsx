import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Highlighter,
  Image,
  MousePointer2,
  PenLine,
  Plus,
  RotateCw,
  Save,
  Scissors,
  Search,
  Square,
  StickyNote,
  Type,
  TextCursorInput,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { ChangeEvent, PointerEvent, SyntheticEvent, UIEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type {
  DocumentSession,
  FormEdit,
  PdfAnnotation,
  PdfFormFieldSummary,
  PdfFormWidget,
  Point,
  SignatureAsset,
  SignatureAssetKind,
  Tool
} from "./types";
import { createDemoPdf } from "./lib/demoPdf";
import { createId } from "./lib/id";
import { deletePage, duplicatePage, movePage, rotatePage, visiblePages } from "./lib/pageOperations";
import { exportPdf, exportSplitPdf } from "./lib/exportPdf";
import { expandPageRanges, parsePageRanges } from "./lib/ranges";
import { getRecentFiles, isTauriRuntime, openPdfFromPath, savePdfToPath, setRecentFile, type RecentFile } from "./lib/tauri";
import { getPageFormWidgets, loadPdfDocument, summarizeFormFields } from "./lib/pdfRuntime";
import {
  createSignatureAsset,
  defaultDateStamp,
  defaultSignatureLabel,
  loadSignatureAssets,
  renderTypedSignatureDataUrl,
  saveSignatureAssets,
  signatureFonts,
  signaturePlacementSize,
  transparentCanvasHasInk
} from "./lib/signatures";

const tools: Array<{ id: Tool; label: string; icon: typeof MousePointer2 }> = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "text", label: "Text", icon: TextCursorInput },
  { id: "highlight", label: "Highlight", icon: Highlighter },
  { id: "ink", label: "Ink", icon: PenLine },
  { id: "rectangle", label: "Rectangle", icon: Square },
  { id: "note", label: "Note", icon: StickyNote },
  { id: "signature", label: "Signature", icon: Check }
];

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<DocumentSession | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [fields, setFields] = useState<PdfFormFieldSummary[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [status, setStatus] = useState("Open a PDF to begin.");
  const [splitRange, setSplitRange] = useState("");
  const [signatureAssets, setSignatureAssets] = useState<SignatureAsset[]>(() => loadSignatureAssets());
  const [selectedSignatureAssetId, setSelectedSignatureAssetId] = useState<string>("");
  const [dragPage, setDragPage] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ pageIndex: number; snippets: string[] }>>([]);
  const [annotationText, setAnnotationText] = useState("Approved");

  useEffect(() => {
    getRecentFiles().then(setRecentFiles).catch(() => setRecentFiles([]));
  }, []);

  useEffect(() => {
    saveSignatureAssets(signatureAssets);
    if (signatureAssets.length === 0) {
      setSelectedSignatureAssetId("");
      return;
    }
    if (!signatureAssets.some((asset) => asset.id === selectedSignatureAssetId)) {
      setSelectedSignatureAssetId(signatureAssets[0].id);
    }
  }, [signatureAssets, selectedSignatureAssetId]);

  useEffect(() => {
    if (!session) return;

    let canceled = false;
    loadPdfDocument(session.bytes)
      .then((doc) => {
        if (!canceled) setPdfDoc(doc);
      })
      .catch((error) => setStatus(`Could not render PDF: ${error.message}`));

    summarizeFormFields(session.bytes)
      .then((summary) => {
        if (!canceled) setFields(summary);
      })
      .catch(() => {
        if (!canceled) setFields([]);
      });

    return () => {
      canceled = true;
    };
  }, [session?.id]);

  const selectedPageState = session?.pages[session.selectedPage];
  const selectedSignatureAsset = useMemo(
    () => signatureAssets.find((asset) => asset.id === selectedSignatureAssetId) ?? signatureAssets[0],
    [signatureAssets, selectedSignatureAssetId]
  );
  const visiblePageList = useMemo(() => (session ? visiblePages(session.pages) : []), [session?.pages]);
  const currentVisibleIndex = useMemo(() => {
    if (!session || !selectedPageState) return 0;
    return visiblePageList.findIndex((page) => page === selectedPageState);
  }, [session, selectedPageState, visiblePageList]);

  async function openWithDialog() {
    if (isTauriRuntime()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (typeof path === "string") {
        await openPath(path);
      }
      return;
    }

    fileInputRef.current?.click();
  }

  async function openPath(path: string) {
    const result = await openPdfFromPath(path);
    await createSession(result.name, new Uint8Array(result.bytes), result.path);
    await setRecentFile(result.path, result.name);
    setRecentFiles(await getRecentFiles());
  }

  async function onBrowserFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await createSession(file.name, new Uint8Array(await file.arrayBuffer()));
    event.target.value = "";
  }

  async function createSession(name: string, bytes: Uint8Array, path?: string) {
    const doc = await loadPdfDocument(bytes);
    setSession({
      id: createId("session"),
      path,
      name,
      bytes,
      pageCount: doc.numPages,
      pages: Array.from({ length: doc.numPages }, (_, sourceIndex) => ({ sourceIndex, rotation: 0, deleted: false })),
      selectedPage: 0,
      zoom: 1,
      dirty: false,
      annotations: [],
      formEdits: {}
    });
    setPdfDoc(doc);
    setStatus(`${name} opened.`);
  }

  async function openDemoPdf() {
    const bytes = await createDemoPdf();
    await createSession("Openfolio Demo.pdf", bytes);
  }

  function updateSession(updater: (session: DocumentSession) => DocumentSession) {
    setSession((current) => (current ? updater(current) : current));
  }

  function markPages(pages: DocumentSession["pages"], selectedPage?: number) {
    const targetPage = selectedPage ?? session?.selectedPage ?? 0;
    const safeSelected = pages[targetPage]?.deleted ? pages.findIndex((page) => !page.deleted) : targetPage;
    updateSession((current) => ({
      ...current,
      pages,
      selectedPage: Math.max(0, Math.min(safeSelected, pages.length - 1)),
      dirty: true
    }));
  }

  function selectVisiblePage(delta: number) {
    if (!session) return;
    const visibleIndex = Math.max(0, Math.min(currentVisibleIndex + delta, visiblePageList.length - 1));
    const page = visiblePageList[visibleIndex];
    const selectedPage = session.pages.findIndex((candidate) => candidate === page);
    updateSession((current) => ({ ...current, selectedPage }));
  }

  async function searchDocument(query: string) {
    setSearchQuery(query);
    if (!pdfDoc || !query.trim()) {
      setSearchResults([]);
      return;
    }

    const normalized = query.trim().toLowerCase();
    const matches: Array<{ pageIndex: number; snippets: string[] }> = [];

    for (let pageIndex = 0; pageIndex < pdfDoc.numPages; pageIndex += 1) {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      const hit = text.toLowerCase().indexOf(normalized);
      if (hit >= 0) {
        matches.push({
          pageIndex,
          snippets: [makeSnippet(text, hit, query.length)]
        });
      }
    }

    setSearchResults(matches);
    setStatus(matches.length ? `${matches.length} page${matches.length === 1 ? "" : "s"} matched "${query}".` : `No matches for "${query}".`);
  }

  async function saveAs(bytes?: Uint8Array, suggestedName?: string) {
    if (!session && !bytes) return;
    const output = bytes ?? (await exportPdf(session!));
    const name = suggestedName ?? session!.name.replace(/\.pdf$/i, "-edited.pdf");

    if (isTauriRuntime()) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({ defaultPath: name, filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (!path) return;
      await savePdfToPath(path, output);
      setStatus(`Saved ${path}`);
      updateSession((current) => ({ ...current, dirty: false }));
      return;
    }

    const blobBytes = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([blobBytes], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
    updateSession((current) => ({ ...current, dirty: false }));
    setStatus(`Downloaded ${name}.`);
  }

  async function splitExport() {
    if (!session) return;
    try {
      const ranges = parsePageRanges(splitRange, visiblePageList.length);
      const bytes = await exportSplitPdf(session, expandPageRanges(ranges));
      await saveAs(bytes, session.name.replace(/\.pdf$/i, "-split.pdf"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not split PDF.");
    }
  }

  function updateFormField(field: PdfFormFieldSummary, value: FormEdit["value"]) {
    updateSession((current) => ({
      ...current,
      dirty: true,
      formEdits: {
        ...current.formEdits,
        [field.name]: { name: field.name, type: field.type, value }
      }
    }));
  }

  function addSignatureAsset(asset: SignatureAsset) {
    setSignatureAssets((assets) => [asset, ...assets]);
    setSelectedSignatureAssetId(asset.id);
    setStatus(`${asset.label} saved. Select the Signature tool and click the page to place it.`);
  }

  function deleteSignatureAsset(assetId: string) {
    setSignatureAssets((assets) => assets.filter((asset) => asset.id !== assetId));
  }

  function onSignatureUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imageDataUrl = String(reader.result);
      const image = new window.Image();
      image.onload = () => {
        addSignatureAsset(
          createSignatureAsset({
            kind: "signature",
            mode: "imported",
            label: file.name.replace(/\.[^.]+$/, "") || "Imported signature",
            imageDataUrl,
            width: image.naturalWidth || 420,
            height: image.naturalHeight || 160
          })
        );
      };
      image.onerror = () => setStatus("Could not import that signature image.");
      image.src = imageDataUrl;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  return (
    <main className="app-shell">
      <input ref={fileInputRef} className="hidden" type="file" accept="application/pdf" onChange={onBrowserFile} />
      <input ref={signatureInputRef} className="hidden" type="file" accept="image/png,image/jpeg" onChange={onSignatureUpload} />

      <header className="topbar">
        <div className="brand">
          <FilePlus2 size={24} />
          <div>
            <strong>Openfolio</strong>
            <span>{session ? `${session.name}${session.dirty ? " • unsaved" : ""}` : "Fill, sign, organize, export"}</span>
          </div>
        </div>

        <div className="top-actions">
          <button onClick={openWithDialog} title="Open PDF">
            <FolderOpen size={18} />
            Open
          </button>
          <button onClick={openDemoPdf} title="Open demo PDF">
            <FilePlus2 size={18} />
            Demo
          </button>
          <button disabled={!session} onClick={() => saveAs()} title="Save as PDF">
            <Save size={18} />
            Save As
          </button>
          <button disabled={!session} onClick={() => saveAs()} title="Export edited PDF">
            <Download size={18} />
            Export
          </button>
        </div>
      </header>

      <div className="toast-status" role="status">
        {status}
      </div>

      <section className="workspace">
        <aside className="left-panel">
          <div className="panel-section">
            <h2>Tools</h2>
            <div className="tool-grid">
              {tools.map(({ id, label, icon: Icon }) => (
                <button key={id} className={tool === id ? "active" : ""} onClick={() => setTool(id)} title={label}>
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
            <label className="compact-field">
              <span>Text / note</span>
              <input value={annotationText} onChange={(event) => setAnnotationText(event.target.value)} />
            </label>
          </div>

          <div className="panel-section">
            <h2>Pages</h2>
            <div className="page-actions">
              <button disabled={!session} onClick={() => session && markPages(rotatePage(session.pages, session.selectedPage))} title="Rotate page">
                <RotateCw size={16} />
              </button>
              <button disabled={!session} onClick={() => session && markPages(duplicatePage(session.pages, session.selectedPage), session.selectedPage + 1)} title="Duplicate page">
                <Copy size={16} />
              </button>
              <button disabled={!session} onClick={() => session && markPages(deletePage(session.pages, session.selectedPage))} title="Delete page">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="thumb-list">
              {session?.pages.map((page, index) =>
                page.deleted ? null : (
                  <button
                    key={`${page.sourceIndex}-${index}`}
                    className={session.selectedPage === index ? "thumb active" : "thumb"}
                    draggable
                    onDragStart={() => setDragPage(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragPage !== null && session) markPages(movePage(session.pages, dragPage, index), index);
                      setDragPage(null);
                    }}
                    onClick={() => updateSession((current) => ({ ...current, selectedPage: index }))}
                  >
                    <span>Page {index + 1}</span>
                    <small>Source {page.sourceIndex + 1}</small>
                  </button>
                )
              )}
            </div>
          </div>

          <div className="panel-section">
            <h2>Split</h2>
            <div className="split-row">
              <input value={splitRange} onChange={(event) => setSplitRange(event.target.value)} placeholder="1-3, 6" />
              <button disabled={!session || !splitRange.trim()} onClick={splitExport} title="Export selected ranges">
                <Scissors size={16} />
              </button>
            </div>
          </div>
        </aside>

        <section className="document-stage">
          <div className="stage-toolbar">
            <button disabled={!session || currentVisibleIndex <= 0} onClick={() => selectVisiblePage(-1)} title="Previous page">
              <ChevronLeft size={17} />
            </button>
            <span>{session ? `Page ${currentVisibleIndex + 1} of ${visiblePageList.length}` : "No document"}</span>
            <button disabled={!session || currentVisibleIndex >= visiblePageList.length - 1} onClick={() => selectVisiblePage(1)} title="Next page">
              <ChevronRight size={17} />
            </button>
            <div className="separator" />
            <button disabled={!session} onClick={() => updateSession((current) => ({ ...current, zoom: Math.max(0.5, current.zoom - 0.1) }))}>
              <ZoomOut size={17} />
            </button>
            <span>{session ? `${Math.round(session.zoom * 100)}%` : "100%"}</span>
            <button disabled={!session} onClick={() => updateSession((current) => ({ ...current, zoom: Math.min(2.5, current.zoom + 0.1) }))}>
              <ZoomIn size={17} />
            </button>
            <div className="search-shell">
              <Search size={16} />
              <input
                placeholder="Search"
                value={searchQuery}
                disabled={!session}
                onChange={(event) => searchDocument(event.target.value)}
              />
            </div>
            {searchQuery.trim() && (
              <button
                className="search-count"
                disabled={searchResults.length === 0}
                onClick={() => {
                  const first = searchResults[0];
                  if (!first || !session) return;
                  const pageIndex = session.pages.findIndex((page) => page.sourceIndex === first.pageIndex && !page.deleted);
                  if (pageIndex >= 0) updateSession((current) => ({ ...current, selectedPage: pageIndex }));
                }}
                title="Jump to first match"
              >
                {searchResults.length} hit{searchResults.length === 1 ? "" : "s"}
              </button>
            )}
          </div>

          <div className={session && pdfDoc && selectedPageState ? "document-fill" : "page-scroll"}>
            {session && pdfDoc && selectedPageState ? (
              <VirtualizedDocument
                session={session}
                pdfDoc={pdfDoc}
                visiblePages={visiblePageList}
                tool={tool}
                annotationText={annotationText}
                fields={fields}
                selectedSignatureAsset={selectedSignatureAsset}
                onFormChange={updateFormField}
                onNeedSignature={() => setStatus("Create or select a visible signature before placing it.")}
                onVisiblePageChange={(selectedPage) => updateSession((current) => ({ ...current, selectedPage }))}
                onAddAnnotation={(annotation) =>
                  updateSession((current) => ({
                    ...current,
                    dirty: true,
                    annotations: [...current.annotations, annotation]
                  }))
                }
              />
            ) : (
              <div className="empty-state">
                <FolderOpen size={42} />
                <h1>Open a PDF</h1>
                <p>Fill forms, add signatures and annotations, reorder pages, split ranges, then export a clean PDF.</p>
                <button onClick={openWithDialog}>
                  <FolderOpen size={18} />
                  Choose PDF
                </button>
                <button onClick={openDemoPdf}>
                  <FilePlus2 size={18} />
                  Demo PDF
                </button>
                {recentFiles.length > 0 && (
                  <div className="recent-list">
                    {recentFiles.map((file) => (
                      <button key={file.path} onClick={() => openPath(file.path)}>
                        {file.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="right-panel">
          <div className="panel-section">
            <h2>Search</h2>
            {!searchQuery.trim() ? (
              <p className="muted">Search text across the open PDF.</p>
            ) : searchResults.length === 0 ? (
              <p className="muted">No matches.</p>
            ) : (
              <div className="search-results">
                {searchResults.map((result) => {
                  const pageIndex = session?.pages.findIndex((page) => page.sourceIndex === result.pageIndex && !page.deleted) ?? -1;
                  return (
                    <button
                      key={result.pageIndex}
                      disabled={pageIndex < 0}
                      onClick={() => pageIndex >= 0 && updateSession((current) => ({ ...current, selectedPage: pageIndex }))}
                    >
                      <strong>Page {pageIndex + 1}</strong>
                      <span>{result.snippets[0]}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel-section">
            <h2>Text</h2>
            <label className="form-field">
              <span>Text and note content</span>
              <input value={annotationText} onChange={(event) => setAnnotationText(event.target.value)} placeholder="Text to place" />
            </label>
            <p className="muted">Select Text or Note, then click the page.</p>
          </div>

          <div className="panel-section">
            <h2>Forms</h2>
            {fields.length === 0 ? (
              <p className="muted">No supported form fields detected.</p>
            ) : (
              <div className="field-list">
                {fields.map((field) => (
                  <FormFieldEditor key={field.name} field={field} edit={session?.formEdits[field.name]} onChange={(value) => updateFormField(field, value)} />
                ))}
              </div>
            )}
          </div>

          <div className="panel-section">
            <h2>Signature</h2>
            <SignaturePanel
              assets={signatureAssets}
              selectedAssetId={selectedSignatureAsset?.id ?? ""}
              onSelectAsset={setSelectedSignatureAssetId}
              onDeleteAsset={deleteSignatureAsset}
              onImport={() => signatureInputRef.current?.click()}
              onCreateAsset={addSignatureAsset}
            />
          </div>

          <div className="panel-section status">
            <h2>Status</h2>
            <p>{status}</p>
          </div>
        </aside>
      </section>
    </main>
  );
}

const PAGE_GAP = 28;
const VIRTUAL_OVERSCAN = 2;

function SignaturePanel({
  assets,
  selectedAssetId,
  onSelectAsset,
  onDeleteAsset,
  onImport,
  onCreateAsset
}: {
  assets: SignatureAsset[];
  selectedAssetId: string;
  onSelectAsset: (assetId: string) => void;
  onDeleteAsset: (assetId: string) => void;
  onImport: () => void;
  onCreateAsset: (asset: SignatureAsset) => void;
}) {
  const [assetKind, setAssetKind] = useState<SignatureAssetKind>("signature");
  const [typedText, setTypedText] = useState("");
  const [fontFamily, setFontFamily] = useState(signatureFonts[0].value);
  const selectedFont = signatureFonts.find((font) => font.value === fontFamily) ?? signatureFonts[0];
  const dateStamp = defaultDateStamp();

  function createTypedAsset(kind: SignatureAssetKind) {
    const text = kind === "date" ? dateStamp : typedText.trim();
    if (!text) return;
    const rendered = renderTypedSignatureDataUrl(text, { kind, fontFamily });
    onCreateAsset(
      createSignatureAsset({
        kind,
        mode: "typed",
        label: kind === "date" ? `Date ${text}` : `${defaultSignatureLabel(kind)} - ${text}`,
        text,
        fontFamily,
        ...rendered
      })
    );
    if (kind !== "date") setTypedText("");
  }

  return (
    <div className="signature-panel">
      <div className="signature-actions">
        <button onClick={onImport} title="Import signature image">
          <Upload size={16} />
          Import
        </button>
        <button onClick={() => createTypedAsset("date")} title="Create today's date stamp">
          <CalendarDays size={16} />
          Date
        </button>
      </div>

      <div className="signature-kind-tabs" role="group" aria-label="Signature type">
        {(["signature", "initials"] as const).map((kind) => (
          <button key={kind} className={assetKind === kind ? "active" : ""} onClick={() => setAssetKind(kind)}>
            {kind === "signature" ? "Signature" : "Initials"}
          </button>
        ))}
      </div>

      <label className="form-field">
        <span>{assetKind === "signature" ? "Typed signature" : "Typed initials"}</span>
        <input
          value={typedText}
          onChange={(event) => setTypedText(event.target.value)}
          placeholder={assetKind === "signature" ? "Full name" : "AB"}
        />
      </label>
      <label className="form-field">
        <span>Style</span>
        <select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}>
          {signatureFonts.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </label>
      <button disabled={!typedText.trim()} onClick={() => createTypedAsset(assetKind)}>
        <Type size={16} />
        Save Typed
      </button>
      {typedText.trim() && (
        <div className="typed-signature-preview" style={{ fontFamily: selectedFont.value }}>
          {typedText}
        </div>
      )}

      <DrawSignatureCreator kind={assetKind} onCreateAsset={onCreateAsset} />

      <p className="muted signature-security-note">
        Visible stamps only. These exports do not add certificate, DocuSign, or Acrobat digital signature security.
      </p>

      <div className="signature-asset-list">
        {assets.length === 0 ? (
          <p className="muted">Create or import a signature, initials, or date stamp.</p>
        ) : (
          assets.map((asset) => (
            <div key={asset.id} className={asset.id === selectedAssetId ? "signature-asset active" : "signature-asset"}>
              <button className="signature-asset-select" onClick={() => onSelectAsset(asset.id)} title={`Use ${asset.label}`}>
                <img src={asset.imageDataUrl} alt={asset.label} />
                <span>
                  <strong>{asset.label}</strong>
                  <small>
                    {asset.kind} / {asset.mode}
                  </small>
                </span>
              </button>
              <button className="icon-button" onClick={() => onDeleteAsset(asset.id)} title={`Delete ${asset.label}`}>
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      <p className="muted">Select the Signature tool and click the page to place the active stamp.</p>
    </div>
  );
}

function DrawSignatureCreator({
  kind,
  onCreateAsset
}: {
  kind: SignatureAssetKind;
  onCreateAsset: (asset: SignatureAsset) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    clearDrawing();
  }, [kind]);

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height
    };
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    context.strokeStyle = "#111827";
    context.lineWidth = kind === "initials" ? 5 : 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(point.x, point.y);
    setDrawing(true);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const point = canvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasInk(true);
  }

  function onPointerUp() {
    setDrawing(false);
  }

  function clearDrawing() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function saveDrawing() {
    const canvas = canvasRef.current;
    if (!canvas || !transparentCanvasHasInk(canvas)) return;
    onCreateAsset(
      createSignatureAsset({
        kind,
        mode: "drawn",
        label: `Drawn ${defaultSignatureLabel(kind).toLowerCase()}`,
        imageDataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height
      })
    );
    clearDrawing();
  }

  return (
    <div className="draw-signature">
      <span>Draw {kind === "signature" ? "signature" : "initials"}</span>
      <canvas
        ref={canvasRef}
        width={420}
        height={160}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="signature-actions">
        <button disabled={!hasInk} onClick={saveDrawing}>
          <PenLine size={16} />
          Save Drawn
        </button>
        <button disabled={!hasInk} onClick={clearDrawing}>
          Clear
        </button>
      </div>
    </div>
  );
}

function VirtualizedDocument({
  session,
  pdfDoc,
  visiblePages,
  tool,
  annotationText,
  fields,
  selectedSignatureAsset,
  onFormChange,
  onNeedSignature,
  onVisiblePageChange,
  onAddAnnotation
}: {
  session: DocumentSession;
  pdfDoc: PDFDocumentProxy;
  visiblePages: DocumentSession["pages"];
  tool: Tool;
  annotationText: string;
  fields: PdfFormFieldSummary[];
  selectedSignatureAsset?: SignatureAsset;
  onFormChange: (field: PdfFormFieldSummary, value: FormEdit["value"]) => void;
  onNeedSignature: () => void;
  onVisiblePageChange: (selectedPage: number) => void;
  onAddAnnotation: (annotation: PdfAnnotation) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [pageSizes, setPageSizes] = useState<Record<number, { width: number; height: number }>>({});
  const pageIndexBySource = useMemo(() => {
    const map = new Map<number, number>();
    session.pages.forEach((page, index) => map.set(page.sourceIndex, index));
    return map;
  }, [session.pages]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    setViewportHeight(scroller.clientHeight);
    const resizeObserver = new ResizeObserver(() => setViewportHeight(scroller.clientHeight));
    resizeObserver.observe(scroller);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    let canceled = false;

    Promise.all(
      visiblePages.map(async (pageState) => {
        const page = await pdfDoc.getPage(pageState.sourceIndex + 1);
        const viewport = page.getViewport({ scale: 1 });
        return [pageState.sourceIndex, { width: viewport.width, height: viewport.height }] as const;
      })
    ).then((sizes) => {
      if (!canceled) setPageSizes(Object.fromEntries(sizes));
    });

    return () => {
      canceled = true;
    };
  }, [pdfDoc, visiblePages]);

  useEffect(() => {
    const selectedState = session.pages[session.selectedPage];
    if (!selectedState) return;
    const visibleIndex = visiblePages.findIndex((page) => page === selectedState);
    if (visibleIndex < 0) return;

    const scroller = scrollerRef.current;
    if (!scroller) return;
    const targetTop = offsets[visibleIndex] ?? 0;
    const targetBottom = targetTop + measuredHeights[visibleIndex];

    if (targetTop < scroller.scrollTop || targetBottom > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTo({ top: Math.max(0, targetTop - PAGE_GAP), behavior: "smooth" });
    }
  }, [session.selectedPage]);

  const measuredHeights = useMemo(
    () => visiblePages.map((pageState) => ((pageSizes[pageState.sourceIndex]?.height ?? 792) * session.zoom) + PAGE_GAP),
    [pageSizes, session.zoom, visiblePages]
  );
  const offsets = useMemo(() => {
    const values: number[] = [];
    let offset = 0;
    for (const height of measuredHeights) {
      values.push(offset);
      offset += height;
    }
    return values;
  }, [measuredHeights]);
  const totalHeight = measuredHeights.reduce((total, height) => total + height, 0);
  const firstVisible = Math.max(0, findPageIndexAtOffset(scrollTop, offsets, measuredHeights) - VIRTUAL_OVERSCAN);
  const safeEndIndex = Math.min(
    visiblePages.length - 1,
    Math.max(firstVisible, findPageIndexAtOffset(scrollTop + viewportHeight, offsets, measuredHeights) + VIRTUAL_OVERSCAN)
  );
  const renderedPages = visiblePages.slice(firstVisible, safeEndIndex + 1);
  const topSpacer = offsets[firstVisible] ?? 0;
  const renderedHeight = renderedPages.reduce((height, _, index) => height + measuredHeights[firstVisible + index], 0);
  const bottomSpacer = Math.max(0, totalHeight - topSpacer - renderedHeight);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const nextScrollTop = event.currentTarget.scrollTop;
    setScrollTop(nextScrollTop);

    const center = nextScrollTop + event.currentTarget.clientHeight * 0.42;
    const visibleIndex = findPageIndexAtOffset(center, offsets, measuredHeights);
    const pageState = visiblePages[visibleIndex];
    const selectedPage = pageState ? pageIndexBySource.get(pageState.sourceIndex) : undefined;
    if (selectedPage !== undefined && selectedPage !== session.selectedPage) {
      onVisiblePageChange(selectedPage);
    }
  }

  return (
    <div ref={scrollerRef} className="page-scroll" onScroll={onScroll}>
      <div className="virtual-document" style={{ width: documentWidth(visiblePages, pageSizes, session.zoom) }}>
        <div style={{ height: topSpacer }} />
        {renderedPages.map((pageState, index) => (
          <div key={`${pageState.sourceIndex}-${firstVisible + index}`} className="virtual-page-slot">
            <PdfPage
              pdfDoc={pdfDoc}
              sourcePageIndex={pageState.sourceIndex}
              zoom={session.zoom}
              tool={tool}
              annotations={session.annotations.filter((annotation) => annotation.pageIndex === pageState.sourceIndex)}
              annotationText={annotationText}
              fields={fields}
              formEdits={session.formEdits}
              selectedSignatureAsset={selectedSignatureAsset}
              onFormChange={onFormChange}
              onNeedSignature={onNeedSignature}
              onAddAnnotation={onAddAnnotation}
            />
          </div>
        ))}
        <div style={{ height: bottomSpacer }} />
      </div>
    </div>
  );
}

function findPageIndexAtOffset(offset: number, offsets: number[], heights: number[]): number {
  if (offsets.length === 0) return 0;

  const index = offsets.findIndex((pageOffset, pageIndex) => offset >= pageOffset && offset < pageOffset + heights[pageIndex]);
  return index >= 0 ? index : offsets.length - 1;
}

function documentWidth(
  pages: DocumentSession["pages"],
  pageSizes: Record<number, { width: number; height: number }>,
  zoom: number
): number {
  const widest = pages.reduce((width, page) => Math.max(width, pageSizes[page.sourceIndex]?.width ?? 612), 612);
  return widest * zoom;
}

function FormFieldEditor({
  field,
  edit,
  onChange
}: {
  field: PdfFormFieldSummary;
  edit?: FormEdit;
  onChange: (value: FormEdit["value"]) => void;
}) {
  const value = edit?.value ?? field.value;

  if (field.type === "checkbox") {
    return (
      <label className="form-field checkbox-field">
        <span>{field.name}</span>
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
      </label>
    );
  }

  if ((field.type === "dropdown" || field.type === "radio") && field.options) {
    return (
      <label className="form-field">
        <span>{field.name}</span>
        <select value={String(value)} onChange={(event) => onChange(event.target.value)}>
          <option value="">Choose</option>
          {field.options.map((option, index) => (
            <option key={`${field.name}-${option}-${index}`} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="form-field">
      <span>{field.name}</span>
      <textarea value={String(value)} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function PdfPage({
  pdfDoc,
  sourcePageIndex,
  zoom,
  tool,
  annotations,
  annotationText,
  fields,
  formEdits,
  selectedSignatureAsset,
  onFormChange,
  onNeedSignature,
  onAddAnnotation
}: {
  pdfDoc: PDFDocumentProxy;
  sourcePageIndex: number;
  zoom: number;
  tool: Tool;
  annotations: PdfAnnotation[];
  annotationText: string;
  fields: PdfFormFieldSummary[];
  formEdits: Record<string, FormEdit>;
  selectedSignatureAsset?: SignatureAsset;
  onFormChange: (field: PdfFormFieldSummary, value: FormEdit["value"]) => void;
  onNeedSignature: () => void;
  onAddAnnotation: (annotation: PdfAnnotation) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<unknown> } | null>(null);
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [inkPoints, setInkPoints] = useState<Point[]>([]);
  const [widgets, setWidgets] = useState<PdfFormWidget[]>([]);

  useEffect(() => {
    let canceled = false;
    renderTaskRef.current?.cancel();

    pdfDoc.getPage(sourcePageIndex + 1).then(async (page) => {
      if (canceled || !canvasRef.current) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setPageSize({ width: baseViewport.width, height: baseViewport.height });
      const renderTask = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = renderTask;
      try {
        await renderTask.promise;
      } catch (error) {
        if (!isRenderCancel(error)) throw error;
      } finally {
        if (renderTaskRef.current === renderTask) renderTaskRef.current = null;
      }
    });

    getPageFormWidgets(pdfDoc, sourcePageIndex, fields)
      .then((pageWidgets) => {
        if (!canceled) setWidgets(pageWidgets);
      })
      .catch(() => {
        if (!canceled) setWidgets([]);
      });

    return () => {
      canceled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdfDoc, sourcePageIndex, zoom, fields]);

  const localPoint = useCallback((event: PointerEvent): Point => {
    const bounds = overlayRef.current!.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / zoom, y: (event.clientY - bounds.top) / zoom };
  }, [zoom]);

  function addQuickAnnotation(event: PointerEvent<HTMLDivElement>) {
    if (tool === "select" || tool === "ink") return;
    const point = localPoint(event);

    if (tool === "signature") {
      if (!selectedSignatureAsset) {
        onNeedSignature();
        return;
      }
      const size = signaturePlacementSize(selectedSignatureAsset);
      onAddAnnotation({
        id: createId("sig"),
        kind: "signature",
        pageIndex: sourcePageIndex,
        rect: { x: point.x, y: point.y, width: size.width, height: size.height },
        color: "ink",
        imageDataUrl: selectedSignatureAsset.imageDataUrl,
        signatureAsset: {
          assetId: selectedSignatureAsset.id,
          kind: selectedSignatureAsset.kind,
          mode: selectedSignatureAsset.mode,
          label: selectedSignatureAsset.label
        }
      });
      return;
    }

    if (tool === "text") {
      const text = annotationText.trim();
      if (!text) return;
      onAddAnnotation({
        id: createId("txt"),
        kind: "text",
        pageIndex: sourcePageIndex,
        rect: { x: point.x, y: point.y, width: 220, height: 34 },
        text,
        color: "blue"
      });
      return;
    }

    const shape: PdfAnnotation = {
      id: createId(tool),
      kind: tool,
      pageIndex: sourcePageIndex,
      rect:
        tool === "highlight"
          ? { x: point.x, y: point.y, width: 180, height: 24 }
          : tool === "note"
            ? { x: point.x, y: point.y, width: 120, height: 30 }
            : { x: point.x, y: point.y, width: 150, height: 90 },
      text: tool === "note" ? annotationText.trim() || "Note" : undefined,
      color: tool === "rectangle" ? "red" : tool === "note" ? "note" : "amber",
      opacity: tool === "highlight" ? 0.35 : 1
    };
    onAddAnnotation(shape);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (tool !== "ink") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setInkPoints([localPoint(event)]);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (tool !== "ink" || inkPoints.length === 0) return;
    setInkPoints((points) => [...points, localPoint(event)]);
  }

  function onPointerUp() {
    if (tool !== "ink" || inkPoints.length < 2) {
      setInkPoints([]);
      return;
    }
    const xs = inkPoints.map((point) => point.x);
    const ys = inkPoints.map((point) => point.y);
    onAddAnnotation({
      id: createId("ink"),
      kind: "ink",
      pageIndex: sourcePageIndex,
      rect: {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
      },
      points: inkPoints,
      color: "ink"
    });
    setInkPoints([]);
  }

  return (
    <div className="page-frame" style={{ width: pageSize.width * zoom, height: pageSize.height * zoom }}>
      <canvas ref={canvasRef} />
      <div
        ref={overlayRef}
        className={`annotation-layer tool-${tool}`}
        onClick={addQuickAnnotation}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {annotations.map((annotation) => (
          <AnnotationView key={annotation.id} annotation={annotation} zoom={zoom} />
        ))}
        {widgets.map((widget) => (
          <FormWidgetOverlay
            key={widget.id}
            widget={widget}
            zoom={zoom}
            edit={formEdits[widget.name]}
            onChange={(value) =>
              onFormChange(
                { name: widget.name, type: widget.type, value: widget.value, options: widget.options },
                value
              )
            }
          />
        ))}
        {inkPoints.length > 1 && <InkPreview points={inkPoints} zoom={zoom} />}
      </div>
    </div>
  );
}

function FormWidgetOverlay({
  widget,
  zoom,
  edit,
  onChange
}: {
  widget: PdfFormWidget;
  zoom: number;
  edit?: FormEdit;
  onChange: (value: FormEdit["value"]) => void;
}) {
  const value = edit?.value ?? widget.value;
  const style = {
    left: widget.rect.x * zoom,
    top: widget.rect.y * zoom,
    width: widget.rect.width * zoom,
    height: widget.rect.height * zoom
  };
  const stop = (event: SyntheticEvent) => event.stopPropagation();

  if (widget.type === "checkbox") {
    return (
      <label className="pdf-form-widget checkbox-widget" style={style} onClick={stop} onPointerDown={stop}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={widget.readOnly}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    );
  }

  if (widget.type === "radio") {
    const selected = String(value ?? "");
    const radioValue = widget.buttonValue ?? selected;
    return (
      <label className="pdf-form-widget checkbox-widget" style={style} onClick={stop} onPointerDown={stop}>
        <input
          type="radio"
          name={widget.name}
          value={radioValue}
          checked={selected === radioValue}
          disabled={widget.readOnly}
          onChange={(event) => event.target.checked && onChange(radioValue)}
        />
      </label>
    );
  }

  if ((widget.type === "dropdown" || widget.type === "optionList") && widget.options) {
    return (
      <select
        className="pdf-form-widget select-widget"
        style={style}
        value={Array.isArray(value) ? value[0] ?? "" : String(value ?? "")}
        disabled={widget.readOnly}
        onClick={stop}
        onPointerDown={stop}
        onChange={(event) => onChange(widget.type === "optionList" ? [event.target.value] : event.target.value)}
      >
        <option value="">Choose</option>
        {widget.options.map((option, index) => (
          <option key={`${widget.name}-${option}-${index}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (widget.type === "text") {
    const fontSize = fitTextWidgetFontSize(String(value ?? ""), widget.rect.width, widget.rect.height);
    return (
      <textarea
        className="pdf-form-widget text-widget"
        style={{ ...style, fontSize: fontSize * zoom }}
        value={String(value ?? "")}
        disabled={widget.readOnly}
        onClick={stop}
        onPointerDown={stop}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return null;
}

function AnnotationView({ annotation, zoom }: { annotation: PdfAnnotation; zoom: number }) {
  const style = {
    left: annotation.rect.x * zoom,
    top: annotation.rect.y * zoom,
    width: annotation.rect.width * zoom,
    height: annotation.rect.height * zoom
  };

  if (annotation.kind === "signature" && annotation.imageDataUrl) {
    return <img className="annotation signature" style={style} src={annotation.imageDataUrl} alt="Signature" />;
  }

  if (annotation.kind === "ink" && annotation.points) {
    return <InkPreview points={annotation.points} zoom={zoom} />;
  }

  return (
    <div className={`annotation ${annotation.kind} ${annotation.color}`} style={style}>
      {annotation.text}
    </div>
  );
}

function InkPreview({ points, zoom }: { points: Point[]; zoom: number }) {
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x * zoom} ${point.y * zoom}`).join(" ");
  return (
    <svg className="ink-preview">
      <path d={path} />
    </svg>
  );
}

function makeSnippet(text: string, hit: number, length: number): string {
  const start = Math.max(0, hit - 34);
  const end = Math.min(text.length, hit + length + 48);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function isRenderCancel(error: unknown): boolean {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

function fitTextWidgetFontSize(text: string, width: number, height: number): number {
  const normalized = text || " ";
  for (let fontSize = 15; fontSize >= 5; fontSize -= 0.5) {
    const charsPerLine = Math.max(1, Math.floor((width - 8) / (fontSize * 0.52)));
    const lines = normalized
      .split(/\n/)
      .map((line) => Math.max(1, Math.ceil(line.length / charsPerLine)))
      .reduce((total, lineCount) => total + lineCount, 0);

    if (lines * fontSize * 1.18 <= height - 4) return fontSize;
  }

  return 5;
}

export default App;
