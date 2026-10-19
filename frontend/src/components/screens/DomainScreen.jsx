import { useEffect, useState } from 'react'
import { PageHeader, Card, Btn, Pill, MetricStat, Icon } from '../primitives/index.jsx'

const DOMAIN_META = {
  baseline:      { label: 'Baseline',         icon: 'building-2',   subtitle: 'Coletores que avaliam licenciamento, usuários e adoção de serviços Microsoft 365.' },
  entraId:       { label: 'Entra ID',          icon: 'shield-check', subtitle: 'Coletores que avaliam identidade, autenticação, privilégios e proteção de risco no tenant.' },
  sharePoint:    { label: 'SharePoint',        icon: 'folder-tree',  subtitle: 'Coletores que avaliam permissões, ownership, conteúdo obsoleto, arquivos e armazenamento.' },
  governance:    { label: 'Governança',        icon: 'scale',        subtitle: 'Coletores que avaliam classificação de dados, auditoria, DLP e retenção.' },
  emailSecurity: { label: 'Email Security',    icon: 'mail-check',   subtitle: 'Coletores que verificam registros DNS de segurança de email (SPF, DMARC, DKIM).' },
  teams:         { label: 'MS Teams',          icon: 'message-square', subtitle: 'Coletores que avaliam governança de acesso externo e apps do Microsoft Teams.' },
  iaReadiness:   { label: 'Copilot Readiness', icon: 'sparkles',     subtitle: 'Síntese dos pré-requisitos técnicos para deployment seguro do Microsoft 365 Copilot.' },
}

const COLLECTOR_META = {
  // Baseline
  tenantInfo:        { label: 'Informações do Tenant', weight: null, informational: true, requires: 'Organization.Read.All',
    description: 'Coleta informações básicas do tenant: domínio principal, país, número de usuários, grupos, apps registrados e dispositivos no Entra ID.' },
  licensing:         { label: 'Licenciamento',          weight: 3,   requires: 'Organization.Read.All',
    description: 'Analisa SKUs de licença adquiridos, atribuídos e disponíveis. Licenças ociosas representam custo sem uso; superalocação pode indicar acesso indevido.' },
  users:             { label: 'Usuários',               weight: 3,   requires: 'User.Read.All',
    description: 'Perfil da base de usuários — membros ativos, inativos, desabilitados e proporção de guests. Contas inativas são vetores silenciosos de comprometimento.' },
  usage:             { label: 'Adoção / MAU',           weight: 2,   requires: 'Reports.Read.All',
    description: 'Taxa de adoção real dos serviços M365 (Exchange, Teams, SharePoint, OneDrive) nos últimos 30 dias. Baixa adoção reduz o ROI do investimento em licenças.' },
  // Entra ID
  mfa:               { label: 'MFA Coverage',                      weight: 2, requires: 'Entra P1 + UserAuthenticationMethod.Read.All',
    description: 'Percentual de usuários com ao menos um método MFA registrado. Sem MFA, uma senha vazada é suficiente para comprometer a conta — e o Copilot herdaria esse acesso.' },
  conditionalAccess: { label: 'Conditional Access',                weight: 2, requires: 'Entra P1 + Policy.Read.All',
    description: 'Políticas que controlam quem acessa o quê, de onde e com qual dispositivo. Sem CA, qualquer credencial válida garante acesso irrestrito ao ambiente.' },
  privileged:        { label: 'Privileged Roles',                  weight: 2, requires: 'RoleManagement.Read.Directory',
    description: 'Inventário de contas com roles administrativas elevadas. Excesso de Global Admins amplia a superfície de ataque; PIM mitiga com ativação just-in-time.' },
  guests:            { label: 'Guest Users',                       weight: 1, requires: 'User.Read.All',
    description: 'Convidados externos ativos — parceiros, fornecedores ou clientes com acesso a recursos internos. Guests inativos há mais de 90 dias são risco silencioso.' },
  riskySignIns:      { label: 'Entradas arriscadas',               weight: 2, requires: 'Entra P1/P2 + IdentityRiskEvent.Read.All',
    description: 'Top 20 detecções de risco de sign-in nos últimos 7 dias: usuário, IP, localização, nível, estado e tipo de risco. Equivale ao relatório de Entradas arriscadas do Entra.' },
  // SharePoint
  permissions:       { label: 'Permissões / Sharing',   weight: 3, requires: 'Sites.Read.All',
    description: 'Configuração global de compartilhamento — se links anônimos estão habilitados e o nível de abertura do OneDrive. Links anônimos permitem acesso sem autenticação.' },
  ownership:         { label: 'Ownership de Sites',      weight: 3, requires: 'Sites.Read.All, User.Read.All',
    description: 'Sites sem dono ativo (proprietário ausente ou conta desabilitada). Sem responsável, o site fica fora de qualquer ciclo de revisão e governança.' },
  oversharing:       { label: 'Oversharing (Everyone)',  weight: 3, requires: 'Sites.Read.All',
    description: 'Sites com permissão explícita para "Everyone" — acesso automático a todos no tenant. O Copilot amplifica isso ao indexar e citar esse conteúdo para qualquer usuário.' },
  staleContent:      { label: 'Conteúdo Obsoleto',       weight: 2, requires: 'Sites.Read.All',
    description: 'Sites sem atividade nos últimos 180 dias. Conteúdo obsoleto pode ser citado pelo Copilot como informação atual, gerando respostas imprecisas.' },
  files:             { label: 'Arquivos (grandes/dupl)', weight: 2, requires: 'Sites.Read.All, Files.Read.All',
    description: 'Arquivos excepcionalmente grandes (>100 MB) que impactam performance de sincronização e podem indicar repositórios de dados não gerenciados.' },
  storage:           { label: 'Armazenamento',           weight: 2, requires: 'Sites.Read.All',
    description: 'Percentual de utilização do armazenamento SharePoint total alocado para o tenant.' },
  // Governance
  sensitivityLabels: { label: 'Sensitivity Labels',      weight: 3, requires: 'InformationProtectionPolicy.Read.All',
    description: 'Rótulos de sensibilidade publicados (ex: Público, Confidencial). Sem labels, o Copilot não distingue dados sigilosos de públicos ao gerar respostas.' },
  audit:             { label: 'Unified Audit Log',        weight: 3, requires: 'AuditLog.Read.All',
    description: 'Unified Audit Log ativo com eventos recentes. Sem auditoria, não é possível rastrear o que o Copilot acessou ou investigar incidentes de vazamento de dados.' },
  dlp:               { label: 'DLP Policies',             weight: null, informational: true, requires: 'Purview (não listável via Graph)',
    description: 'Políticas DLP do Purview não são listáveis com permissão de aplicação. Alertas de DLP aparecem só como contexto e não entram no score.' },
  retentionPolicies: { label: 'Retention Policies',       weight: 2, requires: 'RecordsManagement.Read.All',
    description: 'Políticas que definem por quanto tempo dados são mantidos antes de serem arquivados ou excluídos — fundamento para compliance com LGPD, SOX e similares.' },
  retentionLabels:   { label: 'Retention Labels',         weight: 2, requires: 'Delegada RecordsManagement.Read.All (aplicação não suportada)',
    description: 'Rótulos de retenção aplicados a conteúdo. O Graph só documenta leitura com permissão delegada; com client_credentials o coletor fica indisponível e não altera o score.' },
  // Email Security
  spf:               { label: 'SPF',   weight: 2, requires: 'DNS lookup',
    description: 'Registro DNS que lista quais servidores estão autorizados a enviar email em nome do domínio. Sem SPF, qualquer servidor pode se passar pelo seu domínio.' },
  dmarc:             { label: 'DMARC', weight: 2, requires: 'DNS lookup',
    description: 'Política que instrui servidores receptores a rejeitar emails que falham SPF/DKIM. "p=reject" é o nível mais seguro e bloqueia phishing de domínio próprio.' },
  dkim:              { label: 'DKIM',  weight: 2, requires: 'DNS lookup',
    description: 'Assinatura criptográfica no cabeçalho do email que autentica o remetente e garante que o conteúdo não foi alterado em trânsito.' },
  // Entra ID — novos coletores V2
  legacyAuth:        { label: 'Legacy Authentication', weight: 2, requires: 'AuditLog.Read.All',
    description: 'Sign-ins detectados via protocolos legados (SMTP, IMAP, POP3, Basic Auth) nos últimos 30 dias. Esses protocolos ignoram MFA e Conditional Access completamente.' },
  sspr:              { label: 'SSPR Coverage',          weight: 1, requires: 'Entra P1 + UserAuthenticationMethod.Read.All',
    description: 'Percentual de usuários com Self-Service Password Reset configurado. SSPR reduz chamados de suporte e elimina a necessidade de resets inseguros via helpdesk.' },
  breakGlass:        { label: 'Break-Glass Accounts',   weight: 1, requires: 'User.Read.All + Policy.Read.All',
    description: 'Contas de emergência (break-glass) cloud-only excluídas de todas as CA policies. Sem elas, uma política mal configurada pode bloquear todos os admins do tenant.' },
  appPermissions:    { label: 'App Permissions',         weight: 2, requires: 'Application.Read.All',
    description: 'Apps e service principals com permissões de alto impacto (Mail.ReadWrite, Files.ReadWrite.All etc.) via admin consent. Cada app é um vetor potencial de exfiltração de dados.' },
  // Teams
  teamsExternalAccess: { label: 'External Access',        weight: 2, requires: 'Policy.Read.All',
    description: 'Configurações de federação e acesso externo do Teams — controla se usuários externos podem iniciar contato e de quais domínios. Federação irrestrita amplia a superfície de engenharia social.' },
  teamsSettings:       { label: 'Teams App Governance',   weight: 1, requires: 'Teams Admin ou TeamworkDevice.Read.All',
    description: 'Governança de apps no Teams — se usuários podem instalar apps de terceiros sem aprovação do admin. Apps não revisadas podem expandir o escopo de dados acessíveis pelo Copilot. Endpoint requer permissão de administrador Teams, indisponível via App Registration padrão.' },
  appsChannel:       { label: 'M365 Apps (desktop)',    weight: 2, requires: 'Reports.Read.All',
    description: 'Percentual de usuários com Microsoft 365 Apps instalado em dispositivo desktop. O Copilot só aparece no Office instalado — usuários web-only não têm acesso ao botão do Copilot.' },
}

