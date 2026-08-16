import { useEffect, useState } from 'react'
import type { AutomationRule, AutomationRulesConfig, AutomationTrigger } from '@shared/types'
import './automation-rules.css'

const TRIGGERS: Array<{ key: AutomationTrigger; label: string; hint: string }> = [
  { key: 'no_mask', label: 'No Mask', hint: 'เมื่อเจอคนไม่สวมหน้ากาก' },
  { key: 'improper_mask', label: 'Improper Mask', hint: 'เมื่อเจอคนสวมหน้ากากไม่ถูกต้อง' }
]

export default function AutomationRules(): JSX.Element {
  const [config, setConfig] = useState<AutomationRulesConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'apply' | 'reset' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    window.aeris.api
      .getAutomationRules()
      .then((next) => active && setConfig(next))
      .catch((e: unknown) => active && setError(errMsg(e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const setEnabled = (enabled: boolean): void => {
    if (!config) return
    setConfig({ ...config, enabled })
  }

  const updateRule = <K extends keyof AutomationRule>(
    trigger: AutomationTrigger,
    key: K,
    value: AutomationRule[K]
  ): void => {
    if (!config) return
    setConfig({
      ...config,
      rules: {
        ...config.rules,
        [trigger]: {
          ...config.rules[trigger],
          [key]: value
        }
      }
    })
  }

  const apply = async (): Promise<void> => {
    if (!config) return
    setBusy('apply')
    setError(null)
    try {
      const next = await window.aeris.api.applyAutomationRules(config)
      setConfig(next)
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const reset = async (): Promise<void> => {
    setBusy('reset')
    setError(null)
    try {
      const next = await window.aeris.api.resetAutomationRules()
      setConfig(next)
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null || loading || !config

  return (
    <div className="page">
      <div className="auto">
        <header className="auto__head">
          <div>
            <h1 className="auto__title">Automation Rules</h1>
            <div className="auto__sub">detection event → motor sequence / TTS / cooldown</div>
          </div>
          <label className="auto-switch">
            <input
              type="checkbox"
              checked={Boolean(config?.enabled)}
              disabled={disabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Automation</span>
          </label>
        </header>

        <div className="auto__notice">
          ตอนนี้เป็น mock config สำหรับจัด UI ก่อน ฝั่ง Pi ต้องทำ endpoint เพื่อ persist และ apply
          ค่าเหล่านี้กับ detection pipeline จริง
        </div>

        {error && <div className="auto__error">Automation API error: {error}</div>}

        {loading || !config ? (
          <section className="auto__empty">กำลังโหลด automation rules…</section>
        ) : (
          <section className="auto__grid">
            {TRIGGERS.map((trigger) => {
              const rule = config.rules[trigger.key]
              return (
                <article className="auto-card" key={trigger.key}>
                  <div className="auto-card__head">
                    <div>
                      <h2>{trigger.label}</h2>
                      <p>{trigger.hint}</p>
                    </div>
                    <label className="auto-switch auto-switch--small">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        disabled={disabled}
                        onChange={(e) => updateRule(trigger.key, 'enabled', e.target.checked)}
                      />
                      <span>Enabled</span>
                    </label>
                  </div>

                  <div className="auto-field">
                    <div className="auto-field__head">
                      <label htmlFor={`${trigger.key}-cooldown`}>Cooldown</label>
                      <output>{rule.cooldown_sec}s</output>
                    </div>
                    <input
                      id={`${trigger.key}-cooldown`}
                      type="range"
                      min="1"
                      max="120"
                      step="1"
                      value={rule.cooldown_sec}
                      disabled={disabled}
                      onChange={(e) =>
                        updateRule(trigger.key, 'cooldown_sec', Number(e.target.value))
                      }
                    />
                  </div>

                  <label className="auto-check">
                    <input
                      type="checkbox"
                      checked={rule.play_motor_sequence}
                      disabled={disabled}
                      onChange={(e) =>
                        updateRule(trigger.key, 'play_motor_sequence', e.target.checked)
                      }
                    />
                    <span>Play motor sequence</span>
                  </label>

                  <div className="auto-input">
                    <label htmlFor={`${trigger.key}-sequence`}>Sequence name</label>
                    <input
                      id={`${trigger.key}-sequence`}
                      value={rule.sequence_name}
                      disabled={disabled || !rule.play_motor_sequence}
                      onChange={(e) => updateRule(trigger.key, 'sequence_name', e.target.value)}
                    />
                  </div>

                  <label className="auto-check">
                    <input
                      type="checkbox"
                      checked={rule.trigger_tts}
                      disabled={disabled}
                      onChange={(e) => updateRule(trigger.key, 'trigger_tts', e.target.checked)}
                    />
                    <span>Trigger TTS warning</span>
                  </label>

                  <div className="auto-input">
                    <label htmlFor={`${trigger.key}-tts`}>TTS message</label>
                    <input
                      id={`${trigger.key}-tts`}
                      value={rule.tts_message}
                      disabled={disabled || !rule.trigger_tts}
                      onChange={(e) => updateRule(trigger.key, 'tts_message', e.target.value)}
                    />
                  </div>

                  <label className="auto-check">
                    <input
                      type="checkbox"
                      checked={rule.skip_if_motor_busy}
                      disabled={disabled}
                      onChange={(e) =>
                        updateRule(trigger.key, 'skip_if_motor_busy', e.target.checked)
                      }
                    />
                    <span>Skip while motor is busy</span>
                  </label>
                </article>
              )
            })}
          </section>
        )}

        <footer className="auto__actions">
          <button type="button" className="auto__primary" onClick={() => void apply()} disabled={disabled}>
            {busy === 'apply' ? 'Applying…' : 'Apply'}
          </button>
          <button type="button" className="auto__secondary" onClick={() => void reset()} disabled={disabled}>
            {busy === 'reset' ? 'Resetting…' : 'Reset'}
          </button>
          <span className="auto__saved">
            {savedAt ? `บันทึกแล้ว · ${savedAt}` : `อัปเดตล่าสุด: ${formatTime(config?.updated_at)}`}
          </span>
          <ApplyReceipt
            message={config?.apply_status?.message}
            detail={config?.apply_status?.detail}
            at={config?.apply_status?.applied_at}
          />
        </footer>
      </div>
    </div>
  )
}

function ApplyReceipt({
  message,
  detail,
  at
}: {
  message?: string
  detail?: string
  at?: string
}): JSX.Element {
  return (
    <div className={`auto-receipt ${message ? 'is-live' : ''}`}>
      <span className="auto-receipt__dot" />
      <strong>{message ? 'Apply Confirmed' : 'Waiting for Pi'}</strong>
      <span>{detail ?? 'หลัง Apply ตรงนี้จะแสดงว่า backend ใช้ rules ล่าสุดแล้ว'}</span>
      {at && <em>{formatTime(at)}</em>}
    </div>
  )
}

function formatTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString() : '—'
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
