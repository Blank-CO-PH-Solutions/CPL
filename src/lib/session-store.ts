import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface AuthSessionSnapshot {
  session: Session | null
  ready: boolean
}

const listeners = new Set<() => void>()
let snapshot: AuthSessionSnapshot = { session: null, ready: !supabase }
let authUnsubscribe: (() => void) | null = null
let consumers = 0
let generation = 0

function publish(next: AuthSessionSnapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot() {
  return snapshot
}

/** Starts one shared Supabase auth listener while the app is mounted. */
export function startAuthSessionStore() {
  consumers += 1

  if (supabase && !authUnsubscribe) {
    const currentGeneration = ++generation
    let authEventReceived = false
    publish({ ...snapshot, ready: false })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true
      publish({ session, ready: true })
    })
    authUnsubscribe = () => subscription.unsubscribe()

    void supabase.auth.getSession().then(({ data, error }) => {
      if (generation !== currentGeneration || authEventReceived) return
      publish({ session: error ? null : data.session, ready: true })
    }).catch(() => {
      if (generation === currentGeneration && !authEventReceived) {
        publish({ session: null, ready: true })
      }
    })
  }

  return () => {
    consumers = Math.max(0, consumers - 1)
    if (consumers === 0 && authUnsubscribe) {
      generation += 1
      authUnsubscribe()
      authUnsubscribe = null
    }
  }
}

export function useAuthSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
