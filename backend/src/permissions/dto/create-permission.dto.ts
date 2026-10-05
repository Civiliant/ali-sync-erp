import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  module!: string;

  @IsOptional()
  @IsInt()
  menuId?: number;
}