function scoreColor(score) {
  if (score == null) return 'var(--neutral-fg)'
  if (score >= 4) return 'var(--score-5)'
  if (score >= 3) return 'var(--score-3)'
  if (score >= 2) return 'var(--score-2)'
  return 'var(--score-0)'
}

function displayScore(data) {
  if (!data) return null
  if (typeof data.score === 'number') return data.score
  if (data.unavailable) return 0
  return null
}

function isInformationalCollector(id, data) {
  const meta = COLLECTOR_META[id]
  return Boolean(data && !data.unavailable && (data.informational || meta?.informational || meta?.weight == null))
}

function collectorStatus(id, data) {
  if (!data) return 'neutral'
  if (data.unavailable) return 'neutral'
  if (isInformationalCollector(id, data)) return 'info'
  if (data.score == null) return 'neutral'
  if (data.score >= 4) return 'ok'
  if (data.score >= 3) return 'warn'
  return 'err'
}

function collectorMetric(id, data) {
  if (!data) return { value: '—', sub: 'indisponível' }
  const s = data.summary || {}
  if (data.unavailable) {
    switch (id) {
      case 'legacyAuth': return { value: 'Não verificado', sub: 'sign-in logs indisponíveis' }
      case 'breakGlass': return { value: 'Não configurado', sub: 'sem evidência coletada' }
      case 'riskySignIns': return { value: 'Não configurado', sub: 'Identity Risk Events' }
      case 'dlp': return {
        value: typeof s.alertsInPeriod === 'number' ? String(s.alertsInPeriod) : '—',
        sub: typeof s.alertsInPeriod === 'number' ? 'alertas em 30d; política não lida' : 'política DLP fora do Graph',
      }
      case 'retentionLabels': return { value: '—', sub: 'sem permissão de aplicação' }
      default: return { value: '—', sub: 'indisponível' }
    }
  }
  switch (id) {
    case 'tenantInfo': return { value: data.defaultDomain || data.displayName || '—', sub: data.country || 'domínio padrão' }
    case 'mfa': return { value: `${s.coveragePercent ?? '—'}%`, sub: (s.mfaRegistered != null && s.total != null) ? `${s.mfaRegistered} / ${s.total} usuários` : 'usuários com MFA' }
    case 'conditionalAccess': return { value: `${s.enabled ?? 0}`, sub: 'políticas ativas' }
    case 'privileged': return { value: `${s.globalAdminCount ?? '?'}`, sub: 'Global Admins' }
    case 'guests': return { value: `${s.total ?? '?'}`, sub: `${s.inactive ?? 0} inativos` }
    case 'riskySignIns': return { value: `${s.total ?? 0}`, sub: `${s.distinctUsers ?? 0} usuários / ${s.distinctIps ?? 0} IPs` }
    case 'licensing': return { value: `${s.totalLicenses ?? '?'}`, sub: `${s.totalAvailable ?? 0} disponíveis` }
    case 'users': return { value: `${s.total ?? '?'}`, sub: `${s.active ?? '?'} membros ativos` }
    case 'usage': {
      const m365Unavail = s.m365MetricUnavailable || (s.m365Total === 0 && (s.services?.exchange?.active > 0 || s.services?.teams?.active > 0))
      if (m365Unavail) {
        const excPct = s.services?.exchange?.adoptionPercent
        return { value: excPct != null ? `${excPct}%` : `${s.adoptionPercent ?? '?'}%`, sub: 'Exchange (métrica M365 via proxy)' }
      }
      return { value: `${s.adoptionPercent ?? '?'}%`, sub: 'adoção M365 (30d)' }
    }
    case 'permissions': return { value: s.anonymousLinksAllowed ? 'Habilitado' : 'Restrito', sub: 'links anônimos' }
    case 'ownership': return { value: `${(s.ownerlessCount || 0) + (s.disabledOwnerCount || 0)}`, sub: 'sites sem owner válido' }
    case 'oversharing': return { value: `${s.sitesWithEveryoneCount ?? 0}`, sub: `sites com "Everyone" de ${s.sitesSampled ?? '?'} amostrados` }
    case 'staleContent': return { value: `${s.staleRatioPercent ?? '?'}%`, sub: `sites inativos >${s.stalePeriodDays ?? 90}d` }
    case 'files': return { value: `${s.largeFilesCount ?? 0}`, sub: 'arquivos >100MB' }
    case 'storage': return { value: `${s.utilizationPercent ?? '?'}%`, sub: `${formatGB(s.totalStorageGB)} de ${formatGB(s.totalAllocatedGB)}` }
    case 'sensitivityLabels': return { value: `${s.totalLabels ?? 0}`, sub: 'labels publicadas' }
    case 'audit': return { value: s.recentEventsFound > 0 ? 'Ativo' : 'Inativo', sub: 'últimos 30 dias' }
    case 'dlp': return {
      value: typeof s.alertsInPeriod === 'number' ? String(s.alertsInPeriod) : '—',
      sub: 'alertas; política não lida',
    }
    case 'retentionPolicies': return { value: `${s.totalPolicies ?? 0}`, sub: 'políticas de retenção' }
    case 'retentionLabels': return { value: `${s.totalLabels ?? 0}`, sub: 'rótulos de retenção' }
    case 'spf': return { value: s.present ? 'Presente' : 'Ausente', sub: s.qualifier || '—' }
    case 'dmarc': return { value: s.present ? 'Presente' : 'Ausente', sub: `p=${s.policy || '?'}` }
    case 'dkim':                 return { value: s.configured ? 'Configurado' : 'Ausente', sub: 'Exchange Online' }
    case 'legacyAuth':           return { value: `${s.legacySignInCount ?? 0}`, sub: `sign-ins legados (${s.distinctUsers ?? 0} usuários)` }
    case 'sspr':                 return { value: `${s.coveragePercent ?? '?'}%`, sub: `${s.ssprRegistered ?? 0} / ${s.total ?? 0} usuários` }
    case 'breakGlass':           return { value: s.breakGlassDetected ? 'Detectado' : 'Ausente', sub: `${s.globalAdminCount ?? 0} Global Admins` }
    case 'appPermissions':       return { value: `${s.appsWithHighRiskPerms ?? 0}`, sub: `apps com permissões alto risco de ${s.totalApps ?? 0}` }
    case 'teamsExternalAccess':  return { value: s.allowsAllExternalDomains ? 'Aberto' : 'Restrito', sub: `${s.federatedDomainsCount ?? 0} domínios federados` }
    case 'teamsSettings':        return { value: s.thirdPartyAppsAllowed ? 'Sem controle' : 'Governado', sub: 'apps de terceiros' }
    case 'appsChannel': {
      const denominator = s.eligibleLicenseUsers || s.totalUsers
      const installed = s.desktopUsersCount ?? ((s.windowsUsersCount ?? 0) + (s.macUsersCount ?? 0))
      return {
        value: `${s.desktopPercent ?? '?'}%`,
        sub: denominator ? `${installed} de ${denominator} elegíveis instalaram` : 'usuários com desktop client',
      }
    }
    default: return { value: `${data.score?.toFixed(1) ?? '?'}`, sub: 'score' }
  }
}

