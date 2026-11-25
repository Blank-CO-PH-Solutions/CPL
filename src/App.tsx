import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  AlertTriangle, ArrowRight, Bell, Box, CalendarDays, Check,
  ChevronDown, Clock3, CreditCard, Download, FileText, Grid2X2, LockKeyhole, LogOut,
  Menu, MessageCircle, MoreHorizontal, Package, PanelLeftClose, PanelLeftOpen, Plus, ReceiptText, Search, Settings,
  Sparkles, Truck, X,
} from 'lucide-react'
import type { Activity, Invoice, Order, Page, Payment, PortalData, Profile } from './types'
import { createOrderRequest, createSupportTicket, loadPortalData, saveProfile } from './lib/portal-data'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { sendTicketToAdmin } from './lib/ticket-intake'
import { startAuthSessionStore, useAuthSession } from './lib/session-store'

const iconMap = {
  grid: Grid2X2, box: Box, receipt: ReceiptText, card: CreditCard, chat: MessageCircle, lock: LockKeyhole,
  settings: Settings, spark: Sparkles, search: Search, bell: Bell, menu: Menu,
  plus: Plus, download: Download, arrow: ArrowRight, calendar: CalendarDays,
  clock: Clock3, check: Check, file: FileText, alert: AlertTriangle, truck: Truck, bag: Package,
} as const
type IconName = keyof typeof iconMap

function Icon({ name, size = 17, className }: { name: IconName; size?: number; className?: string }) {
  const IconComponent = iconMap[name]
  return <IconComponent size={size} strokeWidth={1.7} className={className} aria-hidden="true" />
}

const emptyData = (): PortalData => ({
  orders: [], invoices: [], payments: [], tickets: [], activity: [],
  profile: { fullName: '', email: '', phone: '', company: '', address: '', taxId: '' },
})
const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(value)
const statusClass = (value: string) => value.toLowerCase().replaceAll(' ', '-')
const today = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const pageLabels: Record<Page, string> = { dashboard: 'Overview', orders: 'Orders', invoices: 'Invoices', payments: 'Payments', support: 'Support', settings: 'Settings' }
const staleDemoStorageKeys = ['blank-co-ph-solutions-demo-state', 'northstar-demo-state']

function clearStaleDemoData() {
  try { staleDemoStorageKeys.forEach(key => localStorage.removeItem(key)) } catch { /* Local storage is optional. */ }
}

function Badge({ children }: { children: string }) {
  return <span className={`status ${statusClass(children)}`}><i />{children}</span>
}

function Button({ children, onClick, primary = false, icon, className = '', type = 'button', disabled = false }: {
  children: ReactNode; onClick?: () => void; primary?: boolean; icon?: IconName; className?: string; type?: 'button' | 'submit'; disabled?: boolean
}) {
  return <button type={type} className={`button ${primary ? 'primary' : ''} ${className}`} onClick={onClick} disabled={disabled}>{icon && <Icon name={icon} size={14} />}{children}</button>
}

function PageHeading({ title, subtitle, action }: { title: ReactNode; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">CUSTOMER WORKSPACE</div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="heading-actions">{action}</div>}</div>
}

function PanelHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return <div className="panel-header"><div><div className="panel-title">{title}</div>{subtitle && <div className="panel-subtitle">{subtitle}</div>}</div>{right}</div>
}

function EmptyState({ title = 'No results found', message = 'Try changing your search or filter.', icon = 'file' as IconName }: { title?: string; message?: string; icon?: IconName }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} /></span><strong>{title}</strong><p>{message}</p></div>
}

