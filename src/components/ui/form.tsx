import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const control =
  'w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-100 disabled:text-slate-500'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(control, 'h-10', rest.type === 'number' && 'num', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={clsx(control, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={clsx(control, 'py-2', className)} rows={2} {...rest} />
})

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label?: ReactNode
  error?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  )
}

export function Checkbox({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 rounded border-slate-300 accent-brand-700" {...rest} />
      {label}
    </label>
  )
}

// Optional fields folded behind one line until needed; they open by themselves once one has a value
// and then stay open.
export function MoreFields({ label, filled, children }: { label: ReactNode; filled?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  if (filled && !open) setOpen(true)
  if (open || filled) return <>{children}</>
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="col-span-full flex items-center gap-1.5 justify-self-start text-left text-sm font-medium text-brand-700 hover:text-brand-800"
    >
      <Plus className="size-4 shrink-0" />
      {label}
    </button>
  )
}
