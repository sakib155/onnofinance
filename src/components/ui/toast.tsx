import clsx from 'clsx'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; message: string; tone: 'success' | 'error' }

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="no-print fixed right-4 bottom-4 z-[60] flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'rounded-lg px-4 py-3 text-sm text-white shadow-lg',
              t.tone === 'error' ? 'bg-red-600' : 'bg-slate-900',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
