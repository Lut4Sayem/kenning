import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import preview from '../assets/auth-preview.webp'
import Icon from '../ui/Icon'
import s from './AuthLayout.module.css'

export function AuthLayout({ title, subtitle, alt, children }: { title: string; subtitle?: string; alt?: ReactNode; children: ReactNode }) {
  return (
    <div className={s.split}>
      <div className={s.left}>
        <div className={s.brand}>
          <span className={s.logo}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M4 2.5h8v11l-4-2.8-4 2.8z" />
            </svg>
          </span>
          KnowledgeForge
        </div>
        <main className={s.formcol}>
          <h1 className={s.title}>{title}</h1>
          {subtitle && <p className={s.sub}>{subtitle}</p>}
          {children}
          {alt && <p className={s.alt}>{alt}</p>}
        </main>
        <footer className={s.foot}>
          <span>&copy; {new Date().getFullYear()} KnowledgeForge</span>
          <a href="https://github.com/Lut4Sayem/knowledgeforge-ai" target="_blank" rel="noopener noreferrer">
            Source on GitHub
          </a>
        </footer>
      </div>
      <div className={s.right} aria-hidden="true">
        <img className={s.shot} src={preview} alt="" width={1180} height={1300} />
      </div>
    </div>
  )
}

type FieldProps = { label: string; error?: string; id: string; eye?: ReactNode } & InputHTMLAttributes<HTMLInputElement>

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
