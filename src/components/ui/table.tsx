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
}

export function Table<T>({
  columns,
  rows,
  loading,
  rowKey,
  onRowClick,
  empty,
  rowClassName,
}: {
  columns: Column<T>[]
  rows: T[] | undefined
  loading?: boolean
  rowKey: (row: T, i: number) => string
  onRowClick?: (row: T) => void
  empty?: ReactNode
  rowClassName?: (row: T) => string | undefined
}) {
  if (loading) return <Loading />
  if (!rows?.length) return <Empty>{empty}</Empty>
  const hasFooter = columns.some((c) => c.footer !== undefined)
  const align = (c: Column<T>) => (c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')
  return (
    <div className="overflow-x-auto">
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
    </div>
  )
}
