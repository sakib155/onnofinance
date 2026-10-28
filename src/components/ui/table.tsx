import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Empty, Loading } from './layout'

export type Column<T> = {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  footer?: ReactNode
  // On a phone each row is a card: 'title' leads it, 'value' sits on its right, 'sub' goes under the
  // title without a label, 'hide' is left out, and the rest are listed below with their headers.
  // Without hints the first column is the title and the last right-aligned one the value.
  phone?: 'title' | 'value' | 'sub' | 'hide'
  // What the phone card shows instead of cell, when the two differ (say, nothing instead of a dash)
  phoneCell?: (row: T) => ReactNode
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[] | undefined
  loading?: boolean
  rowKey: (row: T, i: number) => string
  onRowClick?: (row: T) => void
  empty?: ReactNode
  rowClassName?: (row: T) => string | undefined
}

export function Table<T>(props: Props<T>) {
  const { columns, rows, loading, empty } = props
  if (loading) return <Loading />
  if (!rows?.length) return <Empty>{empty}</Empty>
  return (
    <>
      <div className="hidden overflow-x-auto sm:block print:block">
        <WideTable {...props} rows={rows} />
      </div>
      <div className="sm:hidden print:hidden">
        <PhoneList {...props} rows={rows} columns={columns} />
      </div>
    </>
  )
}

function WideTable<T>({ columns, rows, rowKey, onRowClick, rowClassName }: Props<T> & { rows: T[] }) {
  const hasFooter = columns.some((c) => c.footer !== undefined)
  const align = (c: Column<T>) => (c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
          {columns.map((c) => (
            <th key={c.key} className={clsx('px-3 py-2 font-medium whitespace-nowrap', align(c), c.className)}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={rowKey(r, i)}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            className={clsx('border-b border-slate-100 last:border-0', onRowClick && 'cursor-pointer hover:bg-slate-50', rowClassName?.(r))}
          >
            {columns.map((c) => (
              <td key={c.key} className={clsx('px-3 py-2', align(c), c.align === 'right' && 'tabular-nums whitespace-nowrap', c.className)}>
                {c.cell(r)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {hasFooter && (
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            {columns.map((c) => (
              <td key={c.key} className={clsx('px-3 py-2 tabular-nums whitespace-nowrap', align(c))}>
                {c.footer}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

const blank = (v: ReactNode) => v === null || v === undefined || v === false || v === ''
const show = <T,>(c: Column<T>, r: T) => (c.phoneCell ?? c.cell)(r)

function PhoneList<T>({ columns, rows, rowKey, onRowClick, rowClassName }: Props<T> & { rows: T[] }) {
  const shown = columns.filter((c) => c.phone !== 'hide')
  const hinted = shown.some((c) => c.phone === 'title' || c.phone === 'value')
  const title = shown.find((c) => c.phone === 'title') ?? (hinted ? undefined : shown[0])
  const value = shown.find((c) => c.phone === 'value') ?? (hinted ? undefined : [...shown].reverse().find((c) => c.align === 'right' && c !== title))
  const subs = shown.filter((c) => c.phone === 'sub')
  const rest = shown.filter((c) => c !== title && c !== value && c.phone !== 'sub')
  const footers = shown.filter((c) => c.footer !== undefined && !blank(c.footer))

  return (
    <div className="divide-y divide-slate-100">
      {rows.map((r, i) => {
        const sub = subs.map((c) => ({ key: c.key, v: show(c, r) })).filter((x) => !blank(x.v))
        const details = rest.map((c) => ({ c, v: show(c, r) })).filter((x) => !blank(x.v))
        return (
          <div
            key={rowKey(r, i)}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            className={clsx('px-3 py-3 text-sm', onRowClick && 'cursor-pointer active:bg-slate-50', rowClassName?.(r))}
          >
            {(title || value) && (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 font-medium text-slate-900">{title && show(title, r)}</div>
                {value && <div className="shrink-0 text-right font-semibold tabular-nums text-slate-900">{show(value, r)}</div>}
              </div>
            )}
            {sub.length > 0 && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                {sub.map((x, j) => (
                  <span key={x.key} className="inline-flex items-center gap-1.5">
                    {j > 0 && <span aria-hidden>·</span>}
                    {x.v}
                  </span>
                ))}
              </div>
            )}
            {details.length > 0 && (
              <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {details.map(({ c, v }) => (
                  <div key={c.key} className={clsx('min-w-0', !c.header && 'col-span-2')}>
                    {c.header && <dt className="text-slate-500">{c.header}</dt>}
                    <dd className={clsx('text-slate-800', c.align === 'right' && 'tabular-nums')}>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )
      })}
      {footers.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 bg-slate-50 px-3 py-3 text-xs">
          {footers.map((c) => (
            <div key={c.key}>
              <dt className="text-slate-500">{c.header}</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{c.footer}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
