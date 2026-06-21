import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  degrees,
  rgb
} from "pdf-lib";
import type { AddedTextField, DocumentSession, PdfAnnotation } from "../types";
import { visiblePages } from "./pageOperations";

const colorMap: Record<string, [number, number, number]> = {
  amber: [1, 0.75, 0.2],
  blue: [0.17, 0.45, 0.95],
  green: [0.1, 0.65, 0.35],
  red: [0.9, 0.2, 0.2],
  ink: [0.08, 0.1, 0.13],
  note: [1, 0.85, 0.25]
};

export async function exportPdf(session: DocumentSession): Promise<Uint8Array> {
  const source = await PDFDocument.load(session.bytes, { ignoreEncryption: true });
  applyFormEdits(source, session);

  if (!hasPageStructureChanges(session)) {
    applyAddedTextFields(source, session, visiblePages(session.pages));
    await applyAnnotations(source, session);
    return source.save();
  }

  const output = await PDFDocument.create();
  const pages = visiblePages(session.pages);

  for (const pageState of pages) {
    const [copied] = await output.copyPages(source, [pageState.sourceIndex]);
    copied.setRotation(degrees(pageState.rotation));
    output.addPage(copied);
  }

  applyAddedTextFields(output, session, pages);
  await applyAnnotations(output, session);

  return output.save();
}

function hasPageStructureChanges(session: DocumentSession): boolean {
  if (session.pages.length !== session.pageCount) return true;

  return session.pages.some((page, index) => {
    return page.deleted || page.sourceIndex !== index || page.rotation !== 0;
  });
}

export async function exportSplitPdf(session: DocumentSession, pageIndexes: number[]): Promise<Uint8Array> {
  const full = await PDFDocument.load(await exportPdf(session), { ignoreEncryption: true });
  const output = await PDFDocument.create();
  const copiedPages = await output.copyPages(full, pageIndexes);
  copiedPages.forEach((page) => output.addPage(page));
  return output.save();
}

function applyFormEdits(pdf: PDFDocument, session: DocumentSession): void {
  const form = pdf.getForm();

  for (const edit of Object.values(session.formEdits)) {
    const field = form.getFieldMaybe(edit.name);
    if (!field) continue;

    if (field instanceof PDFTextField && typeof edit.value === "string") {
      field.enableMultiline();
      field.disableScrolling();
      field.setText(edit.value);
    } else if (field instanceof PDFCheckBox && typeof edit.value === "boolean") {
      edit.value ? field.check() : field.uncheck();
    } else if (field instanceof PDFRadioGroup && typeof edit.value === "string") {
      field.select(edit.value);
    } else if (field instanceof PDFDropdown && typeof edit.value === "string") {
      field.select(edit.value);
    } else if (field instanceof PDFOptionList && Array.isArray(edit.value)) {
      field.select(edit.value);
    }
  }

  form.updateFieldAppearances();
}

function applyAddedTextFields(
  pdf: PDFDocument,
  session: DocumentSession,
  renderedPages: ReturnType<typeof visiblePages>
): void {
  if (session.addedTextFields.length === 0) return;

  const form = pdf.getForm();
  const outputPages = pdf.getPages();

  for (const addedField of session.addedTextFields) {
    const outputPageIndex = renderedPages.findIndex((page) => page.sourceIndex === addedField.pageIndex);
    const page = outputPages[outputPageIndex];
    if (!page) continue;

    const existingField = form.getFieldMaybe(addedField.name);
    if (existingField && !(existingField instanceof PDFTextField)) continue;

    const field = existingField instanceof PDFTextField ? existingField : form.createTextField(addedField.name);
    field.enableMultiline();
    field.disableScrolling();
    field.setText(addedField.value);

    const { x, y, width, height } = addedField.rect;
    field.addToPage(page, {
      x,
      y: page.getHeight() - y - height,
      width,
      height,
      textColor: rgb(0.06, 0.09, 0.16),
      borderColor: rgb(0.15, 0.39, 0.92),
      backgroundColor: rgb(1, 1, 1),
      borderWidth: 1
    });
    field.setFontSize(fitTextFieldFontSize(addedField));
  }

  form.updateFieldAppearances();
}

async function applyAnnotations(pdf: PDFDocument, session: DocumentSession): Promise<void> {
  const outputPages = pdf.getPages();
  const renderedPages = visiblePages(session.pages);

  for (const annotation of session.annotations) {
    const outputPageIndex = renderedPages.findIndex((page) => page.sourceIndex === annotation.pageIndex);
    const page = outputPages[outputPageIndex];
    if (!page) continue;

    const pageHeight = page.getHeight();
    const { x, y, width, height } = annotation.rect;
    const pdfY = pageHeight - y - height;

    if (annotation.kind === "text" || annotation.kind === "note") {
      page.drawText(annotation.text || (annotation.kind === "note" ? "Note" : ""), {
        x,
        y: pdfY + Math.max(4, height - 18),
        size: annotation.kind === "note" ? 11 : 14,
        color: asRgb(annotation.color),
        maxWidth: width
      });
    }

    if (annotation.kind === "highlight") {
      page.drawRectangle({
        x,
        y: pdfY,
        width,
        height,
        color: asRgb(annotation.color),
        opacity: annotation.opacity ?? 0.35
      });
    }

    if (annotation.kind === "rectangle") {
      page.drawRectangle({
        x,
        y: pdfY,
        width,
        height,
        borderColor: asRgb(annotation.color),
        borderWidth: 2,
        opacity: annotation.opacity ?? 1
      });
    }

    if (annotation.kind === "ink" && annotation.points && annotation.points.length > 1) {
      drawInkPath(page, annotation, pageHeight);
    }

    if (annotation.kind === "signature" && annotation.imageDataUrl) {
      const image = annotation.imageDataUrl.includes("image/png")
        ? await pdf.embedPng(annotation.imageDataUrl)
        : await pdf.embedJpg(annotation.imageDataUrl);
      page.drawImage(image, { x, y: pdfY, width, height });
    }
  }
}

function drawInkPath(page: ReturnType<PDFDocument["getPages"]>[number], annotation: PdfAnnotation, pageHeight: number): void {
  const points = annotation.points ?? [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    page.drawLine({
      start: { x: start.x, y: pageHeight - start.y },
      end: { x: end.x, y: pageHeight - end.y },
      thickness: 2,
      color: asRgb(annotation.color)
    });
  }
}

function asRgb(color: string) {
  const [r, g, b] = colorMap[color] ?? colorMap.ink;
  return rgb(r, g, b);
}

function fitTextFieldFontSize(field: AddedTextField): number {
  const normalized = field.value || " ";
  for (let fontSize = 15; fontSize >= 5; fontSize -= 0.5) {
    const charsPerLine = Math.max(1, Math.floor((field.rect.width - 8) / (fontSize * 0.52)));
    const lines = normalized
      .split(/\n/)
      .map((line) => Math.max(1, Math.ceil(line.length / charsPerLine)))
      .reduce((total, lineCount) => total + lineCount, 0);

    if (lines * fontSize * 1.18 <= field.rect.height - 4) return fontSize;
  }

  return 5;
}
