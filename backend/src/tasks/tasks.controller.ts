import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ForbiddenException } from '@nestjs/common'
import { TasksService } from './tasks.service'
import {
  CreateTaskDto,
  UpdateTaskStatusDto,
  ApproveTaskDto,
  RejectTaskDto,
  ReassignTaskDto,
  SubmitTaskWorkDto,
  AddTaskCommentDto,
  ProposeTaskWeightDto,
  VerifyTaskWeightDto,
  ReturnTaskWorkDto,
  ReviewTaskKpiDto,
} from './dto/task.dto'
import { AuthenticatedUser } from '../common/auth-user.interface'
import { PermissionsGuard } from '../common/permissions.guard'
import { RequireAnyPermission, RequirePermissions } from '../common/require-permissions.decorator'
import { CurrentUser } from '../common/current-user.decorator'

@Controller('tasks')
@UseGuards(PermissionsGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @RequireAnyPermission('tasks:read_own', 'tasks:read_team', 'tasks:read_all')
  findAll(
    @Query('projectId') projectId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('creatorId') creatorId?: string,
    @Query('status') status?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.tasksService.findAll({ projectId, assigneeId, creatorId, status, teamId })
  }

  @Get(':id')
  @RequireAnyPermission('tasks:read_own', 'tasks:read_team', 'tasks:read_all')
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id)
  }

  @Post()
  @RequireAnyPermission('tasks:create_personal', 'tasks:create_assign')
  create(@Body() dto: CreateTaskDto, @CurrentUser() actor: AuthenticatedUser) {
    // Universal self-task assignment: developer, PM, executive, CEO can assign tasks to themselves
    if (dto.assigneeId === actor.id) {
      return this.tasksService.create(dto, actor)
    }
    const actorRole = (actor.role || '').toLowerCase()
    const isAuthorized =
      (actor.permissions || []).some((p: string) =>
        ['tasks:create_assign', 'tasks:create_personal'].includes(p),
      ) ||
      ['ceo', 'chro', 'cto', 'cfo', 'cpo', 'system:root', 'admin', 'pm'].includes(actorRole)

    if (!isAuthorized) {
      throw new ForbiddenException('Permission denied: requires tasks:create_assign')
    }
    return this.tasksService.create(dto, actor)
  }

  @Patch(':id')
  @RequireAnyPermission('tasks:create_assign', 'tasks:update_status', 'tasks:approve')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateTaskDto>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.update(id, dto, actor)
  }

  @Patch(':id/status')
  @RequireAnyPermission('tasks:update_status', 'tasks:approve')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.updateStatus(id, dto, actor)
  }

  @Post(':id/approve')
  @RequirePermissions('tasks:approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.approve(id, dto, actor)
  }

  @Post(':id/reject')
  @RequirePermissions('tasks:reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.reject(id, dto, actor)
  }

  @Post(':id/reassign')
  @RequirePermissions('tasks:reassign')
  reassign(
    @Param('id') id: string,
    @Body() dto: ReassignTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.reassign(id, dto, actor)
  }

  @Post(':id/propose-weight')
  @RequireAnyPermission('tasks:propose_weight', 'tasks:create_assign')
  proposeWeight(
    @Param('id') id: string,
    @Body() dto: ProposeTaskWeightDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.proposeWeight(id, dto, actor)
  }

  @Post(':id/verify-weight')
  @RequireAnyPermission('tasks:verify_weight', 'governance:vote')
  verifyWeight(
    @Param('id') id: string,
    @Body() dto: VerifyTaskWeightDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const actorRole = (actor.role || '').toLowerCase()
    const isChroOrCeo = ['ceo', 'chro', 'system:root'].includes(actorRole) || actor.id === 'emp_ceo_01'
    if (!isChroOrCeo) {
      throw new ForbiddenException('Only CHRO (plus CEO supreme override) can approve or modify task weights.')
    }
    return this.tasksService.verifyWeight(id, dto, actor)
  }

  // ponytail: Direct C-level grading / score assignment on any task, affecting assignee KPI
  @Post(':id/exec-score')
  @RequireAnyPermission('kpis:score_exec', 'performance:evaluate', 'governance:vote', 'tasks:approve')
  scoreTask(
    @Param('id') id: string,
    @Body() body: { score: number; reason?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.scoreTaskDirectly(id, Number(body.score), body.reason, actor)
  }

  // 24-Hour Review Window & Auto-Finalization: CTO / CHRO / CEO KPI review
  @Post(':id/kpi-review')
  @RequireAnyPermission('kpis:score_exec', 'performance:evaluate', 'governance:vote', 'tasks:approve')
  reviewTaskKpi(
    @Param('id') id: string,
    @Body() dto: ReviewTaskKpiDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.reviewTaskKpi(id, dto, actor)
  }

  // ponytail: CHRO / Executive direct task weight modification anytime
  @Patch(':id/weight')
  @RequireAnyPermission('tasks:verify_weight', 'performance:evaluate', 'kpi:verify_weight', 'governance:vote')
  changeWeight(
    @Param('id') id: string,
    @Body() body: { weightPoints?: number; weightCategory?: string; reason?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.changeWeightDirectly(
      id,
      body.weightPoints,
      body.weightCategory,
      body.reason,
      actor,
    )
  }

  @Post(':id/return')
  @RequirePermissions('tasks:approve')
  returnWork(
    @Param('id') id: string,
    @Body() dto: ReturnTaskWorkDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.returnWork(id, dto, actor)
  }

  @Patch(':id/checklist/:itemId')
  @RequirePermissions('tasks:toggle_checklist')
  toggleChecklistItem(
    @Param('id') taskId: string,
    @Param('itemId') itemId: string,
    @Body('completed') completed?: boolean,
  ) {
    return this.tasksService.toggleChecklistItem(taskId, itemId, completed)
  }

  @Post(':id/submissions')
  @RequirePermissions('tasks:submit_work')
  submitWork(
    @Param('id') taskId: string,
    @Body() dto: SubmitTaskWorkDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.submitWork(taskId, dto, actor)
  }

  @Post(':id/comments')
  @RequirePermissions('tasks:comment')
  addComment(
    @Param('id') taskId: string,
    @Body() dto: AddTaskCommentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.addComment(taskId, dto, actor)
  }
}