function collectorDetail(id, data, allCollectors = {}) {
  if (!data) return 'Recurso indisponível — verifique a licença ou a permissão necessária.'
  if (data.unavailable) {
    switch (id) {
      case 'legacyAuth':
        return 'Não foi possível verificar sign-ins por autenticação legada. Confirme AuditLog.Read.All e disponibilidade dos sign-in logs no tenant antes de considerar o risco como tratado.'
      case 'breakGlass':
        return 'Nenhuma evidência de conta break-glass configurada foi coletada. Trate como não configurado até validar ao menos 2 contas cloud-only de emergência excluídas das políticas de Conditional Access.'
      case 'riskySignIns':
        return 'As detecções de entradas arriscadas não estão disponíveis ou não foram consentidas. Confirme IdentityRiskEvent.Read.All e licenciamento Entra P1/P2 para coletar este relatório.'
      case 'dlp':
        return data.reason || 'Políticas DLP do Purview não são listáveis via Microsoft Graph com permissão de aplicação.'
      case 'retentionLabels':
        return data.reason || 'Rótulos de retenção não podem ser lidos com client_credentials.'
      default:
        return 'Recurso indisponível — verifique a licença ou a permissão necessária.'
    }
  }
  const s = data.summary || {}
  switch (id) {
    case 'tenantInfo': {
      const domains = data.verifiedDomains?.length ?? 0
      const created = data.createdDateTime ? new Date(data.createdDateTime).toLocaleDateString('pt-BR') : '?'
      return `${data.displayName || '?'}. Domínio padrão: ${data.defaultDomain || '?'}. País: ${data.country || '?'}. ${domains} domínio(s) verificado(s). Tenant criado em ${created}.`
    }
    case 'mfa': return `${s.mfaRegistered ?? '?'} usuários com pelo menos um método MFA registrado. ${s.total != null && s.mfaRegistered != null ? s.total - s.mfaRegistered : '?'} contas sem método.`
    case 'conditionalAccess': return s.enabled === 0 ? 'Nenhuma política de CA configurada.' : `${s.enabled} políticas ativas. MFA enforced: ${s.mfaEnforced ? 'sim' : 'não'}. Legacy auth bloqueado: ${s.blockLegacyAuth ? 'sim' : 'não'}.`
    case 'privileged': return `${s.globalAdminCount ?? '?'} Global Administrators. PIM em uso: ${s.pimEnabled ? 'sim' : 'não'}.`
    case 'guests': return `${s.total ?? '?'} contas guest. ${s.inactive ?? 0} inativas há >90 dias.`
    case 'riskySignIns': return `${s.total ?? 0} entrada(s) arriscada(s) coletada(s) no Top ${s.cappedAt ?? 20} dos últimos ${s.periodDays ?? 7} dias envolvendo ${s.distinctUsers ?? 0} usuário(s) e ${s.distinctIps ?? 0} IP(s). Alto risco: ${s.highRisk ?? 0}; médio: ${s.mediumRisk ?? 0}.`
    case 'licensing': return `${s.totalLicenses ?? '?'} licenças totais (${s.paidLicenses ?? 0} pagas, ${s.freeLicenses ?? 0} gratuitas). ${s.totalAssigned ?? 0} atribuídas, ${s.totalAvailable ?? 0} disponíveis (${s.unusedRatioPercent ?? 0}% ociosas). Tier Entra ID: ${data.entraIdTier || '?'}.`
    case 'users': return `${s.total ?? '?'} usuários totais — ${s.members ?? 0} membros, ${s.guests ?? 0} guests. ${s.active ?? '?'} membros ativos. ${s.disabled ?? 0} contas desabilitadas (${s.disabledRatioPercent ?? 0}%). Proporção de guests: ${s.guestRatioPercent ?? 0}%.`
    case 'usage': {
      const svc = s.services || {}
      const parts = []
      if (svc.exchange?.adoptionPercent != null) parts.push(`Exchange ${svc.exchange.adoptionPercent}%`)
      if (svc.teams?.adoptionPercent != null) parts.push(`Teams ${svc.teams.adoptionPercent}%`)
      if (svc.sharePoint?.adoptionPercent != null) parts.push(`SharePoint ${svc.sharePoint.adoptionPercent}%`)
      if (svc.oneDrive?.adoptionPercent != null) parts.push(`OneDrive ${svc.oneDrive.adoptionPercent}%`)
      return `${s.adoptionPercent ?? '?'}% dos usuários M365 ativos nos últimos 30 dias (${s.m365Active ?? '?'} de ${s.m365Total ?? '?'}).${parts.length ? ' Por serviço: ' + parts.join(', ') + '.' : ''}`
    }
    case 'permissions': {
      const sharingLabels = {
        disabled: 'Compartilhamento externo desabilitado',
        existingExternalUserSharingOnly: 'Apenas usuários externos já convidados',
        externalUserSharingOnly: 'Usuários externos autenticados',
        externalUserAndGuestSharing: 'Usuários externos e convidados anônimos (mais permissivo)',
      }
      const sharingLabel = sharingLabels[s.sharingCapability] || s.sharingCapability || '?'
      return `Links anônimos: ${s.anonymousLinksAllowed ? 'habilitados' : 'desabilitados'}. Nível de sharing: ${sharingLabel}.`
    }
    case 'ownership': return `${s.ownerlessCount ?? 0} sites sem owner. ${s.disabledOwnerCount ?? 0} sites com owner desativado. ${s.groupsChecked ?? 0} groups M365 verificados.`
    case 'oversharing': {
      const count = s.sitesWithEveryoneCount ?? 0
      if (count === 0) return `Nenhum site com permissão "Everyone" detectado nos ${s.sitesSampled ?? 0} sites amostrados. Risco de oversharing interno não identificado.`
      return `${count} site(s) com permissão explícita para "Everyone" — qualquer usuário do tenant acessa esses conteúdos. Risco crítico para adoção do Copilot.`
    }
    case 'staleContent': return `${s.staleSiteCount ?? 0} sites sem atividade há >${s.stalePeriodDays ?? 180} dias (${s.staleRatioPercent ?? '?'}% do total de ${s.totalSites ?? '?'} sites).`
    case 'files': return `${s.largeFilesCount ?? 0} arquivos acima de 100MB. ${s.duplicateGroupsCount ?? 0} grupos de duplicatas.`
    case 'storage': return `${s.totalStorageGB ?? '?'} GB usados de ${s.totalAllocatedGB ?? '?'} GB alocados (${s.utilizationPercent ?? '?'}% utilização). ${s.sitesCritical ?? 0} sites críticos, ${s.sitesNearing ?? 0} próximos do limite.`
    case 'sensitivityLabels': return `${s.totalLabels ?? 0} labels publicadas. ${s.sublabelCount ?? 0} sublabels. Auto-label: ${s.autoLabelEnabled ? 'ativo' : 'inativo'}.`
    case 'audit': return s.recentEventsFound > 0 ? 'Unified Audit Log ativo com eventos nos últimos 30 dias.' : 'Nenhum evento encontrado — UAL pode estar inativo.'
    case 'spf': return s.present ? `Registro SPF presente. Qualifier: ${s.qualifier || '?'}.` : 'Registro SPF ausente — domínio vulnerável a spoofing.'
    case 'dmarc': return s.present ? `DMARC configurado com p=${s.policy || '?'}.` : 'Registro DMARC ausente.'
    case 'dkim': return s.configured ? 'DKIM configurado para Exchange Online.' : 'DKIM não detectado para Exchange Online.'
    case 'legacyAuth': {
      const count = s.legacySignInCount ?? 0
      if (count === 0) return `Nenhum sign-in via protocolo legado detectado nos últimos 30 dias. SMTP, IMAP e Basic Auth bloqueados com sucesso.`
      return `${count} sign-in(s) via protocolo legado nos últimos 30 dias (${s.distinctUsers ?? 0} usuário(s) distintos). Protocolos detectados: SMTP, IMAP e similares ignoram MFA e Conditional Access — cada usuário afetado é um vetor de comprometimento não protegido.`
    }
    case 'sspr': {
      const pct = s.coveragePercent ?? 0
      return `${s.ssprRegistered ?? 0} de ${s.total ?? 0} usuários com SSPR configurado (${pct}% de cobertura). ${pct >= 80 ? 'Cobertura adequada.' : 'Usuários sem SSPR precisam resetar senha via helpdesk — processo mais lento e suscetível a engenharia social.'}`
    }
    case 'breakGlass': {
      if (s.breakGlassDetected) return `${s.breakGlassCandidatesCount ?? 0} conta(s) break-glass detectada(s) — cloud-only, excluídas de todas as CA policies. Configuração recomendada para emergências de lockout administrativo.`
      return `Nenhuma conta break-glass detectada entre os ${s.globalAdminCount ?? 0} Global Admins. Recomendado: ao menos 2 contas cloud-only excluídas de todas as CA policies como contingência de emergência.`
    }
    case 'appPermissions': {
      const risky = s.appsWithHighRiskPerms ?? 0
      const total = s.totalApps ?? 0
      const expiring = s.secretsExpiringSoon ?? 0
      if (risky === 0) return `${total} aplicações analisadas. Nenhuma com permissões de alto risco (Mail.ReadWrite, Files.ReadWrite.All etc.) via admin consent.${expiring > 0 ? ` Atenção: ${expiring} segredo(s) de app expirando nos próximos 30 dias.` : ''}`
      return `${risky} de ${total} aplicações com permissões de alto risco (Mail.ReadWrite, Files.ReadWrite.All etc.) via admin consent. Cada app com essas permissões é um vetor potencial de exfiltração de dados — revisão e revogação recomendadas.${expiring > 0 ? ` ${expiring} segredo(s) expirando em breve.` : ''}`
    }
    case 'teamsExternalAccess': {
      const open = s.allowsAllExternalDomains
      const guest = s.guestAccessEnabled
      const fedCount = s.federatedDomainsCount ?? 0
      if (!open && !guest) return `Acesso externo totalmente restrito — federação e guest bloqueados. Máxima proteção contra engenharia social via Teams.`
      if (!open && fedCount > 0) return `Federação restrita a ${fedCount} domínio(s) específico(s). Guest access ${guest ? 'habilitado' : 'bloqueado'}. Controle seletivo de parceiros externos — configuração adequada.`
      if (!open) return `Federação não irrestrita. Guest access ${guest ? 'habilitado — monitore convidados inativos' : 'bloqueado'}.`
      return `Federação com todos os domínios externos habilitada. Guest access ${guest ? 'habilitado' : 'bloqueado'}. Qualquer usuário externo pode iniciar contato — risco de engenharia social elevado.`
    }
    case 'teamsSettings': {
      const thirdParty = s.thirdPartyAppsAllowed
      const sideload = s.sideloadingEnabled
      if (!thirdParty && !sideload) return `Apps de terceiros e sideloading bloqueados por política de admin. Apenas apps aprovados pelo administrador podem ser instalados no Teams.`
      if (!thirdParty) return `Apps de terceiros bloqueados. Sideloading de apps customizados ainda permitido — avaliar se há necessidade de restringir.`
      if (!sideload) return `Apps de terceiros permitidos, mas sideloading bloqueado. Recomendado revisar quais apps de terceiros estão autorizados na Teams Store.`
      return `Sem controle de apps de terceiros — usuários podem instalar apps sem aprovação do admin. Apps não revisados podem expandir o escopo de dados acessíveis pelo Copilot.`
    }
    case 'appsChannel': {
      const denominator = s.eligibleLicenseUsers || s.totalUsers
      const installed = s.desktopUsersCount ?? ((s.windowsUsersCount ?? 0) + (s.macUsersCount ?? 0))
      const basis = s.eligibleLicenseUsers
        ? 'usuários com licença que inclui instalação desktop'
        : 'usuários reportados no relatório de M365 Apps'
      return `${installed} de ${denominator ?? '?'} ${basis} usaram M365 Apps em Windows ou Mac nos últimos 30 dias (${s.desktopPercent ?? '?'}%). Windows: ${s.windowsUsersCount ?? 0}, Mac: ${s.macUsersCount ?? 0}, web-only: ${s.webOnlyUsersCount ?? 0}. ${s.channelNote || 'Verificar canal de atualização no Intune.'}`
    }
    default: return JSON.stringify(data.summary || data || {}, null, 2).slice(0, 300)
  }
}

