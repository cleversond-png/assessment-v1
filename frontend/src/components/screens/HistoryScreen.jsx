import { useEffect, useState } from 'react'
import { PageHeader, Card, MetricStat } from '../primitives/index.jsx'

const SERIES = [
  { id: 'overall',       label: 'Score consolidado', color: 'var(--brand-500)', width: 2.5 },
  { id: 'entraId',       label: 'Entra ID',          color: '#DC2626', width: 1.5 },
  { id: 'sharePoint',    label: 'SharePoint',         color: '#EA580C', width: 1.5 },
  { id: 'governance',    label: 'Governança',         color: '#D97706', width: 1.5 },
  { id: 'iaReadiness',   label: 'Copilot',            color: '#7C3AED', width: 1.5 },
  { id: 'emailSecurity', label: 'Email Sec',          color: '#15803D', width: 1.5 },
  { id: 'teams',         label: 'Teams',              color: '#2563EB', width: 1.5 },
  { id: 'baseline',      label: 'Baseline',           color: '#64748B', width: 1.5 },
]

function formatDay(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function largestGain(first, last) {
  const gains = SERIES
    .filter((series) => series.id !== 'overall')
    .map((series) => ({
      label: series.label,
      delta: (typeof last[series.id] === 'number' && typeof first[series.id] === 'number')
        ? last[series.id] - first[series.id]
        : null,
    }))
    .filter((item) => item.delta != null)
    .sort((a, b) => b.delta - a.delta)
  return gains[0] || null
}

export default function HistoryScreen({ result }) {
  const [points, setPoints] = useState([])
  const [error, setError] = useState(null)
  const tenantId = result?.tenantId

  useEffect(() => {
    if (!tenantId) {
      setPoints([])
      return undefined
    }
    let cancelled = false
    fetch(`/assessment/results/${encodeURIComponent(tenantId)}/history`)
      .then(async (res) => {
        const body = await res.json().catch(() => [])
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        return body
      })
      .then((rows) => {
        if (!cancelled) setPoints(Array.isArray(rows) ? rows : [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => { cancelled = true }
  }, [tenantId])

  const h = points.map((point) => ({
    ...point,
    date: point.assessedAt,
    overall: point.overallScore,
  }))
  const last = h[h.length - 1]
  const first = h[0]
  const delta = last && first && typeof last.overall === 'number' && typeof first.overall === 'number'
    ? last.overall - first.overall
    : null
  const gain = first && last ? largestGain(first, last) : null

  const W = 980, H = 280
  const P = { l: 40, r: 24, t: 24, b: 40 }
  const innerW = W - P.l - P.r
  const innerH = H - P.t - P.b
  const xFor = (i) => (h.length <= 1 ? P.l + innerW / 2 : P.l + (i / (h.length - 1)) * innerW)
  const yFor = (v) => P.t + innerH - (v / 5) * innerH
  const pathD = (key) => {
    let started = false
    return h.map((point, i) => {
      const value = point[key]
      if (typeof value !== 'number') return ''
      const command = started ? 'L' : 'M'
      started = true
      return `${command}${xFor(i)},${yFor(value)}`
    }).join(' ')
  }

  return (
    <>
      <PageHeader
        kicker={tenantId ? `Tendência · ${h.length} assessment${h.length === 1 ? '' : 's'}` : 'Tendência'}
        title="Histórico"
        subtitle="Scores dos assessments deste tenant ainda dentro da retenção de 30 dias."
      />

      {!tenantId && <div className="t-sm">Abra um assessment para ver o histórico.</div>}
      {error && <div className="t-sm" style={{ color: 'var(--err-fg)' }}>{error}</div>}
      {tenantId && !error && h.length === 0 && (
        <div className="t-sm">Nenhum assessment salvo para este tenant.</div>
      )}

      {h.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <MetricStat label="Score atual" value={typeof last.overall === 'number' ? last.overall.toFixed(1) : '—'} sub={formatDay(last.date)} />
            <MetricStat
              label="Δ desde o início"
              value={delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
              sub={`${h.length} assessment${h.length === 1 ? '' : 's'}`}
              tone={delta > 0 ? 'ok' : delta < 0 ? 'err' : 'neutral'}
            />
            <MetricStat
              label="Maior variação"
              value={gain ? gain.label : '—'}
              sub={gain ? `${gain.delta > 0 ? '+' : ''}${gain.delta.toFixed(1)} desde o início` : 'sem domínio comparável'}
            />
          </div>

          <Card padding={20} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
              {SERIES.map(s => (
                <div key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-2)' }}>
                  <span style={{ width: 14, height: 2.5, background: s.color, borderRadius: 999, display: 'block' }} />
                  {s.label}
                </div>
              ))}
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              {[0, 1, 2, 3, 4, 5].map(v => (
                <g key={v}>
                  <line x1={P.l} x2={W - P.r} y1={yFor(v)} y2={yFor(v)} stroke="var(--border-1)" strokeDasharray={v === 0 || v === 5 ? '' : '2 4'} />
                  <text x={P.l - 8} y={yFor(v) + 4} fontSize="10" fill="var(--fg-3)" textAnchor="end" fontFamily="var(--font-mono)">{v.toFixed(1)}</text>
                </g>
              ))}
              {h.map((p, i) => (
                <text key={p.date} x={xFor(i)} y={H - 14} fontSize="10" fill="var(--fg-3)" textAnchor="middle" fontFamily="var(--font-sans)">
                  {formatDay(p.date)}
                </text>
              ))}
              {SERIES.map(s => (
                <path key={s.id} d={pathD(s.id)} stroke={s.color} strokeWidth={s.width} fill="none"
                  strokeLinecap="round" strokeLinejoin="round" opacity={s.id === 'overall' ? 1 : 0.7} />
              ))}
              {h.map((p, i) => (
                typeof p.overall === 'number' ? (
                  <circle key={`${p.date}-dot`} cx={xFor(i)} cy={yFor(p.overall)} r="3.5" fill="white" stroke="var(--brand-500)" strokeWidth="2" />
                ) : null
              ))}
            </svg>
          </Card>

          <div className="t-h2" style={{ marginBottom: 12 }}>Assessments</div>
          <Card padding={0}>
            {h.slice().reverse().map((p, i) => {
              const newerFirst = h.slice().reverse()
              const prev = newerFirst[i + 1]
              const d = prev && typeof p.overall === 'number' && typeof prev.overall === 'number'
                ? p.overall - prev.overall
                : null
              return (
                <div key={p.date} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px', alignItems: 'center', gap: 16, padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--border-1)' }}>
                  <div className="t-mono-lg">{new Date(p.date).toLocaleDateString('pt-BR')}</div>
                  <div className="t-mono" style={{ textAlign: 'right' }}>{typeof p.overall === 'number' ? `score ${p.overall.toFixed(1)}` : 'sem score'}</div>
                  <div style={{ textAlign: 'right' }}>
                    {d != null && <span style={{ fontSize: 12, fontWeight: 500, color: d > 0 ? 'var(--ok-fg)' : d < 0 ? 'var(--err-fg)' : 'var(--fg-3)' }}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>}
                  </div>
                </div>
              )
            })}
          </Card>
        </>
      )}
    </>
  )
}
