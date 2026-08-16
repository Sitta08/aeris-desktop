import type { ComponentType, ReactNode } from 'react'
import type { Role } from '@shared/types'
import LiveViewer from './LiveViewer'
import Dashboard from './Dashboard'
import Graphs from './Graphs'
import Settings from './Settings'
import StepperControl from './StepperControl'
import Terminal from './Terminal'
import TrackingTuner from './TrackingTuner'
import SystemDiagnostics from './SystemDiagnostics'
import EventLogs from './EventLogs'
import AutomationRules from './AutomationRules'
import Calibration from './Calibration'

/**
 * ★ THE place to add a new page.
 *
 * Add one entry here and it automatically gets a sidebar button, routing, and
 * its top-bar title. Set `requiresRole` to hide a page from the sidebar (and
 * from routing) for anyone without that role.
 */
export type PageGroupId = 'monitoring' | 'tools'

export interface PageGroupDef {
  id: PageGroupId
  label: string
  /**
   * If set, the whole section is hidden from other roles — heading included —
   * and every page inside it inherits the restriction (see pagesForRole), so
   * those pages aren't routable either.
   */
  requiresRole?: Role
}

/** Sidebar sections, in display order. Add a group here to create a section. */
export const PAGE_GROUPS: PageGroupDef[] = [
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'tools', label: 'Tools', requiresRole: 'admin' }
]

export interface PageDef {
  /** Stable id, also used as the active-page key. */
  id: string
  /** Label shown in the top bar and as the sidebar tooltip. */
  label: string
  /** Sidebar icon. */
  icon: ReactNode
  /** The page component rendered in the content slot. */
  component: ComponentType
  /**
   * If set, only this role sees the page. Not needed when the page's section
   * is already restricted — that restriction is inherited.
   */
  requiresRole?: Role
  /** 'bottom' pins the icon to the bottom of the sidebar. Defaults to 'top'. */
  placement?: 'top' | 'bottom'
  /** Which sidebar section it belongs to. Ignored when placement is 'bottom'. */
  group?: PageGroupId
}

export const PAGES: PageDef[] = [
  {
    id: 'live',
    label: 'Live viewer',
    icon: <IconLive />,
    component: LiveViewer,
    group: 'monitoring'
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <IconDashboard />,
    component: Dashboard,
    group: 'monitoring'
  },
  {
    id: 'graphs',
    label: 'Graphs',
    icon: <IconGraphs />,
    component: Graphs,
    group: 'monitoring'
  },
  {
    id: 'stepper',
    label: 'Stepper Control',
    icon: <IconStepper />,
    component: StepperControl,
    group: 'tools'
  },
  {
    id: 'terminal',
    label: 'Terminal & CMD',
    icon: <IconTerminal />,
    component: Terminal,
    group: 'tools'
  },
  {
    id: 'tracking-tuner',
    label: 'Tracking Tuner',
    icon: <IconTrackingTuner />,
    component: TrackingTuner,
    group: 'tools'
  },
  {
    id: 'diagnostics',
    label: 'System Diagnostics',
    icon: <IconDiagnostics />,
    component: SystemDiagnostics,
    group: 'tools'
  },
  {
    id: 'event-logs',
    label: 'Event Logs',
    icon: <IconEventLogs />,
    component: EventLogs,
    group: 'tools'
  },
  {
    id: 'automation-rules',
    label: 'Automation Rules',
    icon: <IconAutomationRules />,
    component: AutomationRules,
    group: 'tools'
  },
  {
    id: 'calibration',
    label: 'Calibration CAM',
    icon: <IconCalibration />,
    component: Calibration,
    group: 'tools'
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <IconSettings />,
    component: Settings,
    placement: 'bottom'
  }
]