function DataTable({ title, subtitle, headers, children, toolbar, right }: {
  title: string; subtitle: string; headers: string[]; children: ReactNode; toolbar?: ReactNode; right?: ReactNode
}) {
  return <section className="page-card table-panel"><PanelHeader title={title} subtitle={subtitle} right={right} />{toolbar}<div className="table-wrap"><table><thead><tr>{headers.map((heading, index) => <th key={`${heading}-${index}`}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div></section>
}

function ActivityRow({ item }: { item: Activity }) {
  const name = (item.icon in iconMap ? item.icon : 'file') as IconName
  return <div className="activity-item"><span className={`activity-icon ${item.tone}`}><Icon name={name} size={14} /></span><span className="activity-copy"><strong>{item.title}</strong><br />{item.text}</span><span className="activity-time">{item.time}</span></div>
}

function OrderProduct({ order }: { order: Order }) {
  return <div className="product-cell"><span className={`product-thumb ${order.thumb}`}>{order.emoji}</span><span><strong>{order.product}</strong><small>{order.category}</small></span></div>
}

function OrderRows({ orders, onSelect }: { orders: Order[]; onSelect: (id: string) => void }) {
  if (!orders.length) return <tr><td colSpan={7}><EmptyState /></td></tr>
  return <>{orders.map(order => <tr key={order.id}><td><span className="order-ref">{order.id}</span></td><td><OrderProduct order={order} /></td><td>{order.date}</td><td className="money">{money(order.amount)}</td><td><Badge>{order.status}</Badge></td><td><Badge>{order.payment === 'Paid' ? 'Paid' : order.payment === 'Partially paid' ? 'Partially paid' : 'Pending'}</Badge></td><td><button className="table-action" onClick={() => onSelect(order.id)} aria-label={`View ${order.id}`}><MoreHorizontal size={16} /></button></td></tr>)}</> 
}

function InvoiceRows({ invoices, orders, onPay, onDownload }: { invoices: Invoice[]; orders: Order[]; onPay: (id: string) => void; onDownload: (id: string) => void }) {
  if (!invoices.length) return <tr><td colSpan={8}><EmptyState /></td></tr>
  return <>{invoices.map(invoice => {
    const order = orders.find(item => item.id === invoice.order)
    const balance = Math.max(invoice.amount - invoice.paid, 0)
    return <tr key={invoice.id}><td><span className="order-ref">{invoice.id}</span></td><td><div className="invoice-detail"><span className={`product-thumb ${order?.thumb ?? 'thumb-one'}`}>{order?.emoji ?? '▤'}</span><span className="detail-copy"><strong>{invoice.order}</strong><small>{order?.product ?? 'Order invoice'}</small></span></div></td><td>{invoice.date}</td><td className={balance ? 'due' : ''}>{invoice.due}</td><td className="money">{money(invoice.amount)}</td><td className="money">{money(balance)}</td><td><Badge>{invoice.status}</Badge></td><td>{balance ? <button className="button compact primary" onClick={() => onPay(invoice.id)}>Pay now</button> : <button className="table-action" onClick={() => onDownload(invoice.id)} aria-label={`Download ${invoice.id}`}><Download size={15} /></button>}</td></tr>
  })}</>
}

function StatsCard({ label, value, icon, tone, foot }: { label: string; value: string; icon: IconName; tone: string; foot: ReactNode }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon name={icon} size={15} /></span></div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></article>
}

function Chart({ payments }: { payments: Payment[] }) {
  const completedPayments = payments.filter(payment => payment.status === 'Completed')
  if (!completedPayments.length) return <div className="chart-empty"><EmptyState title="No payment activity yet" message="Completed payments will appear here." icon="card" /></div>

  const now = new Date()
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
    const total = completedPayments.filter(payment => {
      const paidAt = new Date(payment.date)
      return !Number.isNaN(paidAt.getTime()) && paidAt.getFullYear() === date.getFullYear() && paidAt.getMonth() === date.getMonth()
    }).reduce((sum, payment) => sum + payment.amount, 0)
    return { label: date.toLocaleDateString('en-PH', { month: 'short' }), total }
  })
  const maxTotal = Math.max(...months.map(month => month.total))

  return <div className="spending-chart" role="img" aria-label="Completed payments by month over the last six months">
    {months.map(({ label, total }) => <div className="spending-month" key={label}>
      <span className="spending-value" title={money(total)}>{total ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 }).format(total) : '—'}</span>
      <span className="spending-bar-track"><span className="spending-bar" style={{ height: total ? `${Math.max(total / maxTotal * 100, 3)}%` : '0%' }} /></span>
      <span className="spending-month-label">{label}</span>
    </div>)}
  </div>
}

function AuthScreen({ onDemo }: { onDemo: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === 'register' && password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Your passwords do not match.' })
      return
    }
    if (!supabase) {
      setMessage({ type: 'error', text: 'Account access is not connected yet. Configure Supabase below to enable sign-up and login.' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const action = mode
      const result = action === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: fullName },
              emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
            },
          })

      if (result.error) {
        setMessage({ type: 'error', text: result.error.message })
      } else if (action === 'register' && !result.data.session) {
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        setMessage({ type: 'success', text: 'Account created. Check your email for a confirmation link, then sign in.' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not connect. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-screen"><section className="auth-card">
    <a className="brand auth-brand" href="#" aria-label="neostar — Blank CO PH Solutions"><span className="brand-mark"><Sparkles size={20} strokeWidth={1.9} /></span><span className="brand-copy"><strong>neostar</strong><small>BLANK CO PH SOLUTIONS</small></span></a>
    <div className="eyebrow">CUSTOMER WORKSPACE</div><h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
    <p className="auth-intro">{mode === 'login' ? 'Sign in to manage your orders, invoices, and support.' : 'Create an account to access your customer workspace.'}</p>
    {!isSupabaseConfigured && <div className="auth-demo-note"><strong>Account access needs Supabase.</strong><br />Add your Supabase URL and anon key to <code>.env</code> to enable real sign-up and login. You can still explore the demo below.</div>}
    <form className="settings-form auth-form" onSubmit={submit}>
      {mode === 'register' && <div className="field"><label htmlFor="authName">Full name</label><input id="authName" name="name" required autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} /></div>}
      <div className="field"><label htmlFor="authEmail">Email address</label><input id="authEmail" name="email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></div>
      <div className="field"><label htmlFor="authPassword">Password</label><input id="authPassword" name="password" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} /><small className="auth-hint">Use at least 8 characters.</small></div>
      {mode === 'register' && <div className="field"><label htmlFor="authConfirmPassword">Confirm password</label><input id="authConfirmPassword" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></div>}
      {message && <p className={`auth-message ${message.type}`} role="status">{message.text}</p>}
      <Button primary type="submit" disabled={busy || !isSupabaseConfigured}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</Button>
    </form>
    <button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage(null); setPassword(''); setConfirmPassword('') }}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
    <div className="auth-security"><LockKeyhole size={13} /> Secure customer workspace</div>
    <div className="auth-demo-divider"><span>OR</span></div>
    <Button onClick={onDemo}>Continue to demo</Button>
  </section></main>
}

type ModalKind = 'order' | 'ticket' | 'payment' | 'detail' | 'notifications' | 'password' | 'security' | null

