import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../api/client'
import { AuthLayout, Field, FormError, PasswordField, SubmitButton } from './AuthLayout'
import { TeamBlock } from './Join'
import { safeNext } from './safeNext'
import { useInviteFor } from './useInviteFor'

export default function Login() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const invite = useInviteFor(next)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  // Already logged in (bookmarked login page): skip the form.
  useEffect(() => {
    api('/api/me', { redirectOn401: false }).then(() => window.location.assign(next), () => {})
  }, [next])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const errs: typeof errors = {}
    if (!email.trim()) errs.email = 'Enter your email.'
    if (!password) errs.password = 'Enter your password.'
    setErrors(errs)
    if (errs.email || errs.password) return

    setBusy(true)
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }), redirectOn401: false })
      window.location.assign(next)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setFormError("That email and password don't match. Check them and try again.")
      } else {
        setFormError(err instanceof ApiError ? "Couldn't log you in: " + err.message : "Can't reach the server. Check your connection and try again.")
      }
      setBusy(false)
      document.getElementById('password')?.focus() // QA-43: the disabled button dropped focus to <body>
    }
  }

  const registerUrl = '/register' + (params.get('next') ? '?next=' + encodeURIComponent(params.get('next')!) : '')
  return (
    <AuthLayout
      title={invite ? `Log in to join ${invite.teamName}` : 'Welcome back'}
      subtitle={invite ? 'New here? Create an account first. The invite stays open.' : 'Log in to pick up where you left off.'}
      lead={invite && <TeamBlock preview={invite} />}
      alt={<>New here? <Link to={registerUrl}>Create an account</Link></>}
    >
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <Field id="email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField id="password" label="Password" autoComplete="current-password" placeholder="Your password" value={password} error={errors.password} onChange={setPassword} />
        <SubmitButton busy={busy} label="Log in" busyLabel="Logging in…" />
      </form>
    </AuthLayout>
  )
}
