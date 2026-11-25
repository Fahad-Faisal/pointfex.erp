import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { TeamsService } from './teams.service'
import { CreateTeamDto, UpdateTeamDto, AddTeamMemberDto, CreateTeamResourceDto } from './dto/team.dto'
import { PermissionsGuard } from '../common/permissions.guard'
import { RequireAnyPermission, RequirePermissions } from '../common/require-permissions.decorator'
import { CurrentUser } from '../common/current-user.decorator'
import { AuthenticatedUser } from '../common/auth-user.interface'

@Controller('teams')
@UseGuards(PermissionsGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @RequireAnyPermission('teams:read_own', 'teams:read_all')
  findAll(@CurrentUser() actor?: AuthenticatedUser) {
    return this.teamsService.findAll(actor)
  }

  @Get('resources/all')
  @RequireAnyPermission('teams:read_all', 'teams:read_own')
  getAllResources() {
    return this.teamsService.getAllResources()
  }

  @Get(':id')
  @RequireAnyPermission('teams:read_own', 'teams:read_all')
  findOne(@Param('id') id: string) {
    return this.teamsService.findOne(id)
  }

  @Get(':id/resources')
  @RequireAnyPermission('teams:read_own', 'teams:read_all')
  getResources(@Param('id') id: string) {
    return this.teamsService.getResources(id)
  }

  @Post(':id/resources')
  @RequireAnyPermission('teams:update', 'teams:manage_members', 'tasks:create_assign', 'projects:update')
  addResource(
    @Param('id') id: string,
    @Body() dto: CreateTeamResourceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.teamsService.addResource(id, dto, actor)
  }

  @Post()
  @RequirePermissions('teams:create')
  create(@Body() dto: CreateTeamDto) {
    return this.teamsService.create(dto)
  }

  @Patch(':id')
  @RequireAnyPermission('teams:update', 'teams:manage_members')
  update(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, dto)
  }

  @Post(':id/members')
  @RequirePermissions('teams:manage_members')
  addMember(@Param('id') id: string, @Body() dto: AddTeamMemberDto) {
    return this.teamsService.addMember(id, dto)
  }

  @Delete(':id/members/:employeeId')
  @RequirePermissions('teams:manage_members')
  removeMember(@Param('id') id: string, @Param('employeeId') employeeId: string) {
    return this.teamsService.removeMember(id, employeeId)
  }
}
