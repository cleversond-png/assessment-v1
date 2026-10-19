import { Icon, Pill } from '../primitives/index.jsx'

const DOMAIN_ORDER = ['baseline', 'entraId', 'sharePoint', 'governance', 'emailSecurity', 'teams', 'iaReadiness']
const DOMAIN_META = {
  baseline:      { label: 'Baseline',         icon: 'building-2' },
  entraId:       { label: 'Entra ID',          icon: 'shield-check' },
  sharePoint:    { label: 'SharePoint',        icon: 'folder-tree' },
  governance:    { label: 'Governança',        icon: 'scale' },
  emailSecurity: { label: 'Email Security',    icon: 'mail-check' },
  teams:         { label: 'MS Teams',          icon: 'message-square' },
  iaReadiness:   { label: 'Copilot Readiness', icon: 'sparkles' },
}

function scoreColor(score) {
  if (score == null) return null
  if (score >= 4) return 'var(--score-5)'
  if (score >= 3) return 'var(--score-3)'
  if (score >= 2) return 'var(--score-2)'
  return 'var(--score-0)'
}

function NavItem({ item, active, onClick }) {
  const color = scoreColor(item.score)
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 8px', borderRadius: 8,
      background: active ? 'var(--brand-50)' : 'transparent',
      border: '1px solid transparent',
      borderColor: active ? 'var(--brand-100)' : 'transparent',
      color: active ? 'var(--brand-700)' : 'var(--fg-1)',
      fontSize: 13, fontWeight: active ? 600 : 500, fontFamily: 'inherit', cursor: 'pointer',
      textAlign: 'left', width: '100%',
    }}>
      <Icon name={item.icon} size={16} style={{ color: active ? 'var(--brand-600)' : 'var(--fg-3)' }} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.score != null && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
          <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{item.score.toFixed(1)}</span>
        </span>
      )}
      {item.badge && <Pill tone="brand" style={{ height: 18, fontSize: 10, padding: '0 6px' }}>{item.badge}</Pill>}
      {item.alert && <Icon name="alert-triangle" size={12} style={{ color: 'var(--err-fg)' }} />}
    </button>
  )
}

export default function SideNav({ active, onSelect, result }) {
  const recCount = result?.recommendations?.total
  const domainItems = DOMAIN_ORDER.map(id => {
    const meta = DOMAIN_META[id]
    const score = result?.domains?.[id]?.domainScore ?? null
    const alert = score != null && score < 2
    return { id, ...meta, score, alert }
  })

  const groups = [
    {
      group: null,
      items: [{ id: 'overview', icon: 'layout-dashboard', label: 'Overview' }],
    },
    {
      group: 'Domínios',
      items: domainItems,
    },
    {
      group: 'Insights',
      items: [
        { id: 'zeroTrust', icon: 'key-round', label: 'Zero Trust' },
        { id: 'recommendations', icon: 'list-checks', label: 'Recomendações', badge: recCount ? String(recCount) : null },
        { id: 'history', icon: 'history', label: 'Histórico' },
        { id: 'logs', icon: 'scroll-text', label: 'Logs de execução' },
      ],
    },
    {
      group: 'Configuração',
      items: [
        { id: 'cadastro', icon: 'building-2', label: 'Cadastro' },
        { id: 'environment', icon: 'cloud', label: 'Ambiente' },
        { id: 'tenants', icon: 'users-round', label: 'Tenants' },
        { id: 'consent', icon: 'key-round', label: 'Consent' },
      ],
    },
  ]

  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: 'var(--bg-card)', borderRight: '1px solid var(--border-1)',
      padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 20,
      overflowY: 'auto',
    }}>
      {groups.map((g, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {g.group && (
            <div style={{ padding: '0 8px 4px', fontSize: 10, fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {g.group}
            </div>
          )}
          {g.items.map(it => (
            <NavItem key={it.id} item={it} active={active === it.id} onClick={() => onSelect(it.id)} />
          ))}
        </div>
      ))}
    </aside>
  )
}
