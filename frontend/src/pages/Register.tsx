import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../api/client'
import { AuthLayout, Field, FormError, PasswordField, SubmitButton } from './AuthLayout'
import { DEFAULT_NEXT, safeNext } from './safeNext'
import { toast } from '../ui/Toast'
import { TeamBlock } from './Join'
import { useInviteFor } from './useInviteFor'

type Errors = Partial<Record<'fullName' | 'password' | 'confirm', string>> & { email?: ReactNode }

export default function Register() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const rawNext = params.get('next')
  const invite = useInviteFor(safeNext(rawNext))
  const loginUrl = '/login' + (rawNext && safeNext(rawNext) !== DEFAULT_NEXT ? '?next=' + encodeURIComponent(safeNext(rawNext)) : '')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/api/me', { redirectOn401: false }).then(() => window.location.assign(DEFAULT_NEXT), () => {})
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const errs: Errors = {}
    if (!fullName.trim()) errs.fullName = 'Enter your full name.'
    if (!email.trim()) errs.email = 'Enter your email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter an email like name@example.com.'
    if (!password) errs.password = 'Choose a password.'
    else if (password.length < 8) errs.password = 'Use at least 8 characters.'
    if (!confirm) errs.confirm = 'Type your password again.'
    else if (confirm !== password) errs.confirm = "Passwords don’t match."
    setErrors(errs)
    if (Object.keys(errs).length) return

    setBusy(true)
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim(), password }),
        redirectOn401: false,
      })
      // The server signs the new account in (QA-01): go on to the invite or Home inside the app, so the welcome stays on screen.
      const next = safeNext(rawNext)
      if (/^\/app(\/|$)/.test(next)) navigate(next.slice(4) || '/')
      else window.location.assign(next)
      toast(`Welcome to KnowledgeForge, ${fullName.trim().split(/\s+/)[0]}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors({ email: <>That email already has an account. <Link to={loginUrl}>Log in instead</Link></> })
      else setFormError(err instanceof ApiError ? "Couldn’t create your account: " + err.message : "Can’t reach the server. Check your connection and try again.")
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={invite ? `Create an account to join ${invite.teamName}` : 'Create your account'}
      subtitle={invite ? 'Then ask to join. An admin approves each request.' : 'Write things down once. Your team finds them later.'}
      lead={invite && <TeamBlock preview={invite} />}
      alt={<>Already have an account? <Link to={loginUrl}>Log in</Link></>}
    >
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <Field id="fullName" label="Full name" autoComplete="name" placeholder="Your name" value={fullName} error={errors.fullName} onChange={(e) => setFullName(e.target.value)} />
        <Field id="email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField id="password" label="Password" autoComplete="new-password" placeholder="At least 8 characters" value={password} error={errors.password} onChange={setPassword} />
        <PasswordField id="confirmPassword" label="Confirm password" autoComplete="new-password" placeholder="Type it again" value={confirm} error={errors.confirm} onChange={setConfirm} />
        <SubmitButton busy={busy} label="Create account" busyLabel="Creating account…" />
      </form>
    </AuthLayout>
  )
}
