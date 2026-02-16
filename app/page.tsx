'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import {
  getSchedule,
  getScheduleLogs,
  pauseSchedule,
  resumeSchedule,
  cronToHuman,
} from '@/lib/scheduler'
import type { Schedule, ExecutionLog } from '@/lib/scheduler'
import {
  FiSettings,
  FiPlay,
  FiPause,
  FiActivity,
  FiTrendingUp,
  FiTrendingDown,
  FiMail,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiChevronDown,
  FiChevronUp,
  FiRefreshCw,
  FiBarChart2,
  FiX,
  FiAlertCircle,
  FiZap,
  FiLoader,
  FiSend,
  FiMinus,
} from 'react-icons/fi'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANAGER_AGENT_ID = '6992e2ab9faaf40e52dbfe75'
const STOCK_RESEARCH_AGENT_ID = '6992e27c9e5233405ac5138f'
const EMAIL_REPORT_AGENT_ID = '6992e29855d492b23db45a9b'
const SCHEDULE_ID = '6992e2b1399dfadeac37728d'
const CRON_EXPRESSION = '*/5 * * * *'
const POLL_INTERVAL_MS = 60000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalysisEntry {
  id: string
  analysis_complete?: string
  current_price?: string
  price_change?: string
  price_change_percent?: string
  volume?: string
  trend_direction?: string
  key_signals?: string
  news_summary?: string
  support_level?: string
  resistance_level?: string
  analysis_summary?: string
  email_sent?: string
  email_recipient?: string
  delivery_status?: string
  timestamp?: string
  source: 'manual' | 'scheduled'
  error?: string
}

interface SettingsState {
  recipientEmail: string
  priceMovements: boolean
  volumeData: boolean
  trendSignals: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="font-semibold text-sm mt-3 mb-1 text-[hsl(220,15%,85%)]">
              {line.slice(4)}
            </h4>
          )
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="font-semibold text-base mt-3 mb-1 text-[hsl(220,15%,85%)]">
              {line.slice(3)}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="font-bold text-lg mt-4 mb-2 text-[hsl(220,15%,85%)]">
              {line.slice(2)}
            </h2>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <li key={i} className="ml-4 list-disc text-sm text-[hsl(220,12%,55%)]">
              {formatInline(line.slice(2))}
            </li>
          )
        if (/^\d+\.\s/.test(line))
          return (
            <li key={i} className="ml-4 list-decimal text-sm text-[hsl(220,12%,55%)]">
              {formatInline(line.replace(/^\d+\.\s/, ''))}
            </li>
          )
        if (!line.trim()) return <div key={i} className="h-1" />
        return (
          <p key={i} className="text-sm text-[hsl(220,12%,55%)]">
            {formatInline(line)}
          </p>
        )
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-[hsl(220,15%,85%)]">
        {part}
      </strong>
    ) : (
      part
    )
  )
}

function formatTimestamp(ts?: string): string {
  if (!ts) return '--'
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ts
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return ts
  }
}

function isPositiveChange(value?: string): boolean | null {
  if (!value) return null
  const num = parseFloat(value.replace(/[^0-9.\-+]/g, ''))
  if (isNaN(num)) return null
  return num >= 0
}

