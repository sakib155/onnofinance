// Turns document pages into a PDF: one PDF page per `.doc-page` element (or the element itself).
// html2canvas-pro is used because the styles use oklch() colours, which plain html2canvas cannot read.
async function build(root: HTMLElement) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const pages = root.classList.contains('doc-page') ? [root] : [...root.querySelectorAll<HTMLElement>('.doc-page')]
  if (!pages.length) pages.push(root)
  const widthMm = 210
  let pdf: InstanceType<typeof jsPDF> | null = null
  for (const page of pages) {
    const canvas = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', width: page.scrollWidth, windowWidth: page.scrollWidth })
    const heightMm = (canvas.height * widthMm) / canvas.width
    const format: [number, number] = [widthMm, Math.max(297, heightMm)]
    if (!pdf) pdf = new jsPDF({ unit: 'mm', format })
    else pdf.addPage(format)
    // JPEG keeps the file small enough to send on WhatsApp or email (PNG made a 5 MB invoice)
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, widthMm, heightMm)
  }
  return pdf!
}

// Pages shown shrunk on a phone go back to full size while they are captured
async function fullSize<T>(make: () => Promise<T>) {
  document.documentElement.classList.add('pdf-capture')
  try {
    return await make()
  } finally {
    document.documentElement.classList.remove('pdf-capture')
  }
}

export async function downloadPdf(root: HTMLElement, filename: string) {
  ;(await fullSize(() => build(root))).save(filename)
}

// Opens the PDF in a new tab, where it can be printed or shared
export async function openPdf(root: HTMLElement) {
  const url = (await fullSize(() => build(root))).output('bloburl')
  window.open(url, '_blank')
}