/**
 * Pages a given role may reach — the single source of truth for both the
 * sidebar and routing.
 *
 * A page is dropped if EITHER lock rejects the role:
 *   • its own `requiresRole`
 *   • the `requiresRole` of the section it belongs to (inherited)
 *
 * So restricting a section is enough — you don't have to repeat the role on
 * every page inside it, and a page can't stay routable after its section is
 * hidden from the menu.
 */
export function pagesForRole(role: Role): PageDef[] {
  return PAGES.filter((p) => {
    if (p.requiresRole && p.requiresRole !== role) return false

    const group = p.group ? PAGE_GROUPS.find((g) => g.id === p.group) : undefined
    if (group?.requiresRole && group.requiresRole !== role) return false

    return true
  })
}

export interface PageGroupView {
  id: PageGroupId
  label: string
  items: PageDef[]
}

/**
 * Split the visible pages into sidebar sections, in PAGE_GROUPS order.
 *
 * Sections the role isn't allowed to see are dropped entirely — heading and
 * all. Empty groups are kept so a section can exist before it has any pages.
 */
export function groupedPages(pages: PageDef[], role: Role): PageGroupView[] {
  return PAGE_GROUPS.filter((g) => !g.requiresRole || g.requiresRole === role).map((g) => ({
    id: g.id,
    label: g.label,
    items: pages.filter((p) => p.placement !== 'bottom' && p.group === g.id)
  }))
}

/* ── Icons (inline SVG, currentColor so the theme drives them) ── */

function IconLive(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <path d="M17 9l5-3v12l-5-3" />
    </svg>
  )
}

function IconDashboard(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

function IconGraphs(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4v16h16" />
      <path d="M7 14l3-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Stepper motor — ribbed can body with a drive shaft, not a gear. */
function IconStepper(): JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* motor body */}
      <rect x="3" y="6" width="13" height="12" rx="2" />
      {/* cooling fins */}
      <path d="M7.3 6v12" />
      <path d="M11.7 6v12" />
      {/* drive shaft */}
      <path d="M16 12h5" />
    </svg>
  )
}

function IconTerminal(): JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3" />
      <path d="M13 15h4" />
    </svg>
  )
}

/** Tracking reticle — crosshair inside a bracketed box, evokes a tracked target. */
function IconTrackingTuner(): JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* corner brackets */}
      <path d="M4 8V5a1 1 0 0 1 1-1h3" />
      <path d="M16 4h3a1 1 0 0 1 1 1v3" />
      <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
      <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
      {/* crosshair on the tracked subject */}
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 8.4V7" />
      <path d="M12 17v-1.4" />
      <path d="M15.6 12H17" />
      <path d="M7 12h1.4" />
    </svg>
  )
}

/** Diagnostics — pulse line inside a monitor frame. */
function IconDiagnostics(): JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M7 12h2l1.5-3 3 6 1.5-3h2" />
      <path d="M9 21h6" />
      <path d="M12 18v3" />
    </svg>
  )
}

/** Event logs — stacked log lines with a status marker. */
function IconEventLogs(): JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 5h14" />
      <path d="M5 10h14" />
      <path d="M5 15h8" />
      <circle cx="17" cy="16" r="2" />
    </svg>
  )
}

/** Automation rules — trigger node routed into an action path. */
function IconAutomationRules(): JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="7" r="2.4" />
      <circle cx="18" cy="7" r="2.4" />
      <circle cx="18" cy="17" r="2.4" />
      <path d="M8.5 7h7" />
      <path d="M18 9.5v5" />
      <path d="M7.7 8.7 16.3 15.3" />
    </svg>
  )
}

/** Calibration CAM — camera body with a small tuning slider. */
function IconCalibration(): JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 7l1.4-2h7.2L17 7" />
      <rect x="3.5" y="7" width="17" height="11" rx="2" />
      <circle cx="12" cy="12.5" r="3" />
      <path d="M6.5 20h11" />
      <circle cx="10" cy="20" r="1.3" />
    </svg>
  )
}

/** Cog / gear — the toothed outline, not a sun. */
function IconSettings(): JSX.Element {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