function parseLogResponseOutput(output: string): Record<string, any> | null {
  if (!output) return null
  try {
    const parsed = JSON.parse(output)
    // The response_output could wrap the result in different ways
    if (parsed?.response?.result) return parsed.response.result
    if (parsed?.result) return parsed.result
    return parsed
  } catch {
    return null
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TrendIcon({ direction }: { direction?: string }) {
  if (!direction) return <FiMinus className="w-4 h-4 text-[hsl(220,12%,55%)]" />
  const lower = direction.toLowerCase()
  if (lower.includes('up') || lower.includes('bull') || lower.includes('positive')) {
    return <FiTrendingUp className="w-4 h-4 text-[hsl(160,70%,45%)]" />
  }
  if (lower.includes('down') || lower.includes('bear') || lower.includes('negative')) {
    return <FiTrendingDown className="w-4 h-4 text-[hsl(0,75%,55%)]" />
  }
  return <FiMinus className="w-4 h-4 text-[hsl(220,12%,55%)]" />
}

function StatusBadge({ status, label }: { status: 'success' | 'error' | 'neutral'; label: string }) {
  const colors = {
    success: 'bg-[hsl(160,70%,45%)]/15 text-[hsl(160,70%,45%)] border-[hsl(160,70%,45%)]/30',
    error: 'bg-[hsl(0,75%,55%)]/15 text-[hsl(0,75%,55%)] border-[hsl(0,75%,55%)]/30',
    neutral: 'bg-[hsl(220,15%,20%)] text-[hsl(220,12%,55%)] border-[hsl(220,18%,18%)]',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-sm border ${colors[status]}`}>
      {label}
    </span>
  )
}

function DeliveryBadge({ status }: { status?: string }) {
  if (!status) return <StatusBadge status="neutral" label="Unknown" />
  const lower = status.toLowerCase()
  if (lower.includes('sent') || lower.includes('success') || lower.includes('delivered')) {
    return <StatusBadge status="success" label="Sent" />
  }
  if (lower.includes('fail') || lower.includes('error')) {
    return <StatusBadge status="error" label="Failed" />
  }
  return <StatusBadge status="neutral" label={status} />
}

function SkeletonCard() {
  return (
    <div className="p-4 rounded-sm bg-[hsl(220,22%,10%)] border border-[hsl(220,18%,18%)] animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 w-24 bg-[hsl(220,15%,20%)] rounded-sm" />
        <div className="h-4 w-16 bg-[hsl(220,15%,20%)] rounded-sm" />
      </div>
      <div className="flex items-center gap-4 mb-3">
        <div className="h-6 w-20 bg-[hsl(220,15%,20%)] rounded-sm" />
        <div className="h-4 w-16 bg-[hsl(220,15%,20%)] rounded-sm" />
        <div className="h-4 w-12 bg-[hsl(220,15%,20%)] rounded-sm" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full bg-[hsl(220,15%,20%)] rounded-sm" />
        <div className="h-3 w-3/4 bg-[hsl(220,15%,20%)] rounded-sm" />
      </div>
    </div>
  )
}

function AnalysisCard({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: AnalysisEntry
  isExpanded: boolean
  onToggle: () => void
}) {
  const positive = isPositiveChange(entry.price_change)
  const priceColor = positive === true
    ? 'text-[hsl(160,70%,45%)]'
    : positive === false
      ? 'text-[hsl(0,75%,55%)]'
      : 'text-[hsl(220,15%,85%)]'

  return (
    <div
      className="rounded-sm bg-[hsl(220,22%,10%)] border border-[hsl(220,18%,18%)] hover:border-[hsl(220,80%,55%)]/30 transition-colors cursor-pointer"
      onClick={onToggle}
    >
      {/* Collapsed header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FiClock className="w-3.5 h-3.5 text-[hsl(220,12%,55%)]" />
            <span className="text-xs text-[hsl(220,12%,55%)]">{formatTimestamp(entry.timestamp)}</span>
            {entry.source === 'scheduled' && (
              <span className="text-xs px-1.5 py-0.5 bg-[hsl(280,60%,60%)]/15 text-[hsl(280,60%,60%)] rounded-sm border border-[hsl(280,60%,60%)]/30">
                Scheduled
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DeliveryBadge status={entry.delivery_status} />
            {isExpanded ? (
              <FiChevronUp className="w-4 h-4 text-[hsl(220,12%,55%)]" />
            ) : (
              <FiChevronDown className="w-4 h-4 text-[hsl(220,12%,55%)]" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-lg font-semibold tracking-tight text-[hsl(220,15%,85%)]">
            {entry.current_price ?? '--'}
          </span>
          <div className="flex items-center gap-1">
            <TrendIcon direction={entry.trend_direction} />
            <span className={`text-sm font-medium ${priceColor}`}>
              {entry.price_change ?? '--'}
            </span>
            {entry.price_change_percent && (
              <span className={`text-xs ${priceColor}`}>
                ({entry.price_change_percent})
              </span>
            )}
          </div>
          {entry.volume && (
            <span className="text-xs text-[hsl(220,12%,55%)]">
              Vol: {entry.volume}
            </span>
          )}
        </div>

        {entry.error && (
          <div className="mt-2 flex items-center gap-2 text-[hsl(0,75%,55%)] text-xs">
            <FiAlertCircle className="w-3.5 h-3.5" />
            <span>{entry.error}</span>
          </div>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-[hsl(220,18%,18%)] px-4 py-3 space-y-4" onClick={(e) => e.stopPropagation()}>
          {/* Support / Resistance */}
          {(entry.support_level || entry.resistance_level) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 rounded-sm bg-[hsl(220,18%,16%)]">
                <div className="text-xs text-[hsl(220,12%,55%)] mb-1">Support</div>
                <div className="text-sm font-medium text-[hsl(160,70%,45%)]">{entry.support_level ?? '--'}</div>
              </div>
              <div className="p-2.5 rounded-sm bg-[hsl(220,18%,16%)]">
                <div className="text-xs text-[hsl(220,12%,55%)] mb-1">Resistance</div>
                <div className="text-sm font-medium text-[hsl(0,75%,55%)]">{entry.resistance_level ?? '--'}</div>
              </div>
            </div>
          )}

          {/* Analysis Summary */}
          {entry.analysis_summary && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(220,12%,55%)] mb-2">Analysis Summary</h4>
              {renderMarkdown(entry.analysis_summary)}
            </div>
          )}

          {/* Key Signals */}
          {entry.key_signals && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(220,12%,55%)] mb-2">Key Signals</h4>
              {renderMarkdown(entry.key_signals)}
            </div>
          )}

          {/* News Summary */}
          {entry.news_summary && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(220,12%,55%)] mb-2">News Summary</h4>
              {renderMarkdown(entry.news_summary)}
            </div>
          )}

          {/* Email Info */}
          {entry.email_recipient && (
            <div className="flex items-center gap-2 text-xs text-[hsl(220,12%,55%)]">
              <FiMail className="w-3.5 h-3.5" />
              <span>Report sent to {entry.email_recipient}</span>
            </div>
          )}

          {/* Trend Direction */}
          {entry.trend_direction && (
            <div className="flex items-center gap-2 text-xs text-[hsl(220,12%,55%)]">
              <FiActivity className="w-3.5 h-3.5" />
              <span>Trend: {entry.trend_direction}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SettingsModal({
  isOpen,
  settings,
  onSave,
  onClose,
}: {
  isOpen: boolean
  settings: SettingsState
  onSave: (s: SettingsState) => void
  onClose: () => void
}) {
  const [localSettings, setLocalSettings] = useState<SettingsState>(settings)
  const [emailError, setEmailError] = useState('')
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings)
      setEmailError('')
    }
  }, [isOpen, settings])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  function handleSave() {
    const email = localSettings.recipientEmail.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Enter a valid email address')
      return
    }
    onSave(localSettings)
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-sm bg-[hsl(220,22%,10%)] border border-[hsl(220,18%,18%)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(220,18%,18%)]">
          <h2 className="text-base font-semibold tracking-tight text-[hsl(220,15%,85%)]">Settings</h2>
          <button onClick={onClose} className="p-1 rounded-sm hover:bg-[hsl(220,15%,20%)] transition-colors">
            <FiX className="w-4 h-4 text-[hsl(220,12%,55%)]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-[hsl(220,12%,55%)] mb-1.5">Recipient Email</label>
            <input
              type="email"
              value={localSettings.recipientEmail}
              onChange={(e) => {
                setLocalSettings((prev) => ({ ...prev, recipientEmail: e.target.value }))
                setEmailError('')
              }}
              placeholder="analyst@company.com"
              className="w-full px-3 py-2 text-sm rounded-sm bg-[hsl(220,15%,24%)] border border-[hsl(220,18%,18%)] text-[hsl(220,15%,85%)] placeholder:text-[hsl(220,12%,55%)]/50 focus:outline-none focus:border-[hsl(220,80%,55%)] transition-colors"
            />
            {emailError && (
              <p className="mt-1 text-xs text-[hsl(0,75%,55%)]">{emailError}</p>
            )}
          </div>

          {/* Scope toggles */}
          <div>
            <label className="block text-xs font-medium text-[hsl(220,12%,55%)] mb-2">Analysis Scope</label>
            <div className="space-y-2">
              {([
                { key: 'priceMovements' as const, label: 'Price Movements' },
                { key: 'volumeData' as const, label: 'Volume Data' },
                { key: 'trendSignals' as const, label: 'Trend Signals' },
              ]).map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between py-1 cursor-pointer">
                  <span className="text-sm text-[hsl(220,15%,85%)]">{label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={localSettings[key]}
                    onClick={() => setLocalSettings((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className={`relative w-9 h-5 rounded-full transition-colors ${localSettings[key] ? 'bg-[hsl(220,80%,55%)]' : 'bg-[hsl(220,15%,20%)]'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${localSettings[key] ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </label>
              ))}
            </div>
          </div>

          {/* Scheduler interval (read-only) */}
          <div>
            <label className="block text-xs font-medium text-[hsl(220,12%,55%)] mb-1.5">Scheduler Interval</label>
            <div className="px-3 py-2 text-sm rounded-sm bg-[hsl(220,15%,20%)] border border-[hsl(220,18%,18%)] text-[hsl(220,12%,55%)]">
              {cronToHuman(CRON_EXPRESSION)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[hsl(220,18%,18%)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-sm text-[hsl(220,12%,55%)] hover:bg-[hsl(220,15%,20%)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium rounded-sm bg-[hsl(220,80%,55%)] text-white hover:bg-[hsl(220,80%,50%)] transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function ExecutionLogItem({ log }: { log: ExecutionLog }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-sm bg-[hsl(220,18%,16%)]">
      <div className="flex items-center gap-2">
        {log.success ? (
          <FiCheckCircle className="w-3.5 h-3.5 text-[hsl(160,70%,45%)]" />
        ) : (
          <FiXCircle className="w-3.5 h-3.5 text-[hsl(0,75%,55%)]" />
        )}
        <span className="text-xs text-[hsl(220,12%,55%)]">
          {formatTimestamp(log.executed_at)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[hsl(220,12%,55%)]">
          Attempt {log.attempt}/{log.max_attempts}
        </span>
        <StatusBadge
          status={log.success ? 'success' : 'error'}
          label={log.success ? 'OK' : 'Fail'}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sample Data
// ---------------------------------------------------------------------------

const SAMPLE_ANALYSES: AnalysisEntry[] = [
  {
    id: 'sample-1',
    analysis_complete: 'true',
    current_price: '$542.31',
    price_change: '+$8.47',
    price_change_percent: '+1.59%',
    volume: '18.2M',
    trend_direction: 'Bullish',
    key_signals: '- RSI at 62.4, neutral to slightly overbought\n- MACD crossover confirmed bullish momentum\n- 50-day MA trending upward above 200-day MA\n- Volume increasing on up days',
    news_summary: '- Meta reports strong Q4 earnings beating expectations\n- Reality Labs losses narrowing quarter-over-quarter\n- AI infrastructure investments accelerating\n- Threads engagement metrics showing positive growth',
    support_level: '$528.00',
    resistance_level: '$555.00',
    analysis_summary: 'META is showing **strong bullish momentum** following positive earnings results. The stock has broken above key resistance levels with increasing volume, suggesting sustained buying interest. Technical indicators confirm the uptrend with MACD crossover and moving average alignment.',
    email_sent: 'true',
    email_recipient: 'analyst@company.com',
    delivery_status: 'Sent successfully',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    source: 'manual',
  },
  {
    id: 'sample-2',
    analysis_complete: 'true',
    current_price: '$535.12',
    price_change: '-$3.88',
    price_change_percent: '-0.72%',
    volume: '14.7M',
    trend_direction: 'Neutral',
    key_signals: '- RSI at 55.2, neutral zone\n- Price consolidating near support level\n- Volume slightly below average',
    news_summary: '- Broader market pullback affecting tech sector\n- No major company-specific catalysts\n- Analyst consensus remains Overweight',
    support_level: '$530.00',
    resistance_level: '$545.00',
    analysis_summary: 'META is consolidating in a narrow range amid broader market uncertainty. No significant catalysts in the near term. The **overall trend remains intact** with price holding above key moving averages.',
    email_sent: 'true',
    email_recipient: 'analyst@company.com',
    delivery_status: 'Sent successfully',
    timestamp: new Date(Date.now() - 900000).toISOString(),
    source: 'scheduled',
  },
  {
    id: 'sample-3',
    analysis_complete: 'true',
    current_price: '$538.99',
    price_change: '+$12.15',
    price_change_percent: '+2.31%',
    volume: '22.4M',
    trend_direction: 'Bullish',
    key_signals: '- Strong volume breakout\n- RSI approaching 70 level\n- All major moving averages in bullish alignment',
    news_summary: '- AI product announcements driving sentiment\n- Institutional buying activity detected\n- Positive sector rotation into large-cap tech',
    support_level: '$525.00',
    resistance_level: '$550.00',
    analysis_summary: 'META surged on heavy volume driven by **positive AI product announcements**. Institutional accumulation is evident. Momentum indicators are strong but approaching overbought territory.',
    email_sent: 'true',
    email_recipient: 'analyst@company.com',
    delivery_status: 'Sent successfully',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    source: 'scheduled',
  },
]

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function Page() {
  // State
  const [analyses, setAnalyses] = useState<AnalysisEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [scheduleData, setScheduleData] = useState<Schedule | null>(null)
  const [schedulerLoading, setSchedulerLoading] = useState(false)
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<SettingsState>({
    recipientEmail: '',
    priceMovements: true,
    volumeData: true,
    trendSignals: true,
  })
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [showSampleData, setShowSampleData] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<string>('')
  const [inlineEmail, setInlineEmail] = useState('')
  const [inlineEmailError, setInlineEmailError] = useState('')
  const [emailSaved, setEmailSaved] = useState(false)

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load settings from localStorage
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('sp_recipient_email')
      const savedPM = localStorage.getItem('sp_price_movements')
      const savedVD = localStorage.getItem('sp_volume_data')
      const savedTS = localStorage.getItem('sp_trend_signals')
      const email = savedEmail ?? ''
      setSettings({
        recipientEmail: email,
        priceMovements: savedPM !== null ? savedPM === 'true' : true,
        volumeData: savedVD !== null ? savedVD === 'true' : true,
        trendSignals: savedTS !== null ? savedTS === 'true' : true,
      })
      setInlineEmail(email)
      if (email) setEmailSaved(true)
    } catch {
      // localStorage may not be available
    }
  }, [])

  // Fetch schedule data
  const fetchScheduleData = useCallback(async () => {
    try {
      const result = await getSchedule(SCHEDULE_ID)
      if (result.success && result.schedule) {
        setScheduleData(result.schedule)
      }
    } catch {
      // Silently fail for polling
    }
  }, [])

  // Fetch execution logs and parse them into analysis entries
  const fetchExecutionLogs = useCallback(async () => {
    try {
      const result = await getScheduleLogs(SCHEDULE_ID, { limit: 10 })
      if (result.success && Array.isArray(result.executions)) {
        setExecutionLogs(result.executions.slice(0, 5))

        // Parse successful execution outputs into analysis entries
        const scheduledAnalyses: AnalysisEntry[] = []
        for (const log of result.executions) {
          if (log.success && log.response_output) {
            const parsed = parseLogResponseOutput(log.response_output)
            if (parsed) {
              scheduledAnalyses.push({
                id: `log-${log.id}`,
                analysis_complete: parsed.analysis_complete,
                current_price: parsed.current_price,
                price_change: parsed.price_change,
                price_change_percent: parsed.price_change_percent,
                volume: parsed.volume,
                trend_direction: parsed.trend_direction,
                key_signals: parsed.key_signals,
                news_summary: parsed.news_summary,
                support_level: parsed.support_level,
                resistance_level: parsed.resistance_level,
                analysis_summary: parsed.analysis_summary,
                email_sent: parsed.email_sent,
                email_recipient: parsed.email_recipient ?? parsed.recipient,
                delivery_status: parsed.delivery_status,
                timestamp: parsed.timestamp ?? log.executed_at,
                source: 'scheduled',
              })
            }
          }
        }

        // Merge scheduled analyses with manual ones (avoid duplicates)
        setAnalyses((prev) => {
          const manualEntries = prev.filter((e) => e.source === 'manual')
          const existingLogIds = new Set(manualEntries.map((e) => e.id))
          const newScheduled = scheduledAnalyses.filter((e) => !existingLogIds.has(e.id))
          const merged = [...manualEntries, ...newScheduled]
          merged.sort((a, b) => {
            const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
            const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
            return tb - ta
          })
          return merged
        })
      }
      setLastRefresh(new Date().toISOString())
    } catch {
      // Silently fail for polling
    }
  }, [])

  // Initial load + polling
  useEffect(() => {
    fetchScheduleData()
    fetchExecutionLogs()

    pollTimerRef.current = setInterval(() => {
      fetchScheduleData()
      fetchExecutionLogs()
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [fetchScheduleData, fetchExecutionLogs])

  // Save settings
  function handleSaveSettings(newSettings: SettingsState) {
    setSettings(newSettings)
    setInlineEmail(newSettings.recipientEmail)
    if (newSettings.recipientEmail) setEmailSaved(true)
    try {
      localStorage.setItem('sp_recipient_email', newSettings.recipientEmail)
      localStorage.setItem('sp_price_movements', String(newSettings.priceMovements))
      localStorage.setItem('sp_volume_data', String(newSettings.volumeData))
      localStorage.setItem('sp_trend_signals', String(newSettings.trendSignals))
    } catch {
      // localStorage may not be available
    }
    setSettingsOpen(false)
  }

  // Toggle scheduler
  async function handleToggleScheduler() {
    if (!scheduleData) return
    setSchedulerLoading(true)
    setErrorMessage(null)
    try {
      if (scheduleData.is_active) {
        const result = await pauseSchedule(SCHEDULE_ID)
        if (result.success) {
          setScheduleData((prev) => prev ? { ...prev, is_active: false } : prev)
        } else {
          setErrorMessage(result.error ?? 'Failed to pause scheduler')
        }
      } else {
        const result = await resumeSchedule(SCHEDULE_ID)
        if (result.success) {
          setScheduleData((prev) => prev ? { ...prev, is_active: true } : prev)
        } else {
          setErrorMessage(result.error ?? 'Failed to resume scheduler')
        }
      }
    } catch {
      setErrorMessage('Network error toggling scheduler')
    }
    setSchedulerLoading(false)
  }

  // Run analysis
  async function handleRunAnalysis() {
    setIsLoading(true)
    setErrorMessage(null)
    setActiveAgentId(MANAGER_AGENT_ID)

    const email = settings.recipientEmail.trim()
    const message = email
      ? `Run the META stock analysis pipeline. Fetch current real-time data for Facebook/Meta Platforms (META) stock and send the analysis report via email to ${email}.`
      : `Run the META stock analysis pipeline. Fetch current real-time data for Facebook/Meta Platforms (META) stock and generate a comprehensive analysis report.`

    try {
      const result = await callAIAgent(message, MANAGER_AGENT_ID)
      if (result.success) {
        const data = result?.response?.result
        const newEntry: AnalysisEntry = {
          id: generateId(),
          analysis_complete: data?.analysis_complete,
          current_price: data?.current_price,
          price_change: data?.price_change,
          price_change_percent: data?.price_change_percent,
          volume: data?.volume,
          trend_direction: data?.trend_direction,
          key_signals: data?.key_signals,
          news_summary: data?.news_summary,
          support_level: data?.support_level,
          resistance_level: data?.resistance_level,
          analysis_summary: data?.analysis_summary,
          email_sent: data?.email_sent,
          email_recipient: data?.email_recipient,
          delivery_status: data?.delivery_status,
          timestamp: data?.timestamp ?? new Date().toISOString(),
          source: 'manual',
        }
        setAnalyses((prev) => [newEntry, ...prev])
        setExpandedId(newEntry.id)
      } else {
        const errEntry: AnalysisEntry = {
          id: generateId(),
          timestamp: new Date().toISOString(),
          source: 'manual',
          error: result?.error ?? result?.response?.message ?? 'Analysis failed. Please try again.',
        }
        setAnalyses((prev) => [errEntry, ...prev])
      }
    } catch {
      const errEntry: AnalysisEntry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        source: 'manual',
        error: 'Network error. Please check your connection and try again.',
      }
      setAnalyses((prev) => [errEntry, ...prev])
    }

    setActiveAgentId(null)
    setIsLoading(false)
  }

  // Refresh data manually
  async function handleRefresh() {
    await fetchScheduleData()
    await fetchExecutionLogs()
  }

  // Determine display data
  const displayAnalyses = showSampleData ? SAMPLE_ANALYSES : analyses
  const isSchedulerActive = scheduleData?.is_active ?? false
  const lastEntry = displayAnalyses[0]

  return (
    <div className="min-h-screen bg-[hsl(220,25%,7%)] text-[hsl(220,15%,85%)] font-sans tracking-tight">
      {/* ================================================================== */}
      {/* HEADER */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-40 bg-[hsl(220,25%,7%)]/95 backdrop-blur-sm border-b border-[hsl(220,18%,18%)]">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Left: Logo + Ticker */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <FiBarChart2 className="w-5 h-5 text-[hsl(220,80%,55%)]" />
              <span className="text-lg font-bold tracking-tight">StockPulse</span>
            </div>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-sm bg-[hsl(220,80%,55%)]/15 text-[hsl(220,80%,55%)] border border-[hsl(220,80%,55%)]/30">
              META
            </span>
            {/* Scheduler status badge */}
            {scheduleData ? (
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-sm border ${isSchedulerActive ? 'bg-[hsl(160,70%,45%)]/15 text-[hsl(160,70%,45%)] border-[hsl(160,70%,45%)]/30' : 'bg-[hsl(35,85%,55%)]/15 text-[hsl(35,85%,55%)] border-[hsl(35,85%,55%)]/30'}`}
              >
                {isSchedulerActive ? 'Active' : 'Paused'}
              </span>
            ) : (
              <span className="px-2 py-0.5 text-xs text-[hsl(220,12%,55%)] rounded-sm bg-[hsl(220,15%,20%)] border border-[hsl(220,18%,18%)]">
                Loading...
              </span>
            )}
          </div>

          {/* Right: Sample toggle + Settings */}
          <div className="flex items-center gap-3">
            {/* Sample Data Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-[hsl(220,12%,55%)]">Sample Data</span>
              <button
                type="button"
                role="switch"
                aria-checked={showSampleData}
                onClick={() => setShowSampleData(!showSampleData)}
                className={`relative w-9 h-5 rounded-full transition-colors ${showSampleData ? 'bg-[hsl(220,80%,55%)]' : 'bg-[hsl(220,15%,20%)]'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${showSampleData ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </label>

            {/* Settings button */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-sm hover:bg-[hsl(220,15%,20%)] transition-colors"
              aria-label="Settings"
            >
              <FiSettings className="w-4 h-4 text-[hsl(220,12%,55%)]" />
            </button>
          </div>
        </div>
      </header>

      {/* ================================================================== */}
      {/* ERROR BANNER */}
      {/* ================================================================== */}
      {errorMessage && (
        <div className="max-w-screen-xl mx-auto px-4 pt-3">
          <div className="flex items-center gap-2 p-3 rounded-sm bg-[hsl(0,75%,55%)]/10 border border-[hsl(0,75%,55%)]/30 text-[hsl(0,75%,55%)] text-sm">
            <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="ml-auto p-1 hover:bg-[hsl(0,75%,55%)]/20 rounded-sm">
              <FiX className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MAIN CONTENT */}
      {/* ================================================================== */}
      <main className="max-w-screen-xl mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* ============================================================ */}
          {/* LEFT COLUMN — Analysis Log (70%) */}
          {/* ============================================================ */}
          <div className="flex-1 lg:w-[70%] min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(220,12%,55%)]">Analysis Log</h2>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1.5 text-xs text-[hsl(220,12%,55%)] hover:text-[hsl(220,15%,85%)] transition-colors"
              >
                <FiRefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
              {/* Loading skeleton */}
              {isLoading && (
                <SkeletonCard />
              )}

              {/* Analysis entries */}
              {displayAnalyses.length > 0 ? (
                displayAnalyses.map((entry) => (
                  <AnalysisCard
                    key={entry.id}
                    entry={entry}
                    isExpanded={expandedId === entry.id}
                    onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  />
                ))
              ) : (
                !isLoading && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 rounded-full bg-[hsl(220,15%,20%)] flex items-center justify-center mb-4">
                      <FiPlay className="w-5 h-5 text-[hsl(220,12%,55%)]" />
                    </div>
                    <p className="text-sm font-medium text-[hsl(220,15%,85%)] mb-1">No analyses yet</p>
                    <p className="text-xs text-[hsl(220,12%,55%)] max-w-xs">
                      Activate your scheduler or run your first analysis to see results here.
                    </p>
                  </div>
                )
              )}
            </div>
          </div>

          {/* ============================================================ */}
          {/* RIGHT COLUMN — Quick Controls & Stats (30%) */}
          {/* ============================================================ */}
          <div className="lg:w-[30%] space-y-3">
            {/* ---- Run Analysis Card ---- */}
            <div className="p-4 rounded-sm bg-[hsl(220,22%,10%)] border border-[hsl(220,18%,18%)]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(220,12%,55%)] mb-3">Quick Controls</h3>

              {/* Scheduler Toggle */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[hsl(220,15%,85%)]">Scheduler</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isSchedulerActive}
                  disabled={schedulerLoading || !scheduleData}
                  onClick={handleToggleScheduler}
                  className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${isSchedulerActive ? 'bg-[hsl(160,70%,45%)]' : 'bg-[hsl(220,15%,20%)]'}`}
                >
                  {schedulerLoading ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <FiLoader className="w-3.5 h-3.5 text-white animate-spin" />
                    </span>
                  ) : (
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${isSchedulerActive ? 'translate-x-5' : 'translate-x-0'}`} />
                  )}
                </button>
              </div>

              {/* Run Analysis Now button */}
              <button
                onClick={handleRunAnalysis}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-sm bg-[hsl(220,80%,55%)] text-white hover:bg-[hsl(220,80%,50%)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <>
                    <FiLoader className="w-4 h-4 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <FiZap className="w-4 h-4" />
                    <span>Run Analysis Now</span>
                  </>
                )}
              </button>

            </div>

            {/* ---- Email Configuration Card ---- */}
            <div className="p-4 rounded-sm bg-[hsl(220,22%,10%)] border border-[hsl(220,18%,18%)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(220,12%,55%)]">Email Recipient</h3>
                {settings.recipientEmail && emailSaved && (
                  <span className="flex items-center gap-1 text-xs text-[hsl(160,70%,45%)]">
                    <FiCheckCircle className="w-3 h-3" />
                    Saved
                  </span>
                )}
              </div>
              <p className="text-xs text-[hsl(220,12%,55%)] mb-2">
                Analysis reports will be sent to this email address automatically.
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <FiMail className="w-3.5 h-3.5 text-[hsl(220,12%,55%)]" />
                  </div>
                  <input
                    type="email"
                    value={inlineEmail}
                    onChange={(e) => {
                      setInlineEmail(e.target.value)
                      setInlineEmailError('')
                      setEmailSaved(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = inlineEmail.trim()
                        if (!val) {
                          setInlineEmailError('Email is required')
                          return
                        }
                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                          setInlineEmailError('Enter a valid email')
                          return
                        }
                        setSettings((prev) => ({ ...prev, recipientEmail: val }))
                        try {
                          localStorage.setItem('sp_recipient_email', val)
                        } catch {}
                        setEmailSaved(true)
                      }
                    }}
                    placeholder="your@email.com"
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-sm bg-[hsl(220,15%,24%)] border border-[hsl(220,18%,18%)] text-[hsl(220,15%,85%)] placeholder:text-[hsl(220,12%,55%)]/50 focus:outline-none focus:border-[hsl(220,80%,55%)] transition-colors"
                  />
                </div>
                <button
                  onClick={() => {
                    const val = inlineEmail.trim()
                    if (!val) {
                      setInlineEmailError('Email is required')
                      return
                    }
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                      setInlineEmailError('Enter a valid email')
                      return
                    }
                    setSettings((prev) => ({ ...prev, recipientEmail: val }))
                    try {
                      localStorage.setItem('sp_recipient_email', val)
                    } catch {}
                    setEmailSaved(true)
                    setInlineEmailError('')
                  }}
                  className="px-3 py-2 text-sm font-medium rounded-sm bg-[hsl(220,80%,55%)] text-white hover:bg-[hsl(220,80%,50%)] transition-colors flex items-center gap-1.5"
                >
                  <FiSend className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>
              {inlineEmailError && (
                <p className="mt-1.5 text-xs text-[hsl(0,75%,55%)] flex items-center gap-1">
                  <FiAlertCircle className="w-3 h-3" />
                  {inlineEmailError}
                </p>
              )}
              {!settings.recipientEmail && !inlineEmailError && (
                <p className="mt-1.5 text-xs text-[hsl(35,85%,55%)] flex items-center gap-1">
                  <FiAlertCircle className="w-3 h-3" />
                  Required for automated email reports
                </p>
              )}
            </div>

            {/* ---- Quick Stats Card ---- */}
            <div className="p-4 rounded-sm bg-[hsl(220,22%,10%)] border border-[hsl(220,18%,18%)]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(220,12%,55%)] mb-3">Quick Stats</h3>

              {lastEntry ? (
                <div className="space-y-3">
                  {/* Price */}
                  <div>
                    <div className="text-xs text-[hsl(220,12%,55%)] mb-0.5">Last Price</div>
                    <div className="text-xl font-bold tracking-tight">{lastEntry.current_price ?? '--'}</div>
                    {lastEntry.price_change && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <TrendIcon direction={lastEntry.trend_direction} />
                        <span className={`text-sm font-medium ${isPositiveChange(lastEntry.price_change) === true ? 'text-[hsl(160,70%,45%)]' : isPositiveChange(lastEntry.price_change) === false ? 'text-[hsl(0,75%,55%)]' : 'text-[hsl(220,12%,55%)]'}`}>
                          {lastEntry.price_change}
                          {lastEntry.price_change_percent ? ` (${lastEntry.price_change_percent})` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Trend */}
                  <div className="flex items-center justify-between py-2 border-t border-[hsl(220,18%,18%)]">
                    <span className="text-xs text-[hsl(220,12%,55%)]">Trend</span>
                    <div className="flex items-center gap-1.5">
                      <TrendIcon direction={lastEntry.trend_direction} />
                      <span className="text-sm font-medium">{lastEntry.trend_direction ?? '--'}</span>
                    </div>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center justify-between py-2 border-t border-[hsl(220,18%,18%)]">
                    <span className="text-xs text-[hsl(220,12%,55%)]">Volume</span>
                    <span className="text-sm font-medium">{lastEntry.volume ?? '--'}</span>
                  </div>

                  {/* Support / Resistance */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[hsl(220,18%,18%)]">
                    <div>
                      <div className="text-xs text-[hsl(220,12%,55%)] mb-0.5">Support</div>
                      <div className="text-sm font-medium text-[hsl(160,70%,45%)]">{lastEntry.support_level ?? '--'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[hsl(220,12%,55%)] mb-0.5">Resistance</div>
                      <div className="text-sm font-medium text-[hsl(0,75%,55%)]">{lastEntry.resistance_level ?? '--'}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[hsl(220,12%,55%)]">Run an analysis to see stats.</p>
              )}
            </div>

            {/* ---- Schedule Management Card ---- */}
            <div className="p-4 rounded-sm bg-[hsl(220,22%,10%)] border border-[hsl(220,18%,18%)]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(220,12%,55%)] mb-3">Schedule</h3>

              <div className="space-y-2.5">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[hsl(220,12%,55%)]">Status</span>
                  {scheduleData ? (
                    <StatusBadge
                      status={isSchedulerActive ? 'success' : 'neutral'}
                      label={isSchedulerActive ? 'Active' : 'Paused'}
                    />
                  ) : (
                    <span className="text-xs text-[hsl(220,12%,55%)]">--</span>
                  )}
                </div>

                {/* Frequency */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[hsl(220,12%,55%)]">Frequency</span>
                  <span className="text-xs font-medium text-[hsl(220,15%,85%)]">{cronToHuman(CRON_EXPRESSION)}</span>
                </div>

                {/* Next Run */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[hsl(220,12%,55%)]">Next Run</span>
                  <span className="text-xs font-medium text-[hsl(220,15%,85%)]">
                    {scheduleData?.next_run_time ? formatTimestamp(scheduleData.next_run_time) : '--'}
                  </span>
                </div>

                {/* Last Run */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[hsl(220,12%,55%)]">Last Run</span>
                  <div className="flex items-center gap-1.5">
                    {scheduleData?.last_run_success !== null && scheduleData?.last_run_success !== undefined && (
                      scheduleData.last_run_success ? (
                        <FiCheckCircle className="w-3 h-3 text-[hsl(160,70%,45%)]" />
                      ) : (
                        <FiXCircle className="w-3 h-3 text-[hsl(0,75%,55%)]" />
                      )
                    )}
                    <span className="text-xs font-medium text-[hsl(220,15%,85%)]">
                      {scheduleData?.last_run_at ? formatTimestamp(scheduleData.last_run_at) : '--'}
                    </span>
                  </div>
                </div>

                {/* Pause/Resume */}
                <button
                  onClick={handleToggleScheduler}
                  disabled={schedulerLoading || !scheduleData}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-sm border transition-colors disabled:opacity-50 ${isSchedulerActive ? 'border-[hsl(35,85%,55%)]/30 text-[hsl(35,85%,55%)] hover:bg-[hsl(35,85%,55%)]/10' : 'border-[hsl(160,70%,45%)]/30 text-[hsl(160,70%,45%)] hover:bg-[hsl(160,70%,45%)]/10'}`}
                >
                  {schedulerLoading ? (
                    <FiLoader className="w-3.5 h-3.5 animate-spin" />
                  ) : isSchedulerActive ? (
                    <FiPause className="w-3.5 h-3.5" />
                  ) : (
                    <FiPlay className="w-3.5 h-3.5" />
                  )}
                  <span>{isSchedulerActive ? 'Pause Scheduler' : 'Resume Scheduler'}</span>
                </button>
              </div>

              {/* Run History */}
              {Array.isArray(executionLogs) && executionLogs.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[hsl(220,18%,18%)]">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(220,12%,55%)] mb-2">Run History</h4>
                  <div className="space-y-1.5">
                    {executionLogs.map((log) => (
                      <ExecutionLogItem key={log.id} log={log} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ---- Agent Info Card ---- */}
            <div className="p-4 rounded-sm bg-[hsl(220,22%,10%)] border border-[hsl(220,18%,18%)]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(220,12%,55%)] mb-3">Agents</h3>
              <div className="space-y-2">
                {[
                  { id: MANAGER_AGENT_ID, name: 'Stock Analysis Coordinator', desc: 'Orchestrates analysis pipeline' },
                  { id: STOCK_RESEARCH_AGENT_ID, name: 'Stock Research Agent', desc: 'Fetches market data & technicals' },
                  { id: EMAIL_REPORT_AGENT_ID, name: 'Email Report Agent', desc: 'Sends analysis via email' },
                ].map((agent) => (
                  <div key={agent.id} className="flex items-center gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeAgentId === agent.id ? 'bg-[hsl(160,70%,45%)] animate-pulse' : 'bg-[hsl(220,15%,20%)]'}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[hsl(220,15%,85%)] truncate">{agent.name}</div>
                      <div className="text-xs text-[hsl(220,12%,55%)] truncate">{agent.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Last refreshed */}
            {lastRefresh && (
              <div className="text-center">
                <span className="text-xs text-[hsl(220,12%,55%)]">
                  Last refreshed: {formatTimestamp(lastRefresh)}
                </span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ================================================================== */}
      {/* SETTINGS MODAL */}
      {/* ================================================================== */}
      <SettingsModal
        isOpen={settingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