export default function App() {
  const { session, ready: authReady } = useAuthSession()
  const [demoMode, setDemoMode] = useState(false)
  const [data, setData] = useState<PortalData>(emptyData)
  const [page, setPage] = useState<Page>('dashboard')
  const [query, setQuery] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [modal, setModal] = useState<ModalKind>(null)
  const [selectedId, setSelectedId] = useState('')
  const [toast, setToast] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [workspaceMenu, setWorkspaceMenu] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = window.localStorage.getItem('neostar-sidebar-collapsed') ?? window.localStorage.getItem('blcph-sidebar-collapsed')
      return stored === '1'
    } catch { return false }
  })
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width:800px)').matches)
  const workspaceMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    clearStaleDemoData()
    return startAuthSessionStore()
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width:800px)')
    const update = () => setIsNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!workspaceMenu) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!workspaceMenuRef.current?.contains(event.target as Node)) setWorkspaceMenu(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWorkspaceMenu(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [workspaceMenu])

  useEffect(() => {
    if (!session) setData(emptyData())
  }, [session])

  const userId = session?.user.id
  const refreshData = useCallback(async () => {
    if (!userId) return
    try {
      setData(await loadPortalData(userId))
    } catch (error) {
      showToast(error instanceof Error ? `Could not load Supabase data: ${error.message}` : 'Could not load Supabase data.')
    }
  }, [userId])

  useEffect(() => {
    if (userId) void refreshData()
  }, [userId, refreshData])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  function showToast(message: string) { setToast(message) }
  const displayName: string = data.profile.fullName || String(session?.user.user_metadata.full_name || 'Customer')
  const displayEmail = session?.user.email || data.profile.email || ''
  const company = data.profile.company || 'Blank CO PH Studio'
  const railMode = sidebarCollapsed || (isNarrow && !mobileMenu)
  const greetingName = displayName && displayName !== company ? displayName.split(/\s+/)[0] : ''
  const initials = displayName.split(/\s+/).map((value: string) => value[0]).slice(0, 2).join('').toUpperCase()

  useEffect(() => {
    document.title = `${page === 'dashboard' ? 'Overview' : pageLabels[page]} — Blank CO PH Solutions`
  }, [page])

  const unpaidCount = data.invoices.filter(invoice => invoice.amount > invoice.paid && invoice.status !== 'Cancelled').length
  const completedPayments = data.payments.filter(payment => payment.status === 'Completed')
  const totalPaid = completedPayments.reduce((total, payment) => total + payment.amount, 0)
  const filteredOrders = useMemo(() => data.orders.filter(order => {
    const matchesStatus = statusFilter === 'All statuses' || order.status === statusFilter
    return matchesStatus && (!query || `${order.id} ${order.product} ${order.category} ${order.status}`.toLowerCase().includes(query.toLowerCase()))
  }), [data.orders, query, statusFilter])
  const filteredInvoices = useMemo(() => data.invoices.filter(invoice => {
    return (!query || `${invoice.id} ${invoice.order} ${invoice.status}`.toLowerCase().includes(query.toLowerCase())) && (statusFilter === 'All statuses' || invoice.status === statusFilter)
  }), [data.invoices, query, statusFilter])

  function navigate(nextPage: Page) {
    setPage(nextPage); setQuery(''); setGlobalSearch(''); setStatusFilter('All statuses'); setMobileMenu(false); setWorkspaceMenu(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function setCollapsed(next: boolean) {
    setSidebarCollapsed(next)
    try {
      window.localStorage.setItem('neostar-sidebar-collapsed', next ? '1' : '0')
      window.localStorage.removeItem('blcph-sidebar-collapsed')
    } catch { /* Local storage is optional. */ }
  }
  function toggleSidebar() {
    setCollapsed(!sidebarCollapsed)
  }
  function updateDemoState(next: PortalData) {
    setData(next)
  }
  function goSearch(value: string) {
    setGlobalSearch(value)
    setQuery(value)
    if (value && page === 'dashboard') setPage('orders')
  }

  async function handleOrderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') || '').trim()
    const category = String(form.get('category') || 'Other')
    const description = String(form.get('description') || '')
    if (!title) return
    try {
      if (userId) await createOrderRequest(userId, title, category, description)
      else {
        const order: Order = { id: `ORD-DEMO-${Date.now().toString().slice(-5)}`, product: title, category, emoji: '✳', thumb: 'thumb-one', date: today(), amount: 0, status: 'Pending', payment: 'Pending' }
        updateDemoState({ ...data, orders: [order, ...data.orders] })
      }
      setModal(null); navigate('orders'); showToast('Your order request has been submitted.')
      if (userId) await refreshData()
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not submit order.') }
  }

  async function handleTicketSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') || '').trim()
    const category = String(form.get('category') || 'Other')
    const message = String(form.get('message') || '').trim()
    if (!title) return
    const sender = {
      name: userId ? displayName : String(form.get('name') || '').trim(),
      email: userId ? displayEmail : String(form.get('email') || '').trim(),
      company: data.profile.company || 'Customer portal',
    }
    if (!sender.email) {
      showToast('Add an email address so our team can reply to your ticket.')
      return
    }
    try {
      if (userId) {
        await createSupportTicket(userId, title, category, message, sender)
      } else {
        await sendTicketToAdmin({ ...sender, subject: title, category, message })
        const id = `TKT-DEMO-${Date.now().toString().slice(-5)}`
        const demoInitials = sender.name.split(/\s+/).map(value => value[0]).slice(0, 2).join('').toUpperCase() || 'C'
        updateDemoState({ ...data, tickets: [{ id, title, category, status: 'Open', updated: 'Updated just now', initials: demoInitials }, ...data.tickets] })
      }
      setModal(null); navigate('support'); showToast('Your support ticket was sent to the Blank CO team.')
      if (userId) await refreshData()
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not send support request.') }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const profile: Profile = {
      fullName: `${String(form.get('firstName') || '').trim()} ${String(form.get('lastName') || '').trim()}`.trim(),
      email: String(form.get('email') || '').trim(), phone: String(form.get('phone') || '').trim(),
      company: String(form.get('company') || '').trim(), address: String(form.get('address') || '').trim(), taxId: String(form.get('taxId') || '').trim(),
    }
    try {
      let emailNeedsConfirmation = false
      if (userId) {
        if (profile.email !== session?.user.email) {
          const { error } = await supabase!.auth.updateUser(
            { email: profile.email },
            { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
          )
          if (error) throw error
          emailNeedsConfirmation = true
        }
        await saveProfile(userId, profile)
      }
      updateDemoState({ ...data, profile })
      showToast(emailNeedsConfirmation ? 'Profile saved. Check your email to confirm the email-address change.' : userId ? 'Profile changes saved to Supabase.' : 'Profile changes applied for this demo session.')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not save profile.') }
  }

  function downloadBlob(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  function downloadInvoice(invoiceId: string) {
    const invoice = data.invoices.find(item => item.id === invoiceId)
    if (!invoice) return
    downloadBlob(`BLANK CO PH SOLUTIONS\nINVOICE COPY\n\nInvoice: ${invoice.id}\nOrder: ${invoice.order}\nIssued: ${invoice.date}\nDue: ${invoice.due}\nTotal: ${money(invoice.amount)}\nPaid: ${money(invoice.paid)}\nBalance: ${money(Math.max(invoice.amount - invoice.paid, 0))}\nStatus: ${invoice.status}`, `${invoice.id}.txt`, 'text/plain')
    showToast('Invoice copy downloaded as a text document.')
  }
  function downloadStatement() {
    const lines = ['Transaction,Invoice,Date,Method,Amount,Status', ...data.payments.map(payment => [payment.id, payment.invoice, payment.date, payment.method, payment.amount.toFixed(2), payment.status].map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))]
    downloadBlob(lines.join('\n'), 'blank-co-ph-solutions-payment-history.csv', 'text/csv')
    showToast('Payment history downloaded.')
  }
  function downloadReceipt(payment: Payment) {
    downloadBlob(`BLANK CO PH SOLUTIONS PAYMENT RECEIPT\n\nTransaction: ${payment.id}\nInvoice: ${payment.invoice}\nDate: ${payment.date}\nMethod: ${payment.method}\nAmount: ${money(payment.amount)}\nStatus: ${payment.status}`, `${payment.id}-receipt.txt`, 'text/plain')
    showToast('Payment receipt downloaded.')
  }

  if (isSupabaseConfigured && !authReady) return <div className="loading-screen">Loading your customer workspace…</div>
  if (!session && !demoMode) return <AuthScreen onDemo={() => {
    setData(emptyData())
    setDemoMode(true)
  }} />

  const due = data.invoices.reduce((total, invoice) => total + Math.max(invoice.amount - invoice.paid, 0), 0)
  const activeOrders = data.orders.filter(order => ['Processing', 'In progress', 'Shipped'].includes(order.status)).length
  const modalInvoice = data.invoices.find(invoice => invoice.id === selectedId)
  const modalOrder = data.orders.find(order => order.id === selectedId)

  return <div className={`app-shell ${mobileMenu ? 'mobile-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar-head">
        <a className="brand" href="#dashboard" onClick={event => { event.preventDefault(); if (sidebarCollapsed) { setCollapsed(false); return } if (isNarrow && !mobileMenu) { setMobileMenu(true); return } navigate('dashboard') }} aria-label={railMode ? 'Expand sidebar' : 'neostar — Blank CO PH Solutions home'} data-tooltip={railMode ? 'Expand sidebar' : 'Overview'}><span className="brand-mark"><Sparkles size={20} strokeWidth={1.9} /></span><span className="brand-copy"><strong>neostar</strong><small>BLANK CO PH SOLUTIONS</small></span></a>
        <button type="button" className="sidebar-toggle" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} data-tooltip={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
      </div>
      <div className="workspace-menu-wrap" ref={workspaceMenuRef}>
        <button type="button" className="workspace-switcher" onClick={() => setWorkspaceMenu(open => !open)} aria-haspopup="menu" aria-expanded={workspaceMenu} aria-label={`Workspace menu for ${company}`} data-tooltip={company}>
          <span className="workspace-avatar">{company.slice(0, 1).toUpperCase()}</span>
          <span className="workspace-copy"><strong>{company}</strong><small>Customer workspace</small></span>
          <ChevronDown className="switch-chevron" size={17} />
        </button>
        {workspaceMenu && <div className="workspace-menu" role="menu" aria-label="Workspace options">
          <div className="workspace-menu-label">WORKSPACE</div>
          <button type="button" className="workspace-menu-item selected" role="menuitem" onClick={() => navigate('dashboard')}>
            <span className="workspace-avatar">{company.slice(0, 1).toUpperCase()}</span>
            <span className="workspace-menu-copy"><strong>{company}</strong><small>Current workspace</small></span>
            <Check size={14} />
          </button>
          <div className="workspace-menu-separator" />
          <button type="button" className="workspace-menu-action" role="menuitem" onClick={() => navigate('settings')}><Settings size={14} /> Workspace settings</button>
          <button type="button" className="workspace-menu-action" role="menuitem" onClick={() => { setWorkspaceMenu(false); setModal('ticket') }}><MessageCircle size={14} /> Contact support</button>
          {session
            ? <button type="button" className="workspace-menu-action" role="menuitem" onClick={() => { setWorkspaceMenu(false); void supabase?.auth.signOut() }}><LogOut size={14} /> Sign out</button>
            : <button type="button" className="workspace-menu-action" role="menuitem" onClick={() => { setWorkspaceMenu(false); setDemoMode(false) }}><LockKeyhole size={14} /> Sign in / create account</button>}
        </div>}
      </div>
      <div className="nav-label"><span>WORKSPACE</span></div>
      <nav className="main-nav">{([['dashboard', 'Overview', 'grid'], ['orders', 'Orders', 'box'], ['invoices', 'Invoices', 'receipt'], ['payments', 'Payments', 'card']] as [Page, string, IconName][]).map(([key, label, icon]) => <button key={key} className={`nav-item ${page === key ? 'active' : ''}`} onClick={() => navigate(key)} aria-label={label} data-tooltip={label}><span className="nav-icon"><Icon name={icon} /></span><span className="nav-text">{label}</span>{key === 'orders' && <span className="nav-count">{data.orders.length}</span>}{key === 'invoices' && <span className="nav-count">{unpaidCount}</span>}</button>)}</nav>
      <div className="nav-label nav-label-spaced"><span>HELP &amp; ACCOUNT</span></div>
      <nav className="main-nav"><button className={`nav-item ${page === 'support' ? 'active' : ''}`} onClick={() => navigate('support')} aria-label="Support" data-tooltip="Support"><span className="nav-icon"><Icon name="chat" /></span><span className="nav-text">Support</span><span className="nav-dot" /></button><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')} aria-label="Settings" data-tooltip="Settings"><span className="nav-icon"><Icon name="settings" /></span><span className="nav-text">Settings</span></button></nav>
      <div className="sidebar-bottom">
        <button type="button" className="rail-help" onClick={() => setModal('ticket')} aria-label="Contact support" data-tooltip="Contact support"><Icon name="spark" size={16} /></button>
        <div className="help-card"><span className="help-card-icon"><Icon name="spark" size={15} /></span><strong>Need a hand?</strong><p>Our team is one message away.</p><button onClick={() => setModal('ticket')}>Contact support <span aria-hidden="true">↗</span></button></div>
        <button className="profile-button" onClick={() => navigate('settings')} aria-label="Account settings" data-tooltip={displayName || 'Account'}><span className="profile-avatar">{initials || 'C'}</span><span className="profile-copy"><strong>{displayName}</strong><small>{displayEmail || 'No email on file'}</small></span><MoreHorizontal className="profile-more" size={18} /></button>
        {session && <button className="signout-button" onClick={() => void supabase?.auth.signOut()} aria-label="Sign out" data-tooltip="Sign out"><LogOut size={14} /><span className="signout-label">Sign out</span></button>}
      </div>
    </aside>

    <main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Open navigation"><Icon name="menu" /></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{pageLabels[page]}</strong></div><div className="topbar-actions"><label className="search-box"><Icon name="search" /><input type="search" placeholder="Search anything..." aria-label="Search orders and invoices" value={globalSearch} onChange={event => goSearch(event.target.value)} /><kbd>⌘ K</kbd></label><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setModal('notifications')}><Icon name="bell" /><i /></button><span className="topbar-divider" /><span className="topbar-date">{today()}</span></div></header>
      <div className="content-wrap">
        {page === 'dashboard' && <>
          <PageHeading title={<>Good morning{greetingName ? `, ${greetingName}` : ''} <span aria-hidden="true">✦</span></>} subtitle="Here’s what’s happening with your account today." action={<Button primary icon="plus" onClick={() => setModal('order')}>New order</Button>} />
          <div className="stats-grid"><StatsCard label="Total orders" value={String(data.orders.length).padStart(2, '0')} icon="box" tone="green" foot="Across all statuses" /><StatsCard label="Active orders" value={String(activeOrders).padStart(2, '0')} icon="clock" tone="amber" foot={<span className="pending">{activeOrders ? `${activeOrders} currently in progress` : 'No active orders'}</span>} /><StatsCard label="Amount due" value={money(due)} icon="receipt" tone="blue" foot={<>Across {unpaidCount} outstanding invoice{unpaidCount === 1 ? '' : 's'}</>} /><StatsCard label="Total paid" value={money(totalPaid)} icon="card" tone="purple" foot={`Across ${completedPayments.length} completed payment${completedPayments.length === 1 ? '' : 's'}`} /></div>
          <div className="dashboard-grid"><section className="panel"><PanelHeader title="Payment activity" subtitle="Completed payments over the last six months" /><Chart payments={data.payments} /></section><section className="panel"><PanelHeader title="Recent activity" subtitle="Latest updates from your workspace" right={<button className="text-link" onClick={() => navigate('orders')}>View all</button>} /><div className="activity-list">{data.activity.length ? data.activity.slice(0, 4).map((item, index) => <ActivityRow key={`${item.title}-${index}`} item={item} />) : <EmptyState title="No recent activity" message="Updates will show up here." icon="bell" />}</div></section></div>
          <DataTable title="Recent orders" subtitle="A quick look at your latest orders" headers={['ORDER', 'PRODUCT / SERVICE', 'ORDER DATE', 'TOTAL', 'STATUS', 'PAYMENT', '']} right={<button className="text-link" onClick={() => navigate('orders')}>View all orders →</button>}><OrderRows orders={filteredOrders.slice(0, 4)} onSelect={id => { setSelectedId(id); setModal('detail') }} /></DataTable>
          <div className="bottom-grid"><section className="panel"><PanelHeader title="Outstanding invoices" subtitle="Invoices that need your attention" right={<button className="text-link" onClick={() => navigate('invoices')}>All invoices →</button>} /><div className="invoice-mini">{data.invoices.filter(invoice => invoice.amount > invoice.paid).length ? data.invoices.filter(invoice => invoice.amount > invoice.paid).map(invoice => <div className="invoice-mini-row" key={invoice.id}><div><div className="invoice-mini-id">{invoice.id}</div><div className="invoice-mini-sub">Due {invoice.due}</div></div><div className="invoice-mini-right"><strong>{money(invoice.amount - invoice.paid)}</strong><small className="due">{invoice.status === 'Overdue' ? 'Overdue' : 'Payment due'}</small></div></div>) : <EmptyState title="You're all caught up" message="No outstanding invoices." />}</div></section><section className="panel"><PanelHeader title="Payment reminder" subtitle="Don't miss an upcoming due date" right={<Icon name="calendar" />} />{data.invoices.some(invoice => invoice.amount > invoice.paid) ? <div className="reminder-card"><span className="reminder-icon"><Icon name="alert" size={14} /></span><span className="reminder-copy"><strong>Invoice {data.invoices.find(invoice => invoice.amount > invoice.paid)?.id}</strong><p>Payment due by {data.invoices.find(invoice => invoice.amount > invoice.paid)?.due}</p></span><span className="reminder-amount">{money(data.invoices.find(invoice => invoice.amount > invoice.paid)!.amount - data.invoices.find(invoice => invoice.amount > invoice.paid)!.paid)}</span></div> : <EmptyState title="No upcoming payments" message="We'll remind you when an invoice is due." />}</section></div>
        </>}

        {page === 'orders' && <><PageHeading title="Your orders" subtitle="Track progress, review order details, and see your full history." action={<Button primary icon="plus" onClick={() => setModal('order')}>Request an order</Button>} /><DataTable title="All orders" subtitle={`${data.orders.length} total orders`} headers={['ORDER', 'PRODUCT / SERVICE', 'ORDER DATE', 'TOTAL', 'STATUS', 'PAYMENT', '']} toolbar={<div className="toolbar"><div className="toolbar-left"><label className="inline-search"><Icon name="search" size={13} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search orders..." aria-label="Search orders" /></label></div><div className="toolbar-right"><select className="filter-select" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filter by status"><option>All statuses</option>{['Processing', 'In progress', 'Completed', 'Delivered', 'Shipped', 'Pending'].map(status => <option key={status}>{status}</option>)}</select><span className="toolbar-note">{filteredOrders.length} results</span></div></div>}><OrderRows orders={filteredOrders} onSelect={id => { setSelectedId(id); setModal('detail') }} /></DataTable></>}

        {page === 'invoices' && <><PageHeading title="Invoices & billing" subtitle="View invoices, keep track of due dates, and manage payments." action={<Button icon="download" onClick={downloadStatement}>Download statement</Button>} /><div className="invoice-cards"><div className="invoice-summary"><div className="invoice-summary-label">Outstanding balance</div><div className="invoice-summary-value">{money(due)}</div><div className="invoice-summary-note">Across {unpaidCount} unpaid invoice{unpaidCount === 1 ? '' : 's'}</div></div><div className="invoice-summary"><div className="invoice-summary-label">Paid invoices</div><div className="invoice-summary-value">{String(data.invoices.filter(invoice => invoice.status === 'Paid').length).padStart(2, '0')}</div><div className="invoice-summary-note">All time</div></div><div className="invoice-summary"><div className="invoice-summary-label">Overdue invoices</div><div className="invoice-summary-value">{String(data.invoices.filter(invoice => invoice.status === 'Overdue').length).padStart(2, '0')}</div><div className="invoice-summary-note">{data.invoices.some(invoice => invoice.status === 'Overdue') ? 'Please pay as soon as possible' : 'You’re all caught up'}</div></div></div><DataTable title="All invoices" subtitle={`${data.invoices.length} invoices`} headers={['INVOICE', 'ORDER', 'ISSUED', 'DUE DATE', 'TOTAL', 'BALANCE', 'STATUS', '']} toolbar={<div className="toolbar"><div className="toolbar-left"><label className="inline-search"><Icon name="search" size={13} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search invoices..." aria-label="Search invoices" /></label></div><div className="toolbar-right"><select className="filter-select" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filter by invoice status"><option>All statuses</option>{['Paid', 'Partially paid', 'Unpaid', 'Overdue'].map(status => <option key={status}>{status}</option>)}</select><span className="toolbar-note">{filteredInvoices.length} results</span></div></div>}><InvoiceRows invoices={filteredInvoices} orders={data.orders} onPay={id => { setSelectedId(id); setModal('payment') }} onDownload={downloadInvoice} /></DataTable></>}

        {page === 'payments' && <><PageHeading title="Payment history" subtitle="Every payment in one place. Download a receipt whenever you need it." action={<Button icon="download" onClick={downloadStatement}>Download history</Button>} /><div className="invoice-cards"><div className="invoice-summary"><div className="invoice-summary-label">Total payments</div><div className="invoice-summary-value">{String(completedPayments.length).padStart(2, '0')}</div><div className="invoice-summary-note">Successful transactions</div></div><div className="invoice-summary"><div className="invoice-summary-label">Total paid</div><div className="invoice-summary-value">{money(totalPaid)}</div><div className="invoice-summary-note">Since your account opened</div></div><div className="invoice-summary"><div className="invoice-summary-label">Payment methods</div><div className="invoice-summary-value">{new Set(completedPayments.map(payment => payment.method)).size}</div><div className="invoice-summary-note">From completed payments</div></div></div><DataTable title="Transactions" subtitle={`${data.payments.length} recorded payments`} headers={['TRANSACTION', 'INVOICE', 'DATE', 'PAYMENT METHOD', 'AMOUNT', 'STATUS', 'RECEIPT']} toolbar={<div className="toolbar"><div className="toolbar-left"><label className="inline-search"><Icon name="search" size={13} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search transactions..." aria-label="Search transactions" /></label></div><span className="toolbar-note">All times shown in your local timezone</span></div>}>
          {data.payments.filter(payment => !query || `${payment.id} ${payment.invoice} ${payment.method}`.toLowerCase().includes(query.toLowerCase())).map(payment => <tr key={payment.id}><td><span className="order-ref">{payment.id}</span></td><td>{payment.invoice}</td><td>{payment.date}</td><td>{payment.method}</td><td className="money">{money(payment.amount)}</td><td><Badge>{payment.status}</Badge></td><td><button className="table-action" onClick={() => downloadReceipt(payment)} aria-label="Download receipt"><Download size={15} /></button></td></tr>)}
          {!data.payments.length && <tr><td colSpan={7}><EmptyState title="No payments yet" message="Your completed payments will appear here." /></td></tr>}
        </DataTable></>}

        {page === 'support' && <><PageHeading title="How can we help?" subtitle="Get support from our team, or follow up on an existing request." action={<Button primary icon="plus" onClick={() => setModal('ticket')}>New support ticket</Button>} /><div className="support-grid"><section className="page-card"><PanelHeader title="Your support tickets" subtitle="Updates from our customer care team" right={<span className="toolbar-note">{data.tickets.length} tickets</span>} />{data.tickets.length ? data.tickets.map(ticket => <div className="ticket-row" key={ticket.id}><span className="ticket-avatar">{ticket.initials}</span><span className="ticket-copy"><strong>{ticket.title}</strong><small>{ticket.id} · {ticket.category}</small></span><span className="ticket-side"><Badge>{ticket.status}</Badge><small>{ticket.updated}</small></span></div>) : <EmptyState title="No support tickets yet" message="Contact us if there's anything we can help with." icon="chat" />}</section><section className="page-card"><PanelHeader title="Frequently asked" subtitle="A few quick answers to common questions" />{[['Where can I track my order?', 'Visit the Orders page for live status updates.'], ['How do I pay an invoice?', 'Open Invoices to review balances and due dates.'], ['Can I download a receipt?', 'Find any payment under Payment history.'], ['How do I update my billing details?', 'Edit your company profile in Settings.']].map(([title, text]) => <div className="settings-row" key={title}><div><strong>{title}</strong><small>{text}</small></div></div>)}</section></div></>}

        {page === 'settings' && <><PageHeading title="Account settings" subtitle="Manage your profile and how we keep you in the loop." action={<Button primary icon="check" type="submit" onClick={() => document.getElementById('profileSave')?.click()}>Save changes</Button>} /><div className="account-grid"><section className="page-card"><PanelHeader title="Personal information" subtitle="Your account contact details" /><form className="settings-form" onSubmit={event => void handleProfileSubmit(event)}><div className="field-grid"><div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" defaultValue={data.profile.fullName.split(' ')[0] || ''} /></div><div className="field"><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" defaultValue={data.profile.fullName.split(' ').slice(1).join(' ')} /></div></div><div className="field"><label htmlFor="email">Email address</label><input id="email" type="email" name="email" defaultValue={session?.user.email || data.profile.email || ''} /></div><div className="field"><label htmlFor="phone">Phone number</label><input id="phone" name="phone" defaultValue={data.profile.phone} /></div><div className="panel-header settings-subhead"><div><div className="panel-title">Company information</div><div className="panel-subtitle">Your business and billing details</div></div></div><div className="field"><label htmlFor="company">Company name</label><input id="company" name="company" defaultValue={company} /></div><div className="field"><label htmlFor="address">Billing address</label><input id="address" name="address" defaultValue={data.profile.address} /></div><div className="field"><label htmlFor="taxId">Tax ID <span className="field-help">(optional)</span></label><input id="taxId" name="taxId" defaultValue={data.profile.taxId} placeholder="Add a tax ID" /></div><button id="profileSave" type="submit" className="visually-hidden">Save profile</button></form></section><section><div className="page-card"><PanelHeader title="Notifications" subtitle="Choose what updates you receive" />{[['Order updates', 'Progress and delivery status'], ['Invoice reminders', 'Upcoming and overdue invoices'], ['Payment receipts', 'Confirmation of successful payments'], ['Product news', 'Tips and occasional announcements']].map(([title, text], index) => <div className="settings-row" key={title}><div><strong>{title}</strong><small>{text}</small></div><input className="toggle" type="checkbox" defaultChecked={index < 3} aria-label={title} /></div>)}</div><div className="page-card"><PanelHeader title="Security" subtitle="Keep your account protected" /><div className="settings-row"><div><strong>Password</strong><small>Manage your account password</small></div><Button onClick={() => setModal('password')}>Change</Button></div><div className="settings-row"><div><strong>Two-factor authentication</strong><small>Add another layer of security</small></div><Button onClick={() => setModal('security')}>Set up</Button></div></div></section></div></>}

        <footer className="footer"><span>© 2026 Blank CO PH Solutions</span><span>Secure customer workspace <span className="secure-check">✓</span></span><button onClick={() => navigate('support')}>Need help?</button></footer>
      </div>
    </main>

    {mobileMenu && <button className="sidebar-backdrop" onClick={() => setMobileMenu(false)} aria-label="Close navigation" />}
    {modal && <div className="modal-layer open" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null) }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div className="modal-head"><h2 id="modalTitle">{modal === 'order' ? 'Request a new order' : modal === 'ticket' ? 'Contact support' : modal === 'payment' ? 'Complete your payment' : modal === 'detail' ? `Order ${selectedId}` : modal === 'notifications' ? 'You’re all caught up' : modal === 'password' ? 'Change password' : 'Two-factor authentication'}</h2><button className="modal-close" onClick={() => setModal(null)} aria-label="Close"><X size={19} /></button></div>
      {modal === 'order' && <form onSubmit={event => void handleOrderSubmit(event)}><div className="modal-body"><p>Tell us a little about what you need. A member of our team will follow up to confirm scope and pricing.</p><div className="field"><label htmlFor="orderTitle">What do you need?</label><input id="orderTitle" name="title" required placeholder="e.g. Brand identity design" /></div><div className="field"><label htmlFor="orderDescription">A few details</label><textarea id="orderDescription" name="description" placeholder="Share a short description of your request" /></div><div className="field"><label htmlFor="orderCategory">Service type</label><select id="orderCategory" name="category">{['Design services', 'Digital services', 'Creative services', 'Consulting', 'Other'].map(option => <option key={option}>{option}</option>)}</select></div></div><div className="modal-footer"><Button onClick={() => setModal(null)}>Cancel</Button><Button primary type="submit">Send request</Button></div></form>}
      {modal === 'ticket' && <form onSubmit={event => void handleTicketSubmit(event)}><div className="modal-body"><p>Send our team a note and we'll get back to you as soon as possible. Your ticket is delivered to the Blank CO support inbox.</p>{!session && <div className="field-grid"><div className="field"><label htmlFor="ticketName">Your name</label><input id="ticketName" name="name" required maxLength={100} autoComplete="name" placeholder="Full name" /></div><div className="field"><label htmlFor="ticketEmail">Email address</label><input id="ticketEmail" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@company.com" /></div></div>}<div className="field"><label htmlFor="ticketSubject">Subject</label><input id="ticketSubject" name="title" required maxLength={100} placeholder="How can we help?" /></div><div className="field"><label htmlFor="ticketCategory">Topic</label><select id="ticketCategory" name="category">{['Order question', 'Billing', 'Account support', 'Technical issue', 'Other'].map(option => <option key={option}>{option}</option>)}</select></div><div className="field"><label htmlFor="ticketMessage">Message</label><textarea id="ticketMessage" name="message" required minLength={20} maxLength={500} rows={5} placeholder="Add a few details (at least 20 characters)..." /><small className="auth-hint">Include enough detail for the team to act on it. 20–500 characters.</small></div></div><div className="modal-footer"><Button onClick={() => setModal(null)}>Cancel</Button><Button primary type="submit">Send ticket</Button></div></form>}
      {modal === 'payment' && <><div className="modal-body"><p>Online payments are not connected yet. This invoice is read-only until a payment gateway is configured.</p>{modalInvoice && <div className="payment-total"><span>{modalInvoice.id} · Balance due</span><strong>{money(modalInvoice.amount - modalInvoice.paid)}</strong></div>}<div className="field-help"><Icon name="lock" size={13} /> No payment gateway is connected, so no payment can be submitted here.</div></div><div className="modal-footer"><Button onClick={() => setModal(null)}>Close</Button></div></>}
      {modal === 'detail' && <><div className="modal-body">{modalOrder && <><div className="settings-row modal-order-row"><div><strong>{modalOrder.product}</strong><small>{modalOrder.category} · Ordered {modalOrder.date}</small></div><Badge>{modalOrder.status}</Badge></div><div className="payment-total"><span>Order total</span><strong>{money(modalOrder.amount)}</strong></div><p>Payment status: <strong>{modalOrder.payment}</strong></p><p>Questions about this order? <button className="text-link" onClick={() => setModal('ticket')}>Contact our team →</button></p></>}</div><div className="modal-footer"><Button onClick={() => setModal(null)}>Close</Button></div></>}
      {modal === 'notifications' && <><div className="modal-body"><p>Your important order, billing, and support updates will show up here.</p><EmptyState title="No new notifications" message="Check back later for new updates." icon="bell" /></div><div className="modal-footer"><Button primary onClick={() => setModal(null)}>Done</Button></div></>}
      {(modal === 'password' || modal === 'security') && <><div className="modal-body"><p>{modal === 'password' ? 'Password reset is managed by Supabase Auth. Use the secure password-reset flow to change your password.' : 'Two-factor authentication configuration is not enabled in this project yet.'}</p></div><div className="modal-footer"><Button onClick={() => setModal(null)}>Close</Button></div></>}
    </section></div>}
    {toast && <div className="toast-region" aria-live="polite"><div className="toast">{toast}</div></div>}
  </div>
}
