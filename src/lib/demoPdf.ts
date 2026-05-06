import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";

export async function createDemoPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const form = pdf.getForm();

  const page1 = pdf.addPage([612, 792]);
  page1.drawText("PDF Forge Demo Form", { x: 54, y: 724, size: 24, font: bold, color: rgb(0.08, 0.12, 0.18) });
  page1.drawText("Use this sample to test fill, sign, annotate, search, split, and page tools.", {
    x: 54,
    y: 692,
    size: 11,
    font,
    color: rgb(0.28, 0.33, 0.4)
  });

  drawLabel(page1, "Full name", 54, 638, font);
  const name = form.createTextField("full_name");
  name.setText("Jordan Reader");
  name.addToPage(page1, { x: 54, y: 602, width: 240, height: 28 });

  drawLabel(page1, "Email", 318, 638, font);
  const email = form.createTextField("email");
  email.setText("jordan@example.com");
  email.addToPage(page1, { x: 318, y: 602, width: 240, height: 28 });

  drawLabel(page1, "Claim category", 54, 548, font);
  const category = form.createDropdown("claim_category");
  category.addOptions(["Travel delay", "Medical expense", "Lost luggage"]);
  category.select("Travel delay");
  category.addToPage(page1, { x: 54, y: 512, width: 240, height: 28 });

  const consent = form.createCheckBox("consent");
  consent.addToPage(page1, { x: 54, y: 458, width: 18, height: 18 });
  page1.drawText("I confirm this information is accurate.", { x: 82, y: 462, size: 11, font });

  page1.drawText("Search target: reimbursement, boarding pass, signature, receipt.", {
    x: 54,
    y: 382,
    size: 12,
    font,
    color: rgb(0.1, 0.28, 0.6)
  });

  const page2 = pdf.addPage([612, 792]);
  page2.drawText("Supporting Notes", { x: 54, y: 724, size: 22, font: bold });
  page2.drawText("This page is here for annotation and reorder testing.", { x: 54, y: 690, size: 12, font });
  page2.drawText("Try highlighting this sentence, drawing ink, or placing a note.", { x: 54, y: 650, size: 12, font });

  const page3 = pdf.addPage([612, 792]);
  page3.drawText("Signature Page", { x: 54, y: 724, size: 22, font: bold });
  page3.drawText("Place a visible signature below, then export the edited PDF.", { x: 54, y: 690, size: 12, font });
  page3.drawLine({ start: { x: 54, y: 574 }, end: { x: 310, y: 574 }, thickness: 1, color: rgb(0, 0, 0) });
  page3.drawText("Signature", { x: 54, y: 552, size: 10, font, color: rgb(0.35, 0.4, 0.48) });

  form.updateFieldAppearances(font);
  return pdf.save();
}

function drawLabel(page: PDFPage, text: string, x: number, y: number, font: PDFFont) {
  page.drawText(text, { x, y, size: 10, font, color: rgb(0.35, 0.4, 0.48) });
}
