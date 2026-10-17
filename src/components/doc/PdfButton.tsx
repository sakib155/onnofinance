import { Download } from 'lucide-react'
import { useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { errorMessage, useToast } from '@/components/ui/toast'
import { downloadPdf } from '@/lib/pdf'

// Downloads the document pages inside `target` as a PDF
export function PdfButton({ target, filename, label, variant = 'secondary' }: {
  target: RefObject<HTMLElement | null>
  filename: string
  label?: string
  variant?: 'primary' | 'secondary'
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant={variant}
      loading={busy}
      onClick={async () => {
        if (!target.current) return
        setBusy(true)
        try {
          await downloadPdf(target.current, filename)
        } catch (e) {
          toast(`${t('doc.pdfFailed')}: ${errorMessage(e)}`, 'error')
        } finally {
          setBusy(false)
        }
      }}
    >
      {!busy && <Download className="size-4" />}
      {label ?? 'PDF'}
    </Button>
  )
}
