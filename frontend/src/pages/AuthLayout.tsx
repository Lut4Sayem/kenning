import { useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import mark from '../assets/brand/kenning-mark-small.svg'
import Icon from '../ui/Icon'
import AuthStage from './AuthStage'
import s from './AuthLayout.module.css'

export function AuthLayout({ title, subtitle, alt, lead, children }: { title: string; subtitle?: string; alt?: ReactNode; lead?: ReactNode; children: ReactNode }) {
  const form = useRef<HTMLElement>(null)
  return (
    <div className={s.split}>
      <AuthStage form={form} />
      <div className={s.left}>
        <header className={s.brand}>
          <img className={s.logo} src={mark} alt="" width={30} height={30} />
          kenning
        </header>
        <main ref={form} className={s.formcol}>
          <p className={s.tagline}>Your team’s knowledge, in one place.</p>
          {lead}
          <h1 className={s.title}>{title}</h1>
          {subtitle && <p className={s.sub}>{subtitle}</p>}
          {children}
          {alt && <p className={s.alt}>{alt}</p>}
        </main>
        <footer className={s.foot}>
          <span>&copy; {new Date().getFullYear()} Kenning</span>
          <a href="https://github.com/Lut4Sayem/knowledgeforge-ai" target="_blank" rel="noopener noreferrer">
            Source on GitHub
          </a>
        </footer>
      </div>
    </div>
  )
}

type FieldProps = { label: string; error?: ReactNode; id: string; eye?: ReactNode } & InputHTMLAttributes<HTMLInputElement>

export function Field({ label, error, id, eye, ...props }: FieldProps) {
  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.label}>{label}</label>
      <div className={s.control}>
        <input id={id} className={s.input + (eye ? ' ' + s.hasEye : '')} aria-invalid={!!error} aria-describedby={error ? id + '-error' : undefined} {...props} />
        {eye}
      </div>
      {error && <div id={id + '-error'} role="alert" className={s.fieldError}>{error}</div>}
    </div>
  )
}

export function PasswordField(props: { label: string; error?: string; id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string }) {
  const [shown, setShown] = useState(false)
  const { onChange, ...rest } = props
  const eye = (
    <button type="button" className={s.eye} onClick={() => setShown(!shown)} aria-pressed={shown} aria-label={shown ? 'Hide password' : 'Show password'}>
      <Icon name={shown ? 'eye-off' : 'eye'} />
    </button>
  )
  return <Field {...rest} eye={eye} type={shown ? 'text' : 'password'} onChange={(e) => onChange(e.target.value)} />
}

export function FormError({ message }: { message: string }) {
  return message ? <div role="alert" className={s.formError}>{message}</div> : null
}

export function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return <button type="submit" className={s.submit} disabled={busy}>{busy ? busyLabel : label}</button>
}