function formatGB(gb) {
  if (gb == null || gb === '?') return '—'
  const n = typeof gb === 'string' ? parseFloat(gb) : gb
  if (isNaN(n)) return '—'
  if (n >= 1024) return `${(n / 1024).toFixed(1)} TB`
  return `${n} GB`
}

function formatMB(mb) {
  if (mb == null) return '—'
  if (mb >= 1024 * 1024) return `${(mb / (1024 * 1024)).toFixed(1)} TB`
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function FilesDetailContent({ data }) {
  const s = data?.summary || {}
  const largeFiles = data?.largeFiles || []
  const dupGroups = data?.duplicates || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Arquivos grandes (>100MB)', value: s.largeFilesCount ?? 0 },
          { label: 'Grupos de duplicatas',      value: s.duplicateGroupsCount ?? 0 },
          { label: 'Arquivos obsoletos (>12m)', value: s.staleFilesCount ?? 0 },
        ].map(m => (
          <div key={m.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)' }}>
            <div className="t-2xs" style={{ marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontWeight: 700, fontSize: 22, lineHeight: 1, color: m.value > 0 ? 'var(--score-0)' : 'var(--score-5)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {largeFiles.length > 0 && (
        <div>
          <div className="t-2xs" style={{ marginBottom: 8 }}>Top {largeFiles.length} arquivos grandes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {largeFiles.map((f, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center',
                padding: '8px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div className="t-sm" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </div>
                  <div className="t-xs" style={{ color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.site}
                  </div>
                </div>
                <span className="t-xs" style={{ color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
                  {f.lastModifiedDateTime ? new Date(f.lastModifiedDateTime).toLocaleDateString('pt-BR') : '—'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--score-0)', whiteSpace: 'nowrap' }}>
                  {formatMB(Math.round(f.sizeBytes / (1024 * 1024)))}
                </span>
              </div>
            ))}
          </div>
          {s.coverage && (
            <div className="t-xs" style={{ color: 'var(--fg-3)', marginTop: 6 }}>Cobertura: {s.coverage}</div>
          )}
        </div>
      )}

      {dupGroups.length > 0 && (
        <div>
          <div className="t-2xs" style={{ marginBottom: 8 }}>Top {dupGroups.length} grupos de duplicatas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {dupGroups.map((g, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center',
                padding: '6px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)',
              }}>
                <div className="t-sm" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.files?.[0]?.name || '—'}
                </div>
                <span className="t-xs" style={{ color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{g.copies}× cópias</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--warn-fg)', whiteSpace: 'nowrap' }}>
                  {formatMB(Math.round(g.wastedBytes / (1024 * 1024)))} desperdiçados
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EmailSecurityMatrixContent({ domainData }) {
  const matrix = domainData?.domainsMatrix
  if (!matrix || matrix.length === 0) return null

  function StatusDot({ ok }) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontWeight: 600, fontSize: 12,
        color: ok ? 'var(--ok-fg)' : 'var(--err-fg)',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: ok ? 'var(--ok-fg)' : 'var(--err-fg)', flexShrink: 0 }} />
        {ok ? 'OK' : 'Ausente'}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div className="t-2xs" style={{ marginBottom: 8 }}>Status por domínio ({matrix.length} domínios)</div>
      <div style={{ border: '1px solid var(--border-1)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px',
          padding: '8px 12px', background: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border-1)',
        }}>
          <span className="t-2xs">Domínio</span>
          <span className="t-2xs" style={{ textAlign: 'center' }}>SPF</span>
          <span className="t-2xs" style={{ textAlign: 'center' }}>DMARC</span>
          <span className="t-2xs" style={{ textAlign: 'center' }}>DKIM</span>
        </div>
        {matrix.map((row, i) => (
          <div key={row.domain} style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px',
            padding: '10px 12px', alignItems: 'center',
            background: row.isPrimary ? 'var(--brand-50)' : 'transparent',
            borderTop: i === 0 ? 'none' : '1px solid var(--border-1)',
          }}>
            <div style={{ minWidth: 0 }}>
              <span translate="no" className="t-sm" style={{ fontWeight: row.isPrimary ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                {row.domain}
              </span>
              {row.isPrimary && <span className="t-xs" style={{ color: 'var(--brand-600)' }}>primário</span>}
            </div>
            <div style={{ textAlign: 'center' }}>
              {row.spf ? <StatusDot ok={row.spf.present} /> : <span className="t-xs" style={{ color: 'var(--fg-3)' }}>—</span>}
            </div>
            <div style={{ textAlign: 'center' }}>
              {row.dmarc
                ? <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <StatusDot ok={row.dmarc.present} />
                    {row.dmarc.present && row.dmarc.policy && <span className="t-xs" style={{ color: 'var(--fg-3)' }}>p={row.dmarc.policy}</span>}
                  </div>
                : <span className="t-xs" style={{ color: 'var(--fg-3)' }}>—</span>}
            </div>
            <div style={{ textAlign: 'center' }}>
              {row.dkim ? <StatusDot ok={row.dkim.configured} /> : <span className="t-xs" style={{ color: 'var(--fg-3)' }}>—</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const GRAPH_PERM_DOCS = 'https://learn.microsoft.com/en-us/graph/permissions-reference'
const ENTRA_DOCS = 'https://learn.microsoft.com/en-us/entra/identity/authentication/concept-mfa-licensing'

function RequirementBadges({ requires }) {
  if (!requires) return null
  const parts = requires.split(/\s*[,+]\s*/).map(p => p.trim()).filter(Boolean)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {parts.map((p, i) => {
        const lower = p.toLowerCase()
        const isUnavailable = lower.includes('indisponível') || lower.includes('fora do')
        const isDns = lower === 'dns lookup'
        const isLicense = lower.includes('entra p') || lower.startsWith('p1') || lower.startsWith('p2')
        const isGraphPerm = !isUnavailable && !isDns && !isLicense

        let bg, fg, border, href
        if (isUnavailable) { bg = 'var(--bg-subtle)'; fg = 'var(--fg-3)'; border = 'var(--border-1)' }
        else if (isDns)    { bg = 'var(--warn-bg)';   fg = 'var(--warn-fg)'; border = 'var(--warn-bd)'; href = null }
        else if (isLicense){ bg = 'var(--sev-medium-bg)'; fg = 'var(--sev-medium-fg)'; border = 'var(--sev-medium-bd)'; href = ENTRA_DOCS }
        else               { bg = 'var(--brand-50)';  fg = 'var(--brand-600)'; border = 'var(--brand-200)'; href = GRAPH_PERM_DOCS }

        const badge = (
          <span key={i} translate="no" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 5,
            background: bg, color: fg, border: `1px solid ${border}`,
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
            whiteSpace: 'nowrap',
          }}>{p}</span>
        )
        return href
          ? <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{badge}</a>
          : badge
      })}
    </div>
  )
}

const SVC_CONFIG = [
  { key: 'exchange',   label: 'Exchange',   color: '#0078D4' },
  { key: 'teams',      label: 'Teams',       color: '#6264A7' },
  { key: 'sharePoint', label: 'SharePoint',  color: '#038387' },
  { key: 'oneDrive',   label: 'OneDrive',    color: '#0F6CBD' },
]

function UsageDetailContent({ data }) {
  const s = data?.summary || {}
  const svcData = s.services || {}
  const m365Unavail = s.m365MetricUnavailable || (s.m365Total === 0 && (svcData.exchange?.active > 0 || svcData.teams?.active > 0))
  const overall = m365Unavail ? null : (s.adoptionPercent ?? null)
  const overallColor = overall == null ? 'var(--fg-3)' : overall >= 65 ? 'var(--score-5)' : overall >= 35 ? 'var(--score-3)' : 'var(--score-0)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {m365Unavail ? (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)' }}>
          <span style={{ color: 'var(--warn-fg)', fontWeight: 600, fontSize: 13 }}>
            Métrica M365 global indisponível para este tenant — adoção calculada por serviço abaixo.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 28, lineHeight: 1, color: overallColor }}>{overall ?? '?'}%</span>
          <span className="t-sm" style={{ color: 'var(--fg-2)' }}>
            M365 ativos (30d) · {s.m365Active ?? '?'} de {s.m365Total ?? '?'} usuários
          </span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SVC_CONFIG.map(svc => {
          const d = svcData[svc.key]
          const pct = d?.adoptionPercent ?? null
          return (
            <div key={svc.key} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 38px', gap: 10, alignItems: 'center' }}>
              <span className="t-sm" style={{ color: 'var(--fg-2)' }}>{svc.label}</span>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                {pct != null && (
                  <div style={{ width: `${pct}%`, height: '100%', background: svc.color, borderRadius: 4 }} />
                )}
              </div>
              <span className="t-sm" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--fg-1)' }}>
                {pct != null ? `${pct}%` : '—'}
              </span>
            </div>
          )
        })}
      </div>
      {s.reportDate && (
        <span className="t-xs" style={{ color: 'var(--fg-3)' }}>Relatório de {s.reportDate}</span>
      )}
    </div>
  )
}

const SUFFIX_MAP = {
  '_STUUSEBNFT': ' (Estudantes - Benefício)',
  '_STUDENT':    ' (Estudantes)',
  '_FACULTY':    ' (Docentes)',
  '_IW':         '',
  '_GOV':        ' (Gov)',
  '_GCC':        ' (Gov)',
}

function friendlySkuName(sku) {
  if (sku.displayName && sku.displayName !== sku.skuPartNumber) return sku.displayName
  let name = sku.skuPartNumber
  for (const [suffix, replacement] of Object.entries(SUFFIX_MAP)) {
    if (name.toUpperCase().endsWith(suffix)) {
      name = name.slice(0, -suffix.length) + replacement
      break
    }
  }
  return name
    .replace(/[_]+/g, ' ')
    .replace(/\(([^)]+)\)/g, (_, inner) => `(${inner.trim()})`)
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

function LicensingDetailContent({ data }) {
  const skus = data?.skus || []
  const paid = skus.filter(s => !s.isFree)
  const benefit = skus.filter(s => s.isFree)

  function SkuGroup({ items, color, emptyMsg }) {
    if (items.length === 0) return <div className="t-xs" style={{ color: 'var(--fg-3)' }}>{emptyMsg}</div>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(sku => {
          const pct = sku.enabled > 0 ? Math.round((sku.assigned / sku.enabled) * 100) : 0
          return (
            <div key={sku.skuPartNumber}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span translate="no" className="t-sm" style={{ fontWeight: 500, color: 'var(--fg-1)' }}>{friendlySkuName(sku)}</span>
                <span className="t-xs" style={{ color: 'var(--fg-3)', flexShrink: 0, marginLeft: 8 }}>
                  {sku.assigned.toLocaleString('pt-BR')} / {sku.enabled.toLocaleString('pt-BR')} · {pct}%
                </span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 5 }} />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {paid.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--brand-500)', flexShrink: 0 }} />
            <span className="t-2xs">Licenças pagas</span>
          </div>
          <SkuGroup items={paid} color="var(--brand-500)" emptyMsg="Nenhuma licença paga." />
        </div>
      )}
      {benefit.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: '#0D9488', flexShrink: 0 }} />
            <span className="t-2xs">Benefícios educacionais / governo</span>
          </div>
          <SkuGroup items={benefit} color="#0D9488" emptyMsg="Nenhuma licença de benefício." />
        </div>
      )}
      {data?.entraIdTier && (
        <div className="t-xs" style={{ color: 'var(--fg-3)', borderTop: '1px solid var(--border-1)', paddingTop: 10 }}>
          Tier <span translate="no">Entra ID</span> detectado: <b translate="no">{data.entraIdTier}</b>
        </div>
      )}
    </div>
  )
}

