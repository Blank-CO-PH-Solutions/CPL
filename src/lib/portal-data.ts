import type { PortalData, Profile } from '../types'
import { supabase } from './supabase'
import { sendTicketToAdmin, type TicketSender } from './ticket-intake'

type DbOrder = {
  id: string
  order_number: string
  product_name: string
  category: string
  total_amount: number | string
  status: string
  payment_status: string
  created_at: string
}

type DbInvoice = {
  id: string
  invoice_number: string
  order_id: string
  issued_at: string
  due_at: string
  total_amount: number | string
  amount_paid: number | string
  status: string
  orders?: { order_number: string } | { order_number: string }[] | null
}

type DbPayment = {
  id: string
  transaction_ref: string | null
  invoice_id: string
  paid_at: string | null
  payment_method: string
  amount: number | string
  status: string
  invoices?: { invoice_number: string } | { invoice_number: string }[] | null
}

type DbTicket = {
  id: string
  ticket_number: string
  subject: string
  category: string
  status: string
  created_at: string
}

type DbProfile = {
  full_name: string | null
  email: string | null
  phone: string | null
  company_name: string | null
  billing_address: string | null
  tax_id: string | null
}

function displayDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function amount(value: number | string | null | undefined) {
  return Number(value ?? 0)
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function loadPortalData(userId: string): Promise<PortalData> {
  const client = requireClient()
  const [profileResult, orderResult, invoiceResult, paymentResult, ticketResult] = await Promise.all([
    client.from('profiles').select('full_name,email,phone,company_name,billing_address,tax_id').eq('id', userId).maybeSingle(),
    client.from('orders').select('id,order_number,product_name,category,total_amount,status,payment_status,created_at').eq('customer_id', userId).order('created_at', { ascending: false }),
    client.from('invoices').select('id,invoice_number,order_id,issued_at,due_at,total_amount,amount_paid,status,orders(order_number)').eq('customer_id', userId).order('issued_at', { ascending: false }),
    client.from('payments').select('id,transaction_ref,invoice_id,paid_at,payment_method,amount,status,invoices(invoice_number)').eq('customer_id', userId).order('paid_at', { ascending: false }),
    client.from('support_tickets').select('id,ticket_number,subject,category,status,created_at').eq('customer_id', userId).order('created_at', { ascending: false }),
  ])

  for (const result of [profileResult, orderResult, invoiceResult, paymentResult, ticketResult]) {
    if (result.error) throw result.error
  }

  const dbProfile = profileResult.data as DbProfile | null
  const orders = (orderResult.data ?? []) as DbOrder[]
  const invoices = (invoiceResult.data ?? []) as DbInvoice[]
  const payments = (paymentResult.data ?? []) as DbPayment[]
  const tickets = (ticketResult.data ?? []) as DbTicket[]

  return {
    profile: {
      fullName: dbProfile?.full_name || 'Customer',
      email: dbProfile?.email || '',
      phone: dbProfile?.phone || '',
      company: dbProfile?.company_name || '',
      address: dbProfile?.billing_address || '',
      taxId: dbProfile?.tax_id || '',
    },
    orders: orders.map((order) => ({
      id: order.order_number,
      product: order.product_name,
      category: order.category,
      emoji: '✳',
      thumb: 'thumb-one',
      date: displayDate(order.created_at),
      amount: amount(order.total_amount),
      status: order.status,
      payment: order.payment_status,
    })),
    invoices: invoices.map((invoice) => ({
      id: invoice.invoice_number,
      order: (Array.isArray(invoice.orders) ? invoice.orders[0]?.order_number : invoice.orders?.order_number) ?? invoice.order_id,
      date: displayDate(invoice.issued_at),
      due: displayDate(invoice.due_at),
      amount: amount(invoice.total_amount),
      paid: amount(invoice.amount_paid),
      status: invoice.status,
    })),
    payments: payments.map((payment) => ({
      id: payment.transaction_ref || payment.id,
      invoice: (Array.isArray(payment.invoices) ? payment.invoices[0]?.invoice_number : payment.invoices?.invoice_number) ?? payment.invoice_id,
      date: displayDate(payment.paid_at),
      method: payment.payment_method,
      amount: amount(payment.amount),
      status: payment.status,
    })),
    tickets: tickets.map((ticket) => ({
      id: ticket.ticket_number,
      title: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      updated: `Updated ${displayDate(ticket.created_at)}`,
      initials: (dbProfile?.full_name || 'Customer').split(/\s+/).map((name) => name[0]).slice(0, 2).join('').toUpperCase(),
    })),
    activity: [],
  }
}

export async function createOrderRequest(userId: string, title: string, category: string, description: string) {
  const { error } = await requireClient().from('orders').insert({
    customer_id: userId,
    product_name: title,
    category,
    description,
    status: 'Pending',
    payment_status: 'Pending',
    total_amount: 0,
  })
  if (error) throw error
}

export async function createSupportTicket(
  userId: string,
  title: string,
  category: string,
  message: string,
  sender: TicketSender,
) {
  // Deliver to the landing-page admin inbox first so support staff receive every
  // request, then keep the customer-scoped copy that powers their ticket list.
  await sendTicketToAdmin({ ...sender, subject: title, category, message })

  const { error } = await requireClient().from('support_tickets').insert({
    customer_id: userId,
    subject: title,
    category,
    message,
    status: 'Open',
  })
  if (error) throw error
}

export async function saveProfile(userId: string, profile: Profile) {
  const { error } = await requireClient().from('profiles').update({
    full_name: profile.fullName,
    phone: profile.phone,
    company_name: profile.company,
    billing_address: profile.address,
    tax_id: profile.taxId,
    updated_at: new Date().toISOString(),
  }).eq('id', userId)
  if (error) throw error
}
