import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { DocumentSession } from "../src/types";
import { createInitialPages, deletePage } from "../src/lib/pageOperations";
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
    formEdits: {},
    addedTextFields: []
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
      },
      addedTextFields: []
    };

    const exported = await PDFDocument.load(await exportPdf(session));
    const exportedForm = exported.getForm();
    const exportedName = exportedForm.getTextField("name");
    expect(exportedName.getText()).toBe("After");
    expect(exportedName.isMultiline()).toBe(true);
    expect(exportedName.isScrollable()).toBe(false);
    expect(exportedForm.getCheckBox("approved").isChecked()).toBe(true);
  });

  it("exports added text inputs as editable PDF text fields", async () => {
    const session = await makeSession();
    session.addedTextFields.push({
      id: "field-1",
      name: "openfolio.input.1",
      pageIndex: 0,
      rect: { x: 40, y: 50, width: 180, height: 28 },
      value: "Editable answer"
    });

    const exported = await PDFDocument.load(await exportPdf(session));
    const field = exported.getForm().getTextField("openfolio.input.1");
    const widget = field.acroField.getWidgets()[0];
    const rect = widget.getRectangle();

    expect(field.getText()).toBe("Editable answer");
    expect(field.isMultiline()).toBe(true);
    expect(field.isScrollable()).toBe(false);
    expect(widget.P()?.toString()).toBe(exported.getPage(0).ref.toString());
    expect(rect.x).toBeGreaterThanOrEqual(39);
    expect(rect.x).toBeLessThanOrEqual(40);
    expect(rect.y).toBeGreaterThanOrEqual(221);
    expect(rect.y).toBeLessThanOrEqual(222);
    expect(rect.width).toBeGreaterThanOrEqual(180);
    expect(rect.width).toBeLessThanOrEqual(181);
    expect(rect.height).toBeGreaterThanOrEqual(28);
    expect(rect.height).toBeLessThanOrEqual(29);
  });

  it("exports added text inputs after page structure changes", async () => {
    const session = await makeSession();
    session.pages = deletePage(session.pages, 0);
    session.addedTextFields.push(
      {
        id: "removed-field",
        name: "openfolio.input.removed",
        pageIndex: 0,
        rect: { x: 20, y: 30, width: 120, height: 24 },
        value: "Removed"
      },
      {
        id: "kept-field",
        name: "openfolio.input.kept",
        pageIndex: 1,
        rect: { x: 30, y: 40, width: 150, height: 24 },
        value: "Kept"
      }
    );

    const exported = await PDFDocument.load(await exportPdf(session));
    const exportedForm = exported.getForm();
    const keptField = exportedForm.getTextField("openfolio.input.kept");
    const keptWidget = keptField.acroField.getWidgets()[0];

    expect(exported.getPageCount()).toBe(1);
    expect(exportedForm.getFieldMaybe("openfolio.input.removed")).toBeUndefined();
    expect(keptField.getText()).toBe("Kept");
    expect(keptWidget.P()?.toString()).toBe(exported.getPage(0).ref.toString());
  });
});