function StorageDetailContent({ data }) {
  const s = data?.summary || {}
  const topSites = (data?.topSitesByStorage || []).slice(0, 10)
  const maxMB = Math.max(...topSites.map(t => t.storageMB), 1)
  const utilizationPct = s.utilizationPercent ?? 0
  const concentrationPct = s.top20PercentStoragePercent ?? null
  const healthy = (s.sitesSampled ?? 0) - (s.sitesNearing ?? 0) - (s.sitesCritical ?? 0)

  function SectionHeader({ color, label }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
        <span className="t-2xs">{label}</span>
      </div>
    )
  }

  function Bar({ label, value, total, pct, color, sub }) {
    const p = pct ?? (total > 0 ? Math.round((value / total) * 100) : 0)
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <span className="t-sm" style={{ fontWeight: 500, color: 'var(--fg-1)' }}>{label}</span>
          <span className="t-xs" style={{ color: 'var(--fg-3)', flexShrink: 0, marginLeft: 8 }}>
            {value !== undefined ? `${typeof value === 'number' && value >= 1024 ? `${(value/1024).toFixed(1)} GB` : `${value} ${total !== undefined ? 'sites' : ''}`}${total !== undefined ? ` / ${s.sitesSampled ?? '?'} amostrados` : ''} · ${p}%` : `${p}%`}
          </span>
        </div>
        <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)', overflow: 'hidden' }}>
          <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: 5 }} />
        </div>
        {sub && <div className="t-xs" style={{ color: 'var(--fg-3)', marginTop: 3 }}>{sub}</div>}
      </div>
    )
  }

  const utilizationColor = utilizationPct >= 85 ? '#DC2626' : utilizationPct >= 70 ? '#D97706' : 'var(--brand-500)'
  const concentrationColor = concentrationPct == null ? 'var(--fg-3)' : concentrationPct >= 85 ? '#DC2626' : concentrationPct >= 70 ? '#D97706' : '#16A34A'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <SectionHeader color="var(--brand-500)" label="Utilização de armazenamento (sites amostrados)" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <span className="t-sm" style={{ fontWeight: 500 }}>
            <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: utilizationColor }}>{formatGB(s.totalStorageGB)}</span>
            <span className="t-xs" style={{ marginLeft: 6 }}>de {formatGB(s.totalAllocatedGB)} alocados</span>
          </span>
          <span className="t-xs" style={{ color: 'var(--fg-3)' }}>{utilizationPct}% utilizado</span>
        </div>
        <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)', overflow: 'hidden' }}>
          <div style={{ width: `${utilizationPct}%`, height: '100%', background: utilizationColor, borderRadius: 5 }} />
        </div>
        {concentrationPct != null && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span className="t-sm" style={{ fontWeight: 500 }}>Concentração (top 20% dos sites)</span>
              <span className="t-xs" style={{ color: 'var(--fg-3)' }}>
                {s.top20PercentSiteCount ?? '?'} sites · {concentrationPct}%
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)', overflow: 'hidden' }}>
              <div style={{ width: `${concentrationPct}%`, height: '100%', background: concentrationColor, borderRadius: 5 }} />
            </div>
            <div className="t-xs" style={{ color: 'var(--fg-3)', marginTop: 3 }}>
              Os {s.top20PercentSiteCount ?? '?'} maiores sites concentram {concentrationPct}% do armazenamento amostrado
            </div>
          </div>
        )}
      </div>

      <div>
        <SectionHeader color="#D97706" label="Status de cota dos sites amostrados" />
        {[
          { label: 'Saudáveis',           value: healthy,            color: '#16A34A' },
          { label: 'Próximos do limite',  value: s.sitesNearing ?? 0, color: '#D97706' },
          { label: 'Críticos / Excedidos',value: s.sitesCritical ?? 0,color: '#DC2626' },
        ].map(bar => {
          const total = s.sitesSampled ?? 0
          const pct = total > 0 ? Math.round((bar.value / total) * 100) : 0
          return (
            <div key={bar.label} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                <span className="t-sm" style={{ fontWeight: 500, color: 'var(--fg-1)' }}>{bar.label}</span>
                <span className="t-xs" style={{ color: 'var(--fg-3)' }}>{bar.value} / {total} sites · {pct}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: bar.color, borderRadius: 5 }} />
              </div>
            </div>
          )
        })}
      </div>

      {topSites.length > 0 && (
        <div>
          <SectionHeader color="#7C3AED" label={`Top ${topSites.length} sites por armazenamento`} />
          {topSites.map((site, i) => {
            const pct = Math.round((site.storageMB / maxMB) * 100)
            const color = site.quotaState === 'critical' || site.quotaState === 'exceeded' ? '#DC2626'
              : site.quotaState === 'nearing' ? '#D97706' : '#7C3AED'
            const sizeLabel = formatMB(site.storageMB)
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span translate="no" className="t-sm" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                    {site.displayName || 'Site sem nome'}
                  </span>
                  <span className="t-xs" style={{ color: 'var(--fg-3)', flexShrink: 0 }}>{sizeLabel}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {s.note && (
        <div className="t-xs" style={{ color: 'var(--fg-3)', borderTop: '1px solid var(--border-1)', paddingTop: 10 }}>
          Amostragem: {s.note}. Score baseado nos {s.sitesSampled ?? '?'} sites amostrados de {(s.totalSites ?? 0).toLocaleString('pt-BR')} totais.
        </div>
      )}
    </div>
  )
}

function UsersDetailContent({ data }) {
  const s = data?.summary || {}
  const cats = [
    { label: 'Membros ativos',        value: s.active ?? 0,    total: s.members ?? 0,   color: '#16A34A', sub: `${s.disabledRatioPercent ?? 0}% dos membros estão desabilitados` },
    { label: 'Contas desabilitadas',  value: s.disabled ?? 0,  total: s.members ?? 0,   color: '#DC2626', sub: `de ${(s.members ?? 0).toLocaleString('pt-BR')} membros totais` },
    { label: 'Convidados (Guest)',     value: s.guests ?? 0,    total: s.total ?? 0,     color: '#7C3AED', sub: `${s.guestRatioPercent ?? 0}% do total de usuários` },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {cats.map(cat => {
        const pct = cat.total > 0 ? Math.round((cat.value / cat.total) * 100) : 0
        return (
          <div key={cat.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span className="t-sm" style={{ fontWeight: 500, color: 'var(--fg-1)' }}>{cat.label}</span>
              <span className="t-xs" style={{ color: 'var(--fg-3)', flexShrink: 0, marginLeft: 8 }}>
                {cat.value.toLocaleString('pt-BR')} / {cat.total.toLocaleString('pt-BR')} · {pct}%
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: cat.color, borderRadius: 5 }} />
            </div>
            <div className="t-xs" style={{ color: 'var(--fg-3)', marginTop: 3 }}>{cat.sub}</div>
          </div>
        )
      })}
    </div>
  )
}

function AppsChannelDetailContent({ data }) {
  const s = data?.summary || {}
  const eligible = s.eligibleLicenseUsers || s.totalUsers || 0
  const installed = s.desktopUsersCount ?? ((s.windowsUsersCount ?? 0) + (s.macUsersCount ?? 0))
  const webOnly = s.webOnlyUsersCount ?? 0
  const notDetected = Math.max(0, eligible - installed)
  const cats = [
    { label: 'Desktop instalado', value: installed, total: eligible, color: '#16A34A', sub: `${s.windowsUsersCount ?? 0} Windows, ${s.macUsersCount ?? 0} Mac` },
    { label: 'Somente web',       value: webOnly,   total: eligible, color: '#F59E0B', sub: 'usaram Office na web, sem Windows/Mac detectado' },
    { label: 'Sem instalação detectada', value: notDetected, total: eligible, color: '#DC2626', sub: 'licenciados elegíveis sem uso desktop no relatório D30' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {cats.map(cat => {
        const pct = cat.total > 0 ? Math.round((cat.value / cat.total) * 100) : 0
        return (
          <div key={cat.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span className="t-sm" style={{ fontWeight: 500, color: 'var(--fg-1)' }}>{cat.label}</span>
              <span className="t-xs" style={{ color: 'var(--fg-3)', flexShrink: 0, marginLeft: 8 }}>
                {cat.value.toLocaleString('pt-BR')} / {cat.total.toLocaleString('pt-BR')} · {pct}%
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: cat.color, borderRadius: 5 }} />
            </div>
            <div className="t-xs" style={{ color: 'var(--fg-3)', marginTop: 3 }}>{cat.sub}</div>
          </div>
        )
      })}

      <div className="t-xs" style={{ color: 'var(--fg-3)', borderTop: '1px solid var(--border-1)', paddingTop: 10 }}>
        Base: {eligible.toLocaleString('pt-BR')} usuário(s) com licença que dá direito à instalação. {s.channelNote || 'Verificar canal de atualização no Intune.'}
      </div>
    </div>
  )
}

function formatDateTimeBR(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function riskLevelLabel(level) {
  const labels = { high: 'Alto', medium: 'Médio', low: 'Baixo', hidden: 'Oculto', none: 'Nenhum' }
  return labels[level] || level || '—'
}

function riskStateLabel(state) {
  const labels = {
    atRisk: 'Em risco',
    confirmedCompromised: 'Comprometido',
    confirmedSafe: 'Seguro',
    remediated: 'Remediado',
    dismissed: 'Descartado',
  }
  return labels[state] || state || '—'
}

function riskLevelColor(level) {
  if (level === 'high') return 'var(--err-fg)'
  if (level === 'medium') return 'var(--warn-fg)'
  if (level === 'low') return 'var(--brand-600)'
  return 'var(--fg-3)'
}

function RiskySignInsDetailContent({ data }) {
  const s = data?.summary || {}
  const rows = data?.riskySignIns || []

  if (rows.length === 0) {
    return (
      <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--ok-bg)', border: '1px solid var(--ok-bd)' }}>
        <span style={{ color: 'var(--ok-fg)', fontWeight: 600, fontSize: 14 }}>
          Nenhuma entrada arriscada detectada nos últimos {s.periodDays ?? 7} dias.
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'Eventos', value: s.total ?? 0, color: (s.total ?? 0) > 0 ? 'var(--score-0)' : 'var(--score-5)' },
          { label: 'Alto risco', value: s.highRisk ?? 0, color: (s.highRisk ?? 0) > 0 ? 'var(--score-0)' : 'var(--fg-2)' },
          { label: 'Usuários', value: s.distinctUsers ?? 0, color: 'var(--fg-1)' },
          { label: 'IPs', value: s.distinctIps ?? 0, color: 'var(--fg-1)' },
        ].map(m => (
          <div key={m.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)' }}>
            <div className="t-2xs" style={{ marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontWeight: 700, fontSize: 22, lineHeight: 1, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="t-2xs" style={{ marginBottom: 8 }}>Top {rows.length} entradas arriscadas</div>
        <div style={{ border: '1px solid var(--border-1)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '112px minmax(160px, 1.2fr) 112px minmax(130px, 1fr) 92px minmax(120px, 1fr)',
            gap: 10,
            padding: '8px 10px',
            background: 'var(--bg-subtle)',
            borderBottom: '1px solid var(--border-1)',
          }}>
            {['Data', 'Usuário', 'IP', 'Localização', 'Risco', 'Tipo'].map(h => <span key={h} className="t-2xs">{h}</span>)}
          </div>
          {rows.map((row, i) => (
            <div key={row.id || i} style={{
              display: 'grid',
              gridTemplateColumns: '112px minmax(160px, 1.2fr) 112px minmax(130px, 1fr) 92px minmax(120px, 1fr)',
              gap: 10,
              alignItems: 'center',
              padding: '9px 10px',
              borderTop: i === 0 ? 'none' : '1px solid var(--border-1)',
            }}>
              <span className="t-xs" style={{ color: 'var(--fg-2)', whiteSpace: 'nowrap' }}>{formatDateTimeBR(row.activityDateTime || row.detectedDateTime)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="t-sm" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.userDisplayName || row.userPrincipalName || '—'}
                </div>
                {row.userPrincipalName && <div className="t-xs" style={{ color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.userPrincipalName}</div>}
              </div>
              <span translate="no" className="t-xs" style={{ color: 'var(--fg-2)', whiteSpace: 'nowrap' }}>{row.ipAddress || '—'}</span>
              <span className="t-xs" style={{ color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.location || '—'}</span>
              <div style={{ minWidth: 0 }}>
                <div className="t-xs" style={{ fontWeight: 700, color: riskLevelColor(row.riskLevel) }}>{riskLevelLabel(row.riskLevel)}</div>
                <div className="t-xs" style={{ color: 'var(--fg-3)' }}>{riskStateLabel(row.riskState)}</div>
              </div>
              <span className="t-xs" style={{ color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.riskEventType || row.riskDetail || '—'}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="t-xs" style={{ color: 'var(--fg-3)' }}>
        Coleta limitada ao Top {s.cappedAt ?? 20} para manter o assessment rápido.
      </div>
    </div>
  )
}

function PrivilegedDetailContent({ data }) {
  const users = data?.privilegedUsers || []
  const s = data?.summary || {}
  const mfaAvailable = s.mfaDataAvailable !== false

  if (users.length === 0) {
    return <div className="t-sm" style={{ color: 'var(--fg-3)' }}>Nenhum usuário privilegiado encontrado.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {!mfaAvailable && (
        <div className="t-xs" style={{ color: 'var(--fg-3)', marginBottom: 8 }}>
          Status de MFA indisponível — permissão UserAuthenticationMethod.Read.All necessária na App Registration.
        </div>
      )}
      {users.map((u, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 8,
          background: 'var(--bg-subtle)', border: '1px solid var(--border-1)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-sm" style={{ fontWeight: 500, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {u.displayName || u.userPrincipalName}
            </div>
            <div className="t-xs" style={{ color: 'var(--fg-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {u.userPrincipalName}
            </div>
          </div>
          <span translate="no" style={{
            flexShrink: 0, fontSize: 10, fontWeight: 500,
            padding: '2px 6px', borderRadius: 4,
            background: 'var(--brand-50)', color: 'var(--brand-600)',
            border: '1px solid var(--brand-200)', whiteSpace: 'nowrap',
          }}>
            {u.role}
          </span>
          {mfaAvailable && (
            <span style={{
              flexShrink: 0, fontSize: 11, fontWeight: 600, minWidth: 44, textAlign: 'right',
              color: u.mfaRegistered ? '#16A34A' : '#DC2626',
            }}>
              {u.mfaRegistered ? '✓ MFA' : '✗ MFA'}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function OwnershipDetailContent({ data }) {
  const s = data?.summary || {}
  const ownerlessSites = data?.ownerlessSites || []
  const disabledOwnerSites = data?.disabledOwnerSites || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Sites sem owner', value: s.ownerlessCount ?? 0 },
          { label: 'Owner desativado', value: s.disabledOwnerCount ?? 0 },
          { label: 'Groups verificados', value: s.groupsChecked ?? 0, neutral: true },
        ].map(m => (
          <div key={m.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)' }}>
            <div className="t-2xs" style={{ marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontWeight: 700, fontSize: 22, lineHeight: 1, color: m.neutral ? 'var(--fg-1)' : m.value > 0 ? 'var(--score-0)' : 'var(--score-5)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {ownerlessSites.length > 0 && (
        <div>
          <div className="t-2xs" style={{ marginBottom: 8 }}>Sites sem owner ({ownerlessSites.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ownerlessSites.map((site, i) => (
              <div key={i} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)' }}>
                <div className="t-sm" style={{ fontWeight: 500 }}>{site.displayName || '—'}</div>
                {site.mail && <div className="t-xs" style={{ color: 'var(--fg-3)' }}>{site.mail}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {disabledOwnerSites.length > 0 && (
        <div>
          <div className="t-2xs" style={{ marginBottom: 8 }}>Owner desativado ({disabledOwnerSites.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {disabledOwnerSites.map((site, i) => (
              <div key={i} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)' }}>
                <div className="t-sm" style={{ fontWeight: 500 }}>{site.displayName || '—'}</div>
                {site.mail && <div className="t-xs" style={{ color: 'var(--fg-3)' }}>{site.mail}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {ownerlessSites.length === 0 && disabledOwnerSites.length === 0 && (
        <div className="t-sm" style={{ color: 'var(--score-5)' }}>Todos os sites verificados possuem owner ativo.</div>
      )}

      {s.note && <div className="t-xs" style={{ color: 'var(--fg-3)' }}>{s.note}</div>}
    </div>
  )
}

function StaleContentDetailContent({ data }) {
  const s = data?.summary || {}
  const staleSites = data?.staleSites || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: `Inativos (>${s.stalePeriodDays ?? 180}d)`, value: s.staleSiteCount ?? 0, alert: true },
          { label: 'Sites ativos', value: s.activeSiteCount ?? 0, alert: false },
          { label: 'Total de sites', value: s.totalSites ?? 0, neutral: true },
        ].map(m => (
          <div key={m.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)' }}>
            <div className="t-2xs" style={{ marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontWeight: 700, fontSize: 22, lineHeight: 1, color: m.neutral ? 'var(--fg-1)' : m.alert ? (m.value > 0 ? 'var(--score-0)' : 'var(--score-5)') : 'var(--score-5)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {staleSites.length > 0 && (
        <div>
          <div className="t-2xs" style={{ marginBottom: 8 }}>Top {staleSites.length} sites inativos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {staleSites.map((site, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
                padding: '8px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div className="t-sm" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {site.displayName || '—'}
                  </div>
                  <div className="t-xs" style={{ color: 'var(--fg-3)' }}>
                    {site.lastModifiedDateTime
                      ? `Última atividade: ${new Date(site.lastModifiedDateTime).toLocaleDateString('pt-BR')}`
                      : 'Sem atividade registrada'}
                  </div>
                </div>
                {site.daysSinceActivity != null && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--score-0)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {site.daysSinceActivity}d
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OversharingDetailContent({ data }) {
  const s = data?.summary || {}
  const sites = data?.sitesWithEveryone || []
  const count = s.sitesWithEveryoneCount ?? 0

  if (count === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--ok-bg)', border: '1px solid var(--ok-bd)' }}>
          <span style={{ color: 'var(--ok-fg)', fontWeight: 600, fontSize: 14 }}>
            Nenhum site com permissão aberta para "Everyone" nos {s.sitesSampled ?? 0} sites amostrados.
          </span>
        </div>
        {s.coverage && <div className="t-xs" style={{ color: 'var(--fg-3)' }}>Cobertura: {s.coverage}</div>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--sev-critical-bg)', border: '1px solid var(--sev-critical-bd)' }}>
        <span style={{ color: 'var(--sev-critical-fg)', fontWeight: 600 }}>
          {count} site{count > 1 ? 's' : ''} com acesso aberto para todos os usuários do tenant
        </span>
      </div>
      <div>
        <div className="t-2xs" style={{ marginBottom: 8 }}>Sites com permissão "Everyone"</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sites.map((site, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
              padding: '8px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border-1)',
            }}>
              <div style={{ minWidth: 0 }}>
                <div className="t-sm" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {site.displayName || '—'}
                </div>
                <div className="t-xs" style={{ color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {site.webUrl || '—'}
                </div>
              </div>
              {site.roles?.length > 0 && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                  padding: '2px 6px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap',
                  background: 'var(--sev-critical-bg)', color: 'var(--sev-critical-fg)', border: '1px solid var(--sev-critical-bd)',
                }}>
                  {site.roles.join(', ')}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      {s.coverage && <div className="t-xs" style={{ color: 'var(--fg-3)' }}>Cobertura: {s.coverage}</div>}
    </div>
  )
}

function ScoreChip({ value, compact, informational = false }) {
  const color = scoreColor(value)
  if (compact) {
    return (
      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}1A`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
        {informational ? 'Info' : value != null ? value.toFixed(1) : '—'}
      </div>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: `${color}1A`, color, fontWeight: 600, fontSize: 12 }}>
      {informational ? 'Informativo' : value != null ? `${value.toFixed(1)} / 5` : '—'}
    </span>
  )
}

function CollectorDetail({ id, data, weight, collectors = {} }) {
  if (!id) return <div className="t-sm" style={{ color: 'var(--fg-3)' }}>Selecione um coletor</div>
  const meta = COLLECTOR_META[id] || { label: id, requires: '—' }
  const metric = collectorMetric(id, data)
  const detail = collectorDetail(id, data, collectors)
  const status = collectorStatus(id, data)
  const informational = isInformationalCollector(id, data)
  const scoreValue = displayScore(data)
  const statusLabel = { ok: 'OK', warn: 'Atenção', err: 'Crítico', neutral: 'Indisponível', info: 'Coletado' }[status]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="t-2xs">Coletor</div>
        <div translate="no" className="t-h2" style={{ marginTop: 2 }}>{meta.label}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, padding: '16px 0', borderTop: '1px solid var(--border-1)', borderBottom: '1px solid var(--border-1)' }}>
        <MetricStat
          label="Score"
          value={informational ? 'Informativo' : scoreValue != null ? `${scoreValue.toFixed(1)} / 5` : '—'}
          sub={informational ? 'não entra no score do domínio' : undefined}
        />
        {weight != null && <MetricStat label="Peso no domínio" value={String(weight)} />}
        <MetricStat label="Métrica" value={metric.value} sub={metric.sub} />
      </div>
      <div>
        <div className="t-2xs" style={{ marginBottom: 6 }}>Achado</div>
        {id === 'usage'        ? <UsageDetailContent data={data} />
          : id === 'licensing'   ? <LicensingDetailContent data={data} />
          : id === 'users'       ? <UsersDetailContent data={data} />
          : id === 'appsChannel' ? <AppsChannelDetailContent data={data} />
          : id === 'riskySignIns' && !data?.unavailable ? <RiskySignInsDetailContent data={data} />
          : id === 'storage'     ? <StorageDetailContent data={data} />
          : id === 'privileged'  ? <PrivilegedDetailContent data={data} />
          : id === 'files'       ? <FilesDetailContent data={data} />
          : id === 'ownership'   ? <OwnershipDetailContent data={data} />
          : id === 'staleContent'? <StaleContentDetailContent data={data} />
          : id === 'oversharing' ? <OversharingDetailContent data={data} />
          : <div className="t-body">{detail}</div>
        }
      </div>
      <div>
        <div className="t-2xs" style={{ marginBottom: 6 }}>Status</div>
        <Pill tone={status} dot>{statusLabel}</Pill>
      </div>
      <div>
        <div className="t-2xs" style={{ marginBottom: 6 }}>Pré-requisito</div>
        <RequirementBadges requires={meta.requires} />
      </div>
    </div>
  )
}

function DomainExplainerCard({ collectorIds, collectors }) {
  const [open, setOpen] = useState(false)
  if (!collectorIds.length) return null

  const GREEN_BG  = '#f0fdf4'
  const GREEN_BD  = '#bbf7d0'
  const GREEN_FG  = '#166534'
  const GREEN_ROW = '#dcfce7'
  const GREEN_ICN = '#86efac'

  return (
    <div style={{ marginBottom: 16, border: `1px solid ${GREEN_BD}`, borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', background: GREEN_BG, cursor: 'pointer', userSelect: 'none' }}
      >
        <Icon name="book-open" size={15} style={{ color: GREEN_FG, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: GREEN_FG, flex: 1 }}>O que cada coletor mede?</span>
        <span style={{ fontSize: 11, color: GREEN_FG, opacity: 0.7, marginRight: 4 }}>{open ? 'Fechar' : 'Ver explicações'}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} style={{ color: GREEN_FG }} />
      </div>

      {open && (
        <div style={{ background: GREEN_BG }}>
          {collectorIds.map((id) => {
            const cMeta = COLLECTOR_META[id] || { label: id }
            const data   = collectors[id]
            const unavail = data?.unavailable
            const score   = data?.score
            const info    = isInformationalCollector(id, data)

            const statusText = unavail ? 'Indisponível' : info ? 'Coletado' : score == null ? 'N/A' : score >= 4 ? 'Ótimo' : score >= 3 ? 'Bom' : score >= 2 ? 'Atenção' : 'Crítico'
            const pillBg = unavail ? 'var(--bg-subtle)' : info ? 'var(--info-bg)' : score >= 4 ? GREEN_ROW : score >= 2 ? 'var(--warn-bg)' : 'var(--sev-critical-bg)'
            const pillFg = unavail ? 'var(--fg-3)'      : info ? 'var(--info-fg)' : score >= 4 ? GREEN_FG  : score >= 2 ? 'var(--warn-fg)' : 'var(--sev-critical-fg)'
            const pillBd = unavail ? 'var(--border-1)'  : info ? 'var(--info-bd)' : score >= 4 ? GREEN_ICN : score >= 2 ? 'var(--warn-bd)' : 'var(--sev-critical-bd)'
            const iconName = unavail ? 'minus'          : info || score >= 3 ? 'check' : 'alert-circle'
            const iconBg   = unavail ? 'var(--bg-subtle)' : info || score >= 3 ? GREEN_ROW : 'var(--sev-critical-bg)'
            const iconBd   = unavail ? 'var(--border-2)'  : info || score >= 3 ? GREEN_ICN : 'var(--sev-critical-bd)'
            const iconFg   = unavail ? 'var(--fg-3)'      : info || score >= 3 ? GREEN_FG  : 'var(--sev-critical-fg)'

            return (
              <div key={id} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', alignItems: 'flex-start', gap: 12, padding: '12px 18px', borderTop: `1px solid ${GREEN_BD}` }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 1, background: iconBg, border: `1px solid ${iconBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconFg }}>
                  <Icon name={iconName} size={13} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--fg-0)' }}>{cMeta.label}</div>
                  {cMeta.description && <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 3, lineHeight: 1.55 }}>{cMeta.description}</div>}
                  {cMeta.requires && <div style={{ fontSize: 11, color: GREEN_FG, marginTop: 4, opacity: 0.7 }}>Requer: {cMeta.requires}</div>}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: pillBg, color: pillFg, border: `1px solid ${pillBd}`, whiteSpace: 'nowrap', alignSelf: 'flex-start', marginTop: 1 }}>
                  {statusText}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function DomainScreen({ domainId, result, onBack }) {
  const meta = DOMAIN_META[domainId] || { label: domainId, subtitle: '', icon: 'layout-dashboard' }
  const domain = result?.domains?.[domainId]
  const collectors = domain?.collectors || {}
  const collectorIds = Object.keys(collectors).filter(id => id !== 'riskyUsers')
  const [selected, setSelected] = useState(collectorIds[0] || null)

  useEffect(() => {
    if (!collectorIds.includes(selected)) {
      setSelected(collectorIds[0] || null)
    }
  }, [domainId, collectorIds.join('|'), selected])

  const score = domain?.domainScore ?? 0
  const availableCount = collectorIds.filter(id => collectors[id] && !collectors[id]?.unavailable).length

  return (
    <>
      <PageHeader
        breadcrumb={['Overview', 'Domínios', meta.label]}
        kicker={`Domínio · ${meta.label}`}
        title={`${meta.label} · score ${score.toFixed(1)} / 5`}
        subtitle={meta.subtitle}
        right={[
          <Btn key="1" variant="secondary" size="md" icon="arrow-left" onClick={onBack}>Voltar</Btn>,
        ]}
      />

      <DomainExplainerCard collectorIds={collectorIds} collectors={collectors} />

      {domainId === 'emailSecurity' && domain?.domainsMatrix && (
        <Card padding={20} style={{ marginBottom: 16 }}>
          <div className="t-h3" style={{ marginBottom: 4 }}>Coletores por domínio</div>
          <EmailSecurityMatrixContent domainData={domain} />
        </Card>
      )}

      {collectorIds.length === 0 ? (
        <Card padding={32}>
          <div className="t-sm" style={{ textAlign: 'center', color: 'var(--fg-3)' }}>Nenhum dado disponível para este domínio.</div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 16 }}>
          <Card padding={0}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="t-h3">Coletores ({collectorIds.length})</div>
              <Pill tone="info">{availableCount}/{collectorIds.length} coletados</Pill>
            </div>
            {collectorIds.map(id => {
              const data = collectors[id]
              const cMeta = COLLECTOR_META[id] || { label: id, weight: null }
              const status = collectorStatus(id, data)
              const metric = collectorMetric(id, data)
              const isSelected = selected === id
              const informational = isInformationalCollector(id, data)
              const scoreValue = displayScore(data)
              return (
                <button key={id} onClick={() => setSelected(id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '14px 16px', textAlign: 'left',
                  background: isSelected ? 'var(--brand-50)' : 'transparent',
                  borderTop: 'none', borderRight: 'none',
                  borderLeft: isSelected ? '3px solid var(--brand-500)' : '3px solid transparent',
                  borderBottom: '1px solid var(--border-1)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <ScoreChip value={scoreValue} compact informational={informational} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div translate="no" className="t-body" style={{ fontWeight: 600 }}>{cMeta.label}</div>
                    <div className="t-sm" style={{ color: 'var(--fg-2)' }}>
                      {metric.value} · <span className="t-xs">{metric.sub}</span>
                    </div>
                  </div>
                  <Pill tone={status} dot>{({ ok: 'OK', warn: 'Atenção', err: 'Crítico', neutral: 'N/A', info: 'Coletado' })[status]}</Pill>
                </button>
              )
            })}
          </Card>
          <Card padding={24}>
            <CollectorDetail id={selected} data={selected ? collectors[selected] : null} weight={selected ? (COLLECTOR_META[selected]?.weight) : null} collectors={collectors} />
          </Card>
        </div>
      )}
    </>
  )
}
