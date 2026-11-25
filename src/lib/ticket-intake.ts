import { createClient } from '@supabase/supabase-js'

// The landing page owns the support inbox. Its URL and anon key are publishable
// values (the anon key is already shipped in the public landing-page bundle);
// row-level security restricts reads to allowlisted admins only.
const intakeUrl = import.meta.env.VITE_INTAKE_SUPABASE_URL || 'https://xfegbsyinpiobwxomlor.supabase.co'
const intakeKey = import.meta.env.VITE_INTAKE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmZWdic3lpbnBpb2J3eG9tbG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NDA1NjgsImV4cCI6MjEwOTQxNjU2OH0.QSG5hZzW-HrGyO8ArPtiz9n2rR31aVHneOQZVK6Abwg'

export const intakeSupabase = createClient(intakeUrl, intakeKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

export interface TicketSender {
  name: string
  email: string
  company: string
}

export interface PortalTicket extends TicketSender {
  subject: string
  category: string
  message: string
}

function clip(value: string, min: number, max: number) {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (trimmed.length >= min) return trimmed.slice(0, max)
  return trimmed.padEnd(min, ' ').slice(0, max).trimEnd()
}

function clipMultiline(value: string, min: number, max: number) {
  const trimmed = value.trim()
  if (trimmed.length >= min) return trimmed.slice(0, max)
  return trimmed.padEnd(min, ' ').slice(0, max).trimEnd()
}

/**
 * Delivers a portal ticket to the landing-page admin inbox (`public.messages`).
 * The landing schema accepts anonymous inserts but only admins can read them.
 */
export async function sendTicketToAdmin(ticket: PortalTicket) {
  const email = clip(ticket.email, 3, 254)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address so our team can reply to this ticket.')
  }

  const subject = ticket.subject.trim() || 'Support request'
  const category = ticket.category.trim() || 'Other'
  const details = ticket.message.trim()
  const serviceInterest = clip(`CPL support · ${category} · ${subject}`, 10, 300)
  const message = clipMultiline(
    `Ticket subject: ${subject}\nCategory: ${category}\n\n${details}\n\nSubmitted from the Blank CO customer portal.`,
    20,
    500,
  )

  const name = clip(ticket.name || 'Customer', 2, 100)
  const company = clip(ticket.company || 'Customer portal', 2, 100)

  const { error } = await intakeSupabase.from('messages').insert({
    name: name.length >= 2 ? name : 'Customer',
    email,
    company: company.length >= 2 ? company : 'Customer portal',
    service_interest: serviceInterest,
    message,
    consent: true,
    is_read: false,
  })

  if (error) {
    throw new Error(`The ticket could not be delivered to Blank CO support: ${error.message}`)
  }
}
