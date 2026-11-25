import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyRound,
  Laptop,
  Link2,
  Lock,
  LogOut,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  CheckCircle2,
  XCircle,
  Plus,
  GitBranch,
  RotateCcw,
  Wrench,
} from 'lucide-react'
import { erpApi } from '../../api/client'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/common/PageHeader'
import { Card } from '../../components/common/Card'
import { Button } from '../../components/common/Button'
import { Badge } from '../../components/common/Badge'
import { Avatar } from '../../components/common/Avatar'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import { MfaRecoveryCodesCard } from '../../components/common/MfaRecoveryCodesCard'
import { AdditionalGrantedAccessCard } from '../../components/common/AdditionalGrantedAccessCard'
import { validatePasswordStrength } from '../../utils/password-policy'

const PROFILE_META_PREFIX = 'pointfex_profile_meta_'
const LOCAL_WORKSPACE_PREFIXES = [
  'pointfex_home_prefs_',
  'pointfex_project_checklist_',
  'pointfex_profile_meta_',
  'list_toolbar_',
]

interface ExtendedProfileMeta {
  bio?: string
  skills?: string[]
  phone?: string
  department?: string
}

function loadProfileMeta(userId?: string): ExtendedProfileMeta {
  if (!userId || typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(`${PROFILE_META_PREFIX}${userId}`)
    return raw ? (JSON.parse(raw) as ExtendedProfileMeta) : {}
  } catch {
    return {}
  }
}

function saveProfileMeta(userId: string, meta: ExtendedProfileMeta) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(`${PROFILE_META_PREFIX}${userId}`, JSON.stringify(meta))
  } catch {
    // ignore storage quota errors
  }
}

function resetLocalWorkspaceState(): number {
  if (typeof localStorage === 'undefined') return 0
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key && LOCAL_WORKSPACE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k))
  return keysToRemove.length
}

