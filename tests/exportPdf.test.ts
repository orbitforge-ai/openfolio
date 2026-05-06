import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { DocumentSession } from "../src/types";
import { createInitialPages } from "../src/lib/pageOperations";
import { exportPdf, exportSplitPdf } from "../src/lib/exportPdf";

async function makeSession(): Promise<DocumentSession> {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 300]).drawText("First");
  pdf.addPage([300, 300]).drawText("Second");

  return {
    id: "test",
    name: "test.pdf",
    bytes: await pdf.save(),
    pageCount: 2,
    pages: createInitialPages(2),
    selectedPage: 0,
    zoom: 1,
    dirty: false,
    annotations: [
      {
        id: "text",
        kind: "text",
        pageIndex: 0,
        rect: { x: 40, y: 40, width: 120, height: 30 },
        text: "Hello",
        color: "blue"
      }
    ],
    formEdits: {}
  };
}

describe("PDF export", () => {
  it("exports a valid PDF with the expected page count", async () => {
    const session = await makeSession();
    const bytes = await exportPdf(session);
    const exported = await PDFDocument.load(bytes);
    expect(exported.getPageCount()).toBe(2);
  });

  it("exports split pages", async () => {
    const session = await makeSession();
    const bytes = await exportSplitPdf(session, [1]);
    const exported = await PDFDocument.load(bytes);
    expect(exported.getPageCount()).toBe(1);
  });

  it("exports a visible signature annotation", async () => {
    const session = await makeSession();
    session.annotations.push({
      id: "signature",
      kind: "signature",
      pageIndex: 0,
      rect: { x: 40, y: 80, width: 120, height: 48 },
      color: "ink",
      imageDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8t6VwAAAABJRU5ErkJggg==",
      signatureAsset: {
        assetId: "asset-1",
        kind: "signature",
        mode: "typed",
        label: "Signature"
      }
    });

    const bytes = await exportPdf(session);
    const exported = await PDFDocument.load(bytes);
    expect(exported.getPageCount()).toBe(2);
  });

  it("persists text and checkbox form edits", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([300, 300]);
    const form = pdf.getForm();
    const name = form.createTextField("name");
    name.setText("Before");
    name.addToPage(page, { x: 30, y: 220, width: 160, height: 24 });
    const approved = form.createCheckBox("approved");
    approved.addToPage(page, { x: 30, y: 180, width: 16, height: 16 });

    const session: DocumentSession = {
      id: "form-test",
      name: "form.pdf",
      bytes: await pdf.save(),
      pageCount: 1,
      pages: createInitialPages(1),
      selectedPage: 0,
      zoom: 1,
      dirty: true,
      annotations: [],
      formEdits: {
        name: { name: "name", type: "text", value: "After" },
        approved: { name: "approved", type: "checkbox", value: true }
      }
    };

    const exported = await PDFDocument.load(await exportPdf(session));
    const exportedForm = exported.getForm();
    const exportedName = exportedForm.getTextField("name");
    expect(exportedName.getText()).toBe("After");
    expect(exportedName.isMultiline()).toBe(true);
    expect(exportedName.isScrollable()).toBe(false);
    expect(exportedForm.getCheckBox("approved").isChecked()).toBe(true);
  });
});
