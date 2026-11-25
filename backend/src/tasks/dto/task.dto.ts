import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsDateString,
  IsBoolean,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateTaskDto {
  @IsNotEmpty()
  @IsString()
  title: string

  @IsOptional()
  @IsString()
  description?: string

  @IsNotEmpty()
  @IsString()
  projectId: string

  @IsNotEmpty()
  @IsString()
  assigneeId: string

  @IsOptional()
  @IsString()
  milestoneId?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  projectPercentage?: number

  @IsOptional()
  @IsBoolean()
  isMainProjectTask?: boolean

  @IsOptional()
  @IsString()
  priority?: string

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedHours?: number

  @IsOptional()
  @IsArray()
  tags?: string[]

  @IsOptional()
  checklist?: { text: string; completed?: boolean }[]

  @IsOptional()
  @IsString()
  weightCategory?: 'SMALL' | 'MEDIUM' | 'LARGE' | 'CRITICAL' | 'CUSTOM'

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  proposedWeight?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightPoints?: number

  @IsOptional()
  @IsDateString()
  effectiveAt?: string

  @IsOptional()
  isIsolatedExecutive?: boolean

  // ponytail: Allow C-level to immediately complete and score newly assigned tasks
  @IsOptional()
  @IsString()
  initialStatus?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  initialScore?: number
}

export class ProposeTaskWeightDto {
  @IsNotEmpty()
  @IsString()
  weightCategory: 'SMALL' | 'MEDIUM' | 'LARGE' | 'CRITICAL' | 'CUSTOM'

  @IsOptional()
  @IsNumber()
  points?: number

  @IsOptional()
  @IsString()
  reason?: string
}

export class VerifyTaskWeightDto {
  @IsNotEmpty()
  @IsString()
  action: 'APPROVE' | 'MODIFY' | 'REJECT'

  @IsOptional()
  @IsString()
  approvedCategory?: 'SMALL' | 'MEDIUM' | 'LARGE' | 'CRITICAL' | 'CUSTOM'

  @IsOptional()
  @IsNumber()
  approvedPoints?: number

  @IsOptional()
  @IsString()
  reason?: string

  @IsOptional()
  @IsString()
  mfaCode?: string
}

export class ReturnTaskWorkDto {
  @IsNotEmpty({ message: 'A comment explaining required revisions is mandatory when returning work' })
  @IsString()
  comment: string
}

export class UpdateTaskStatusDto {
  @IsNotEmpty()
  @IsString()
  status: string // 'todo' | 'in_progress' | 'in_review' | 'completed' | 'blocked' | 'cancelled'

  @IsOptional()
  @IsString()
  cancellationReason?: string

  @IsOptional()
  @IsString()
  reason?: string

  @IsOptional()
  @IsString()
  feedback?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pmScore?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number
}

export class ApproveTaskDto {
  @IsOptional()
  @IsNumber()
  pmScore?: number

  @IsOptional()
  @IsString()
  feedback?: string

  @IsOptional()
  @IsNumber()
  payoutAmount?: number

  @IsOptional()
  @IsNumber()
  evaluationGrade?: number
}

export class RejectTaskDto {
  @IsNotEmpty({ message: 'Feedback is required when rejecting a task' })
  @IsString()
  feedback: string
}

export class ReassignTaskDto {
  @IsNotEmpty()
  @IsString()
  newAssigneeId: string
}

export class SubmitTaskWorkDto {
  @IsOptional()
  @IsString()
  prUrl?: string

  @IsOptional()
  @IsString()
  demoUrl?: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class AddTaskCommentDto {
  @IsNotEmpty()
  @IsString()
  content: string
}

export class ReviewTaskKpiDto {
  @IsOptional()
  @IsNumber()
  score?: number

  @IsOptional()
  @IsNumber()
  weightPoints?: number

  @IsOptional()
  @IsString()
  reason?: string

  @IsOptional()
  @IsBoolean()
  finalizeNow?: boolean
}

