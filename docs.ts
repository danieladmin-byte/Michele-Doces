import { supabase } from './supabase'
import logoImg from './logo.jpg'
import type { PdfData } from './pdf'
import type { Company, Customer, DocItem, OrderStatus, QuoteStatus } from './types'

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: 'good' | 'mid' | 'low' | 'none' }> = {
  DRAFT: { label: 'Rascunho', tone: 'none' },
  SENT: { label: 'Enviado', tone: 'mid' },
  APPROVED: { label: 'Aprovado', tone: 'good' },
  REJECTED: { label: 'Recusado', tone: 'low' },
  EXPIRED: { label: 'Vencido', tone: 'low' },
  CANCELLED: { label: 'Cancelado', tone: 'low' },
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'good' | 'mid' | 'low' | 'none' }> = {
  PENDING: { label: 'Pendente', tone: 'mid' },
  IN_PRODUCTION: { label: 'Em produção', tone: 'mid' },
  READY: { label: 'Pronto', tone: 'good' },
  DELIVERED: { label: 'Entregue', tone: 'good' },
  CANCELLED: { label: 'Cancelado', tone: 'low' },
}

export const DEFAULT_TERMS = ['50% Antecipado', '50% na Entrega']

/** Termos do PDF: uma linha por linha escrita em Configurações; sem nada, o padrão da Michele. */
export function termsOf(company: Company): string[] {
  const lines = (company.quote_terms ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.length ? lines : DEFAULT_TERMS
}

export function logoUrlOf(company: Company): string | null {
  return company.logo_path ? supabase.storage.from('company-logos').getPublicUrl(company.logo_path).data.publicUrl : null
}

type DocLike = {
  number: number
  issue_date?: string
  created_at: string
  valid_until?: string | null
  event_name: string | null
  subtotal: number
  discount: number
  shipping: number
  total: number
}

export function pdfDataFor(
  kind: PdfData['kind'],
  company: Company,
  customer: Customer | null,
  doc: DocLike,
  items: DocItem[],
): PdfData {
  return {
    kind,
    number: doc.number,
    date: (doc.issue_date ?? doc.created_at).slice(0, 10),
    validUntil: kind === 'ORCAMENTO' ? (doc.valid_until ?? null) : null,
    eventName: doc.event_name,
    customer: customer ? { name: customer.name, phone: customer.phone, city: customer.city } : null,
    items: items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      total_price: Number(i.total_price),
    })),
    subtotal: Number(doc.subtotal),
    discount: Number(doc.discount),
    shipping: Number(doc.shipping),
    total: Number(doc.total),
    terms: termsOf(company),
    phone: company.phone,
    instagram: company.instagram ?? null,
    logoUrl: logoUrlOf(company),
    fallbackLogoUrl: logoImg,
  }
}

export const pdfFileName = (kind: PdfData['kind'], number: number, customer: Customer | null) => {
  const who = customer
    ? `-${customer.name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')}`
    : ''
  return `${kind === 'FATURA' ? 'Fatura' : 'Orcamento'}-${String(number).padStart(2, '0')}${who}.pdf`
}
