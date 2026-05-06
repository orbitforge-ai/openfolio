import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PDFCheckBox, PDFDropdown, PDFDocument, PDFOptionList, PDFRadioGroup, PDFTextField } from "pdf-lib";
import type { FormEdit, PdfFormFieldSummary, PdfFormWidget } from "../types";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function loadPdfDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  return pdfjsLib.getDocument({ data: bytes.slice().buffer }).promise;
}

export async function summarizeFormFields(bytes: Uint8Array): Promise<PdfFormFieldSummary[]> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdf.getForm();

  return form.getFields().map((field) => {
    const name = field.getName();

    if (field instanceof PDFTextField) {
      return { name, type: "text", value: field.getText() ?? "" };
    }

    if (field instanceof PDFCheckBox) {
      return { name, type: "checkbox", value: field.isChecked() };
    }

    if (field instanceof PDFRadioGroup) {
      return { name, type: "radio", value: field.getSelected() ?? "", options: field.getOptions() };
    }

    if (field instanceof PDFDropdown) {
      return { name, type: "dropdown", value: field.getSelected()[0] ?? "", options: field.getOptions() };
    }

    if (field instanceof PDFOptionList) {
      return { name, type: "optionList", value: field.getSelected(), options: field.getOptions() };
    }

    return { name, type: "unknown", value: "" };
  });
}

export async function getPageFormWidgets(
  pdfDoc: PDFDocumentProxy,
  pageIndex: number,
  fields: PdfFormFieldSummary[]
): Promise<PdfFormWidget[]> {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const annotations = await page.getAnnotations({ intent: "display" });
  const fieldMap = new Map(fields.map((field) => [field.name, field]));

  return annotations
    .filter((annotation) => annotation.subtype === "Widget" && annotation.fieldName && annotation.rect)
    .map((annotation) => {
      const field = fieldMap.get(annotation.fieldName);
      const type = resolveWidgetType(annotation, field);
      const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotation.rect);

      return {
        id: annotation.id ?? `${annotation.fieldName}-${annotation.rect.join("-")}`,
        name: annotation.fieldName,
        type,
        rect: {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1)
        },
        value: field?.value ?? widgetValue(annotation, type),
        options: field?.options ?? widgetOptions(annotation),
        buttonValue: annotation.buttonValue,
        readOnly: Boolean(annotation.readOnly)
      };
    });
}

function resolveWidgetType(annotation: Record<string, any>, field?: PdfFormFieldSummary): FormEdit["type"] {
  if (field && field.type !== "unknown") return field.type;

  if (annotation.fieldType === "Tx") return "text";
  if (annotation.fieldType === "Ch") return annotation.multiSelect ? "optionList" : "dropdown";
  if (annotation.fieldType === "Btn") {
    return annotation.radioButton ? "radio" : "checkbox";
  }

  return "unknown";
}

function widgetValue(annotation: Record<string, any>, type: FormEdit["type"]): FormEdit["value"] {
  if (type === "checkbox") {
    return Boolean(annotation.fieldValue && annotation.fieldValue !== "Off");
  }

  if (type === "optionList") {
    return Array.isArray(annotation.fieldValue) ? annotation.fieldValue : [];
  }

  return typeof annotation.fieldValue === "string" ? annotation.fieldValue : "";
}

function widgetOptions(annotation: Record<string, any>): string[] | undefined {
  if (!Array.isArray(annotation.options)) return undefined;

  return annotation.options.map((option: any) => {
    if (typeof option === "string") return option;
    return option.exportValue ?? option.displayValue ?? String(option);
  });
}
