import { Module } from '@nestjs/common'
import { TasksService } from './tasks.service'
import { TasksController } from './tasks.controller'
import { TaskTransitionService } from './task-transition.service'

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskTransitionService],
  exports: [TasksService, TaskTransitionService],
})
export class TasksModule {}