function formatDhakaDateTime(iso?: string | null): string {
  if (!iso) return 'Never'
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function MyAccountPage() {
  const { currentUser, showToast, refreshData, logout, updateUserProfile, canAny } = useApp()

  const storedMeta = useMemo(() => loadProfileMeta(currentUser?.id), [currentUser?.id])
  const [profileName, setProfileName] = useState(currentUser?.name || '')
  const [profileTitle, setProfileTitle] = useState(currentUser?.title || '')
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(
    currentUser?.avatarUrl || currentUser?.avatar || '',
  )
  const [profileDepartment, setProfileDepartment] = useState(
    storedMeta.department || (currentUser as any)?.department || 'Engineering & Architecture',
  )
  const [profilePhone, setProfilePhone] = useState(
    storedMeta.phone || (currentUser as any)?.phone || '',
  )
  const [profileBio, setProfileBio] = useState(storedMeta.bio || currentUser?.bio || '')
  const [skills, setSkills] = useState<string[]>(
    storedMeta.skills || currentUser?.skills || [],
  )
  const [newSkill, setNewSkill] = useState('')
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false)

  useEffect(() => {
    const meta = loadProfileMeta(currentUser?.id)
    setProfileName(currentUser?.name || '')
    setProfileTitle(currentUser?.title || '')
    setProfileAvatarUrl(currentUser?.avatarUrl || currentUser?.avatar || '')
    setProfileDepartment(
      meta.department || (currentUser as any)?.department || 'Engineering & Architecture',
    )
    setProfilePhone(meta.phone || (currentUser as any)?.phone || '')
    setProfileBio(meta.bio || currentUser?.bio || '')
    setSkills(meta.skills || currentUser?.skills || [])
  }, [currentUser])

  const canManageProfile =
    canAny(['employees:update_own_profile', 'employees:update_any']) ||
    Boolean(currentUser?.id)
  const isEngineeringExec = ['cto', 'ceo'].includes((currentUser?.role || '').toLowerCase())

  const handleSaveProfileDetails = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser?.id) return
    if (!profileName.trim()) {
      showToast('Full name is required.', 'error')
      return
    }
    const meta: ExtendedProfileMeta = {
      bio: profileBio.trim(),
      skills,
      phone: profilePhone.trim(),
      department: profileDepartment.trim(),
    }
    saveProfileMeta(currentUser.id, meta)
    updateUserProfile({
      name: profileName.trim(),
      title: profileTitle.trim() || currentUser.title,
      avatarUrl: profileAvatarUrl.trim() || undefined,
      bio: meta.bio,
      skills,
    })
  }

  const handleAddSkill = () => {
    const trimmed = newSkill.trim()
    if (!trimmed || !currentUser?.id) return
    if (skills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      showToast('Skill already listed.', 'info')
      return
    }
    const nextSkills = [...skills, trimmed]
    setSkills(nextSkills)
    setNewSkill('')
    saveProfileMeta(currentUser.id, {
      bio: profileBio.trim(),
      skills: nextSkills,
      phone: profilePhone.trim(),
      department: profileDepartment.trim(),
    })
    updateUserProfile({ skills: nextSkills })
  }

  const handleRemoveSkill = (skillToRemove: string) => {
    if (!currentUser?.id) return
    const nextSkills = skills.filter((s) => s !== skillToRemove)
    setSkills(nextSkills)
    saveProfileMeta(currentUser.id, {
      bio: profileBio.trim(),
      skills: nextSkills,
      phone: profilePhone.trim(),
      department: profileDepartment.trim(),
    })
    updateUserProfile({ skills: nextSkills })
  }

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMfaCode, setPasswordMfaCode] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [sessionToRevoke, setSessionToRevoke] = useState<string | null>(null)

  const [sessionsData, setSessionsData] = useState<{
    sessions: Array<{
      id: string
      deviceLabel: string
      ipAddress?: string | null
      lastActiveAt: string
      mfaVerified: boolean
    }>
    externalIdentities: Array<{
      id: string
      provider: string
      email: string
      emailVerified: boolean
      lastLoginAt?: string | null
    }>
    hasPassword: boolean
    mfaEnabled: boolean
  } | null>(null)

  const [mfaEnrollData, setMfaEnrollData] = useState<{ base32Secret?: string } | null>(null)
  const [mfaVerifyCode, setMfaVerifyCode] = useState('')

  const loadAccountSecurity = useCallback(async () => {
    try {
      const res = await erpApi.getMySessions()
      setSessionsData(res)
    } catch {
      // Ignore offline/mock fallback
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void erpApi
      .getMySessions()
      .then((res) => {
        if (!cancelled) setSessionsData(res)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  const pwdStrength = useMemo(
    () =>
      validatePasswordStrength(newPassword, {
        name: currentUser?.name,
        email: currentUser?.email,
      }),
    [newPassword, currentUser?.name, currentUser?.email],
  )

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwdStrength.valid) {
      showToast(pwdStrength.errors[0] || 'Password does not meet policy requirements.', 'error')
      return
    }
    setChangingPassword(true)
    try {
      await erpApi.changePassword(currentPassword, newPassword, passwordMfaCode || undefined)
      setCurrentPassword('')
      setNewPassword('')
      setPasswordMfaCode('')
      showToast(
        'Password updated successfully. All other active sessions have been revoked.',
        'success',
      )
      await loadAccountSecurity()
    } catch (err: any) {
      showToast(err?.message || 'Unable to update password.', 'error')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleLogoutAllDevices = async () => {
    try {
      const res = await erpApi.logoutAllDevices()
      showToast(`Logged out of ${res.revokedCount} devices. Redirecting to sign in...`, 'info')
      window.setTimeout(() => {
        void logout()
      }, 700)
    } catch (err: any) {
      showToast(err?.message || 'Failed to logout from all devices.', 'error')
    }
  }

  const handleRevokeSession = async (id: string) => {
    try {
      await erpApi.revokeMySession(id)
      showToast('Session revoked.', 'info')
      await loadAccountSecurity()
    } catch (err: any) {
      showToast(err?.message || 'Unable to revoke session.', 'error')
    }
  }

  const handleStartMfaEnroll = async () => {
    try {
      const res = await erpApi.enrollMfa()
      setMfaEnrollData({ base32Secret: res.base32Secret })
    } catch (err: any) {
      showToast(err?.message || 'Unable to start MFA enrollment.', 'error')
    }
  }

  const handleVerifyMfaEnroll = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await erpApi.verifyMfa(mfaVerifyCode.trim())
      setMfaEnrollData(null)
      setMfaVerifyCode('')
      showToast('Authenticator MFA enabled.', 'success')
      await Promise.all([refreshData(), loadAccountSecurity()])
    } catch (err: any) {
      showToast(err?.message || 'Invalid 6-digit MFA code.', 'error')
    }
  }

  const googleLink = sessionsData?.externalIdentities.find((x) => x.provider === 'google')
  const mfaEnabled = Boolean(sessionsData?.mfaEnabled ?? currentUser?.mfaEnabled)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="My Account"
        subtitle="Manage your profile, password, Google sign-in, multi-factor security, and active sessions."
      />

      {/* Profile */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar
              src={profileAvatarUrl || currentUser?.avatarUrl || currentUser?.avatar}
              name={profileName || currentUser?.name}
              initials={currentUser?.initials}
              size="lg"
            />
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-[var(--primary)]" />
                Profile &amp; Identity
              </h2>
              <p className="text-[11px] text-[var(--muted)]">
                Update permitted profile information, title, avatar URL, and executive biography.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">{(currentUser?.role || 'USER').toUpperCase()}</Badge>
            <Badge variant="neutral">{profileTitle || currentUser?.title || 'Staff'}</Badge>
          </div>
        </div>

        <form onSubmit={handleSaveProfileDetails} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Full Name</label>
              <input
                type="text"
                disabled={!canManageProfile}
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] disabled:text-[var(--muted)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Corporate Email</label>
              <input
                type="email"
                disabled
                value={currentUser?.email || ''}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Job Title</label>
              <input
                type="text"
                disabled={!canManageProfile}
                value={profileTitle}
                onChange={(e) => setProfileTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] disabled:text-[var(--muted)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Profile Picture URL</label>
              <input
                type="url"
                disabled={!canManageProfile}
                value={profileAvatarUrl}
                onChange={(e) => setProfileAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] disabled:text-[var(--muted)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Assigned Department</label>
              <input
                type="text"
                disabled={!canManageProfile}
                value={profileDepartment}
                onChange={(e) => setProfileDepartment(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] disabled:text-[var(--muted)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Contact Phone</label>
              <input
                type="text"
                disabled={!canManageProfile}
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                placeholder="+880 ..."
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] disabled:text-[var(--muted)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Short Biography</label>
            <textarea
              rows={2}
              disabled={!canManageProfile}
              value={profileBio}
              onChange={(e) => setProfileBio(e.target.value)}
              placeholder="Technical leadership focus, architecture stewardship, and key responsibilities..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] resize-none disabled:text-[var(--muted)]"
            />
          </div>

          {canManageProfile && (
            <div className="flex justify-end">
              <Button type="submit" size="xs" variant="primary">
                Save Profile Details
              </Button>
            </div>
          )}
        </form>

        {/* Technical Skills */}
        <div className="pt-3 border-t border-[var(--border)] space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[var(--text)] flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-[var(--primary)]" />
              Technical Skills &amp; Expertise
            </span>
            <span className="text-[11px] text-[var(--muted)]">{skills.length} listed</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {skills.length === 0 ? (
              <span className="text-[11px] text-[var(--muted)]">
                No technical skills recorded yet.
              </span>
            ) : (
              skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-medium"
                >
                  {skill}
                  <button
                    type="button"
                    aria-label={`Remove ${skill}`}
                    onClick={() => handleRemoveSkill(skill)}
                    className="text-slate-400 hover:text-rose-500 cursor-pointer"
                  >
                    <XCircle className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              placeholder="Add technical skill (e.g., NestJS, Distributed Systems, PostgreSQL)"
              className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)]"
            />
            <Button type="button" size="xs" variant="secondary" icon={Plus} onClick={handleAddSkill}>
              Add Skill
            </Button>
          </div>
        </div>

        {/* Notifications & Alert Preferences */}
        <div className="pt-2 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[var(--muted)] text-[11px]">System Notifications &amp; Alerts:</span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              In-App Dispatch Enabled
            </span>
            <span className="text-[var(--border)]">·</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Email Summaries Active
            </span>
          </div>
        </div>
      </Card>

      {/* Engineering Governance & Workspace Settings */}
      {isEngineeringExec && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-[var(--primary)]" />
              Engineering &amp; Workspace Policies
            </h2>
            <Badge variant="neutral">Read-Only Policy</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-1">
              <div className="text-[11px] font-semibold text-[var(--muted)] uppercase">
                Default Git Branch Policy
              </div>
              <div className="font-mono font-bold text-[var(--text)]">main</div>
              <p className="text-[11px] text-[var(--muted)]">
                Protected production branch; feature work merges via reviewed pull requests.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-1">
              <div className="text-[11px] font-semibold text-[var(--muted)] uppercase">
                Code Quality Gates
              </div>
              <div className="font-semibold text-[var(--text)]">CI Verification Required</div>
              <p className="text-[11px] text-[var(--muted)]">
                TypeScript strict check, linter validation, automated tests, and build verification.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-1">
              <div className="text-[11px] font-semibold text-[var(--muted)] uppercase">
                Development Standards
              </div>
              <div className="font-semibold text-[var(--text)]">PBAC &amp; Audit Chain</div>
              <p className="text-[11px] text-[var(--muted)]">
                Server-side enforcement with SHA-256 audit chaining and fresh MFA on critical actions.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-semibold text-[var(--text)]">Reset Local Workspace Preferences</div>
              <div className="text-[11px] text-[var(--muted)]">
                Clears locally cached layout filters, saved views, and local checklist drafts without affecting database records.
              </div>
            </div>
            <Button
              type="button"
              size="xs"
              variant="danger"
              icon={RotateCcw}
              onClick={() => setIsResetConfirmOpen(true)}
            >
              Reset Local Cache
            </Button>
          </div>
        </Card>
      )}



      {/* Change Password */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
          <Lock className="w-4 h-4 text-[var(--primary)]" />
          Change Password
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]"
            />
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]"
            />
            {mfaEnabled ? (
              <input
                type="text"
                required
                maxLength={6}
                value={passwordMfaCode}
                onChange={(e) => setPasswordMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit MFA code"
                className="px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] font-mono"
              />
            ) : (
              <div />
            )}
          </div>

          {/* Live Password Strength Meter */}
          {newPassword.length > 0 && (
            <div className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[var(--text)]">Password Policy Strength</span>
                <span
                  className={`font-bold ${
                    pwdStrength.valid
                      ? 'text-emerald-500'
                      : pwdStrength.score >= 2
                        ? 'text-amber-500'
                        : 'text-rose-500'
                  }`}
                >
                  {pwdStrength.valid
                    ? 'STRONG (Complies with Policy)'
                    : pwdStrength.score >= 2
                      ? 'MODERATE'
                      : 'WEAK'}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[var(--surface-muted)] overflow-hidden flex">
                <div
                  className={`h-full transition-all ${
                    pwdStrength.valid
                      ? 'bg-emerald-500 w-full'
                      : pwdStrength.score === 3
                        ? 'bg-amber-400 w-3/4'
                        : pwdStrength.score === 2
                          ? 'bg-amber-500 w-1/2'
                          : 'bg-rose-500 w-1/4'
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] pt-1">
                <div className={`flex items-center gap-1.5 ${pwdStrength.rules.minLength ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--muted)]'}`}>
                  {pwdStrength.rules.minLength ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <XCircle className="w-3 h-3 shrink-0" />}
                  <span>8 to 128 characters</span>
                </div>
                <div className={`flex items-center gap-1.5 ${pwdStrength.rules.hasUpper && pwdStrength.rules.hasLower ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--muted)]'}`}>
                  {pwdStrength.rules.hasUpper && pwdStrength.rules.hasLower ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <XCircle className="w-3 h-3 shrink-0" />}
                  <span>Uppercase &amp; lowercase letters</span>
                </div>
                <div className={`flex items-center gap-1.5 ${pwdStrength.rules.hasNumber && pwdStrength.rules.hasSymbol ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--muted)]'}`}>
                  {pwdStrength.rules.hasNumber && pwdStrength.rules.hasSymbol ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <XCircle className="w-3 h-3 shrink-0" />}
                  <span>Numbers &amp; special characters</span>
                </div>
                <div className={`flex items-center gap-1.5 ${pwdStrength.rules.notCommon && pwdStrength.rules.noNameOrEmail ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--muted)]'}`}>
                  {pwdStrength.rules.notCommon && pwdStrength.rules.noNameOrEmail ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <XCircle className="w-3 h-3 shrink-0" />}
                  <span>Not common &amp; no name/email</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={changingPassword || (newPassword.length > 0 && !pwdStrength.valid)}
            >
              {changingPassword ? 'Updating...' : 'Update password'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Linked Google Account & MFA Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[var(--primary)]" />
            Linked Google Account
          </h2>
          {googleLink ? (
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text)]">{googleLink.email}</span>
                  <Badge variant="success" size="xs">
                    Google Account Linked
                  </Badge>
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  Last sign-in: {formatDhakaDateTime(googleLink.lastLoginAt)}
                </div>
              </div>
              <p className="text-[11px] text-[var(--muted)]">
                To change your linked email, contact the Chief Executive Officer.
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <p className="text-[var(--muted)]">
                Link your verified Google workspace account for passwordless sign-in.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  window.location.assign(`${window.location.origin}/api/auth/google`)
                }
              >
                Link Google account
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--primary)]" />
              MFA Status
            </h2>
            <Badge variant={mfaEnabled ? 'success' : 'warning'}>
              {mfaEnabled ? 'Enabled' : 'Not enabled'}
            </Badge>
          </div>
          {!mfaEnabled ? (
            !mfaEnrollData ? (
              <div className="space-y-2 text-xs">
                <p className="text-[var(--muted)]">
                  Enable an authenticator app to protect sensitive actions and generate 10 recovery codes.
                </p>
                <Button type="button" size="sm" variant="primary" icon={KeyRound} onClick={() => void handleStartMfaEnroll()}>
                  Enable Authenticator MFA
                </Button>
              </div>
            ) : (
              <form onSubmit={handleVerifyMfaEnroll} className="space-y-2 text-xs">
                <div className="p-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] font-mono break-all select-all">
                  {mfaEnrollData.base32Secret}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={mfaVerifyCode}
                    onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] font-mono"
                  />
                  <Button type="submit" size="sm" variant="primary">
                    Verify
                  </Button>
                </div>
              </form>
            )
          ) : (
            <p className="text-xs text-[var(--muted)]">
              Authenticator verification is active. Sensitive actions require a fresh 6-digit security code every time.
            </p>
          )}
        </Card>
      </div>

      <MfaRecoveryCodesCard />

      {/* Active Sessions */}
      <Card className="p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
            <Laptop className="w-4 h-4 text-[var(--primary)]" />
            Active Sessions
          </h2>
          <Button
            type="button"
            size="xs"
            variant="danger"
            icon={LogOut}
            onClick={() => void handleLogoutAllDevices()}
          >
            Log out of all devices
          </Button>
        </div>
        <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden">
          {!sessionsData || sessionsData.sessions.length === 0 ? (
            <div className="p-4 text-xs text-[var(--muted)] text-center">No active sessions found.</div>
          ) : (
            sessionsData.sessions.map((s) => (
              <div key={s.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-[var(--text)] truncate">{s.deviceLabel}</div>
                  <div className="text-[11px] text-[var(--muted)]">
                    IP: {s.ipAddress || 'Unknown'} · Last active {formatDhakaDateTime(s.lastActiveAt)}
                  </div>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="danger"
                  icon={Trash2}
                  onClick={() => setSessionToRevoke(s.id)}
                >
                  Revoke
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <AdditionalGrantedAccessCard />

      {sessionToRevoke && (
        <ConfirmDialog
          isOpen={!!sessionToRevoke}
          onClose={() => setSessionToRevoke(null)}
          onConfirm={async () => {
            const sid = sessionToRevoke
            setSessionToRevoke(null)
            await handleRevokeSession(sid)
          }}
          title="Revoke Active Session"
          message="Are you sure you want to terminate this device session? The device will be signed out immediately."
          confirmLabel="Revoke Session"
          severity="danger"
        />
      )}

      {isResetConfirmOpen && (
        <ConfirmDialog
          isOpen={isResetConfirmOpen}
          onClose={() => setIsResetConfirmOpen(false)}
          onConfirm={() => {
            const cleared = resetLocalWorkspaceState()
            setIsResetConfirmOpen(false)
            showToast(
              `Cleared ${cleared} local workspace cache entries. Server database remains unchanged.`,
              'success',
            )
            void refreshData()
          }}
          title="Reset Local Workspace Cache"
          message="This resets locally saved workspace preferences, toolbar views, and draft checklists back to defaults. Active database records and user accounts will not be modified."
          confirmLabel="Confirm Reset"
          severity="danger"
        />
      )}

      <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--muted)]">
        <span>Pointfex ERP Enterprise Platform <span className="opacity-75 font-normal">· Developed by ERP Team</span></span>
        <span className="font-mono font-medium">v4.2.0</span>
      </div>
    </div>
  )
}
