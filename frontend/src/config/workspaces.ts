import {
  LayoutDashboard,
  Briefcase,
  Users,
  Cpu,
  Handshake,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export type WorkspaceId =
  | 'dashboard'
  | 'organization'
  | 'my_workspace'
  | 'engineering_security'
  | 'consultancy_advisory'
  | 'admin_governance'
  // Legacy aliases for backward compatibility
  | 'home'
  | 'work_ops'
  | 'my_work'
  | 'people'
  | 'delivery'
  | 'engineering'
  | 'finance'
  | 'operations'
  | 'product_clients'
  | 'company_hub'
  | 'admin'

export interface WorkspaceMeta {
  id: WorkspaceId
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  /** Permission catalog module codes (00-20) owned by this workspace */
  modules: readonly string[]
  alwaysVisible?: boolean
}

export const WORKSPACES: readonly WorkspaceMeta[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'Dashboard',
    description: 'My Day overview, priorities, and role-aware widgets',
    icon: LayoutDashboard,
    modules: ['00'],
    alwaysVisible: true,
  },
  {
    id: 'organization',
    label: 'Organization',
    shortLabel: 'Organization',
    description: 'Clean, inspect-first org directory',
    icon: Users,
    modules: ['04', '05', '10', '11'],
    alwaysVisible: true,
  },
  {
    id: 'my_workspace',
    label: 'My Work',
    shortLabel: 'My Work',
    description: 'Personal & Squad Hub',
    icon: Briefcase,
    modules: ['00'],
    alwaysVisible: true,
  },
  {
    id: 'engineering_security',
    label: 'Engineering',
    shortLabel: 'Engineering',
    description: 'Engineering & Security operations',
    icon: Cpu,
    modules: ['12', '13', '14', '15'],
    alwaysVisible: true,
  },
  {
    id: 'consultancy_advisory',
    label: 'Advisory',
    shortLabel: 'Advisory',
    description: 'Technical Advisory & Consultancy',
    icon: Handshake,
    modules: ['09', '18'],
  },
  {
    id: 'admin_governance',
    label: 'Governance',
    shortLabel: 'Governance',
    description: 'Admin, Reviews & Executive Control',
    icon: ShieldCheck,
    modules: ['01', '02', '03', '06', '07', '16', '17', '20'],
  },
]

const ALIAS_MAP: Record<string, WorkspaceId> = {
  home: 'dashboard',
  work_ops: 'organization',
  my_work: 'my_workspace',
  people: 'organization',
  delivery: 'organization',
  engineering: 'engineering_security',
  finance: 'admin_governance',
  operations: 'organization',
  product_clients: 'consultancy_advisory',
  company_hub: 'organization',
  admin: 'admin_governance',
}

export function getWorkspaceMeta(id: WorkspaceId): WorkspaceMeta {
  const resolvedId = ALIAS_MAP[id] || id
  return WORKSPACES.find((w) => w.id === resolvedId) || WORKSPACES[0]
}
