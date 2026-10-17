// Renders an element to a single-page-wide PDF, as tall as the content needs.
// html2canvas-pro is used because the styles use oklch() colours, which plain html2canvas cannot read.
export async function downloadPdf(el: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', width: el.scrollWidth, windowWidth: el.scrollWidth })
  const widthMm = 210
  const heightMm = Math.max(297, (canvas.height * widthMm) / canvas.width)
  const pdf = new jsPDF({ unit: 'mm', format: [widthMm, heightMm] })
  // JPEG keeps the file small enough to send on WhatsApp or email (PNG made a 5 MB invoice)
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, widthMm, (canvas.height * widthMm) / canvas.width)
  pdf.save(filename)
}
