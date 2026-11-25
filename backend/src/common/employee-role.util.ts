export function isProjectManager(employee: {
  title?: string | null
  employeeRoles?: { role: { slug: string } }[]
  positionAssignments?: { position?: { roleCategory?: string }; isActive?: boolean }[]
} | null | undefined): boolean {
  const title = employee?.title?.toLowerCase() || ''
  return title === 'pm' || title.includes('project manager') ||
    !!employee?.employeeRoles?.some(({ role }) => role.slug.toLowerCase() === 'pm') ||
    !!employee?.positionAssignments?.some((pa) => pa.position?.roleCategory?.toLowerCase() === 'pm' && pa.isActive !== false)
}
