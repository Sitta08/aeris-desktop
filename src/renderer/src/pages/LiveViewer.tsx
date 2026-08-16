import { useEffect, useRef, useState } from 'react'

/**
 * Live viewer — embeds the Pi's dashboard_v5.html directly via Electron's
 * <webview> tag. The URL is hardcoded (in main/config.ts) for now so we can
 * confirm embedding works end-to-end before the dongle transport exists.
 */
export default function LiveViewer(): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const webviewRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    window.aeris.config.getDashboardUrl().then(setUrl)
  }, [])

  // <webview> reports load failure via the native 'did-fail-load' DOM event,
  // which React props don't cover — attach it directly.
  useEffect(() => {
    const el = webviewRef.current
    if (!el || !url) return
    const onFail = (): void => setFailed(true)
    el.addEventListener('did-fail-load', onFail)
    return () => el.removeEventListener('did-fail-load', onFail)
  }, [url])

  const showEmbed = url && !failed

  return (
    <div className="page page--flush">
      {showEmbed ? (
        <webview ref={webviewRef} key={url} src={url} className="live-webview" />
      ) : (
        <div className="page__empty">
          <div className="page__empty-icon">📡</div>
          <h2>{failed ? 'Cannot reach the dashboard' : 'Loading live view…'}</h2>
          <p className="muted">
            {url ? (
              <>
                Trying to embed <code>{url}</code>.<br />
                Make sure the Pi is running <code>server.py</code> and reachable.
              </>
            ) : (
              'Resolving dashboard URL…'
            )}
          </p>
        </div>
      )}
    </div>
  )
}
