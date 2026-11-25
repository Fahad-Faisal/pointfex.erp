import React from 'react'
import type { Task } from '../types'

export interface PlainEnglishLogResult {
  sentence: React.ReactNode
  relativeTime: string
  actor: string
}

export function formatRelativeTime(dateInput: string | Date | undefined): string {
  if (!dateInput) return 'Recently'
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    if (diffMs < 0 || isNaN(diffMs)) return 'Just now'
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'Just now'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) {
      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      return `Yesterday, ${timeStr}`
    }
    if (diffDays < 7) {
      return `${diffDays} days ago`
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return 'Recently'
  }
}

export function humanizeStatus(status: string | undefined): string {
  if (!status) return 'In Progress'
  const s = status.toLowerCase().replace(/['"]/g, '').trim()
  if (s === 'todo' || s === 'to_do') return 'To Do'
  if (s === 'in_progress') return 'In Progress'
  if (s === 'in_review') return 'In Review'
  if (s === 'completed') return 'Completed'
  if (s === 'cancelled') return 'Cancelled'
  if (s === 'blocked') return 'Blocked'
  return status.replace(/_/g, ' ')
}

export function formatPlainEnglishLog(
  log: any,
  tasks: Task[] = [],
  currentUserId?: string,
): PlainEnglishLogResult {
  const actor =
    log.actorName ||
    log.userName ||
    (log.userId && log.userId === currentUserId ? 'You' : 'Team Member')

  const relativeTime = formatRelativeTime(log.timestamp || log.createdAt)

  // Look up task if entityType === 'task'
  const matchingTask = tasks.find((t) => t.id === log.entityId)
  let taskTitle =
    matchingTask?.title ||
    log.entityTitle?.replace(/\s*\[.*\]$/, '').trim() ||
    log.payload?.taskTitle ||
    ''

  const rawDesc = String(log.description || '')
  const action = String(log.action || log.actionCode || '')

  // 1. Task Status Updates / Transitions
  const isStatusChange =
    action.includes('STATUS') ||
    rawDesc.toLowerCase().includes('status updated from') ||
    rawDesc.toLowerCase().includes('status changed') ||
    log.payload?.toStatus

  if (isStatusChange) {
    let fromStatus = log.payload?.fromStatus
    let toStatus = log.payload?.toStatus

    if (!toStatus) {
      const match = rawDesc.match(/from\s+([a-zA-Z_]+)\s+to\s+([a-zA-Z_]+)/i)
      if (match) {
        fromStatus = match[1]
        toStatus = match[2]
      }
    }

    if (!taskTitle) {
      const titleMatch = rawDesc.match(/Task\s+"([^"]+)"/i)
      if (titleMatch) taskTitle = titleMatch[1]
    }
    const safeTitle = taskTitle || 'Task'

    const toLabel = humanizeStatus(toStatus)
    const fromLabel = humanizeStatus(fromStatus)

    if (toLabel === 'Completed') {
      const score = log.payload?.pmScore ?? log.payload?.score
      if (score !== undefined && score !== null) {
        return {
          actor,
          relativeTime,
          sentence: (
            <span>
              <strong>{actor}</strong> marked <strong>{safeTitle}</strong> as Completed (Score: {score})
            </span>
          ),
        }
      }
      return {
        actor,
        relativeTime,
        sentence: (
          <span>
            <strong>{actor}</strong> marked <strong>{safeTitle}</strong> as Completed
          </span>
        ),
      }
    }

    if (toLabel === 'Cancelled') {
      const reason = log.payload?.reason || log.payload?.cancellationReason
      return {
        actor,
        relativeTime,
        sentence: (
          <span>
            <strong>{actor}</strong> cancelled <strong>{safeTitle}</strong>
            {reason ? ` (Reason: "${reason}")` : ''}
          </span>
        ),
      }
    }

    return {
      actor,
      relativeTime,
      sentence: (
        <span>
          <strong>{actor}</strong> moved <strong>{safeTitle}</strong> from {fromLabel} to {toLabel}
        </span>
      ),
    }
  }

  // 2. Weight approved / verified
  if (
    action.includes('WEIGHT_APPROVED') ||
    action.includes('WEIGHT_VERIFIED') ||
    rawDesc.toLowerCase().includes('weight verified') ||
    rawDesc.toLowerCase().includes('weight approved')
  ) {
    const weightMatch = rawDesc.match(/weight\s*\(?(\d+(?:\.\d+)?)\)?/i)
    const weight = weightMatch ? weightMatch[1] : log.payload?.weightPoints || '5'
    const safeTitle = taskTitle || 'deliverable'
    return {
      actor,
      relativeTime,
      sentence: (
        <span>
          <strong>{actor}</strong> approved task weight ({weight}) for <strong>{safeTitle}</strong>
        </span>
      ),
    }
  }

  // 3. Weight proposed
  if (
    action.includes('WEIGHT_PROPOSED') ||
    rawDesc.toLowerCase().includes('weight proposed') ||
    rawDesc.toLowerCase().includes('proposed weight')
  ) {
    const weightMatch = rawDesc.match(/weight\s*\(?(\d+(?:\.\d+)?)\)?/i)
    const weight = weightMatch ? weightMatch[1] : log.payload?.proposedWeight || '3'
    const safeTitle = taskTitle || 'deliverable'
    return {
      actor,
      relativeTime,
      sentence: (
        <span>
          <strong>{actor}</strong> proposed task weight ({weight}) for <strong>{safeTitle}</strong>
        </span>
      ),
    }
  }

  // 4. Task Created
  if (
    action.includes('TASK_CREATED') ||
    rawDesc.toLowerCase().includes('task created') ||
    rawDesc.toLowerCase().includes('created task')
  ) {
    const safeTitle = taskTitle || log.payload?.title || 'deliverable'
    return {
      actor,
      relativeTime,
      sentence: (
        <span>
          <strong>{actor}</strong> created deliverable <strong>{safeTitle}</strong>
        </span>
      ),
    }
  }

  // 5. Squad Resource Added
  if (
    action.includes('RESOURCE') ||
    rawDesc.toLowerCase().includes('resource added') ||
    rawDesc.toLowerCase().includes('added resource')
  ) {
    const resTitle = log.payload?.title || log.payload?.url || log.entityTitle || 'resource'
    return {
      actor,
      relativeTime,
      sentence: (
        <span>
          <strong>{actor}</strong> added squad resource <strong>{resTitle}</strong>
        </span>
      ),
    }
  }

  // 6. Generic cleaning: remove any snake_case system codes from description
  const cleanedDesc = rawDesc
    .replace(/TASK_STATUS_TRANSITION/g, 'Task status updated')
    .replace(/TASK_WEIGHT_APPROVED/g, 'Task weight approved')
    .replace(/TASK_WEIGHT_PROPOSED/g, 'Task weight proposed')
    .replace(/TASK_CREATED/g, 'Task created')
    .replace(/\bto_do\b/gi, 'To Do')
    .replace(/\btodo\b/gi, 'To Do')
    .replace(/\bin_progress\b/gi, 'In Progress')
    .replace(/\bin_review\b/gi, 'In Review')
    .replace(/\bcompleted\b/gi, 'Completed')
    .replace(/\bcancelled\b/gi, 'Cancelled')

  return {
    actor,
    relativeTime,
    sentence: (
      <span>
        <strong>{actor}</strong>: {cleanedDesc}
      </span>
    ),
  }
}

