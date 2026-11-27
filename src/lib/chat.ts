import { supabase } from './supabase'
import { intakeSupabase } from './ticket-intake'

export type ChatReply = {
  id: string
  author: 'customer' | 'admin'
  name: string
  body: string
  createdAt: string
}

export type ChatThread = {
  id: string
  subject: string
  name: string
  email: string
  company: string
  createdAt: string
  lastReplyAt: string
  replyCount: number
}

export type ChatConversation = {
  thread: ChatThread
  replies: ChatReply[]
  role: 'admin' | 'customer'
}

async function portalHeaders() {
  if (!supabase) throw new Error('The customer portal is not configured for chat.')
  const { data, error } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (error || !token) throw new Error('Sign in to read and reply to your support chats.')
  return { 'x-portal-token': token }
}

async function chatRequest(body: Record<string, unknown>) {
  const headers = await portalHeaders()
  const { data, error } = await intakeSupabase.functions.invoke('chat', { body, headers })
  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
  return data as Record<string, unknown>
}

export async function listChatThreads(): Promise<ChatThread[]> {
  const data = await chatRequest({ action: 'threads' })
  return (data.threads as ChatThread[]) || []
}

export async function findChatThread(subject: string): Promise<string | null> {
  const data = await chatRequest({ action: 'findThread', subject })
  return (data.threadId as string | null) || null
}

export async function getChatThread(threadId: string): Promise<ChatConversation> {
  return (await chatRequest({ action: 'thread', threadId })) as unknown as ChatConversation
}

export async function sendChatReply(threadId: string, body: string): Promise<void> {
  await chatRequest({ action: 'reply', threadId, body })
}
