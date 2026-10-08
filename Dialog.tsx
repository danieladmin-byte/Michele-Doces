import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode }

export function Dialog({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      {open && (
        <div className="dialog-body">
          <header className="dialog-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
              ×
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}
