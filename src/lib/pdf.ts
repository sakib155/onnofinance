// Renders an element to a single-page-wide PDF, as tall as the content needs.
export async function downloadPdf(el: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', width: el.scrollWidth, windowWidth: el.scrollWidth })
  const widthMm = 210
  const heightMm = Math.max(297, (canvas.height * widthMm) / canvas.width)
  const pdf = new jsPDF({ unit: 'mm', format: [widthMm, heightMm] })
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, (canvas.height * widthMm) / canvas.width)
  pdf.save(filename)
}
