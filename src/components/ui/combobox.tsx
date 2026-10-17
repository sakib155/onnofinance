import clsx from 'clsx'
import { ChevronDown, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export type Option = { value: string; label: string; hint?: string; search?: string }

// Searchable select for long lists (parties, items, lots)
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  clearable,
  className,
}: {
  value: string | null | undefined
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.hint ?? ''} ${o.search ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const pick = (o: Option) => {
    onChange(o.value)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <div
        className={clsx(
          'flex h-10 w-full items-center rounded-lg border border-slate-300 bg-white text-sm focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/20',
          disabled && 'bg-slate-100',
        )}
      >
        <input
          className="h-full min-w-0 flex-1 rounded-lg bg-transparent px-3 placeholder:text-slate-400 focus:outline-none"
          value={open ? query : (selected?.label ?? '')}
          placeholder={selected ? selected.label : (placeholder ?? t('common.select'))}
          disabled={disabled}
          onFocus={() => {
            setOpen(true)
            setActive(0)
          }}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter' && open && filtered[active]) {
              e.preventDefault()
              pick(filtered[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
        {clearable && value && !disabled ? (
          <button type="button" className="px-2 text-slate-400 hover:text-slate-700" onClick={() => onChange('')} aria-label="Clear">
            <X className="size-4" />
          </button>
        ) : (
          <ChevronDown className="mr-2 size-4 text-slate-400" />
        )}
      </div>
      {open && !disabled && (
        <ul className="absolute z-40 mt-1 max-h-64 w-full min-w-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{t('common.noMatch')}</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(o)
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx('cursor-pointer px-3 py-1.5 text-sm', i === active && 'bg-brand-50', o.value === value && 'font-medium text-brand-800')}
            >
              <div>{o.label}</div>
              {o.hint && <div className="text-xs text-slate-500">{o.hint}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
