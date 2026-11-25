import { IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string
}
