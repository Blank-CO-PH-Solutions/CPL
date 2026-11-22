export type Page = 'dashboard' | 'orders' | 'invoices' | 'payments' | 'support' | 'settings'

export interface Order {
  id: string
  product: string
  category: string
  emoji: string
  thumb: string
  date: string
  amount: number
  status: string
  payment: string
}

export interface Invoice {
  id: string
  order: string
  date: string
  due: string
  amount: number
  paid: number
  status: string
}

export interface Payment {
  id: string
  invoice: string
  date: string
  method: string
  amount: number
  status: string
}

export interface Ticket {
  id: string
  title: string
  category: string
  status: string
  updated: string
  initials: string
}

export interface Activity {
  icon: string
  tone: string
  title: string
  text: string
  time: string
}

export interface Profile {
  fullName: string
  email: string
  phone: string
  company: string
  address: string
  taxId: string
}

export interface PortalData {
  orders: Order[]
  invoices: Invoice[]
  payments: Payment[]
  tickets: Ticket[]
  activity: Activity[]
  profile: Profile
}
