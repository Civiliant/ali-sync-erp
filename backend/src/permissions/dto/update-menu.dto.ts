import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateMenuDto {
  @IsOptional()
  @IsInt()
  parentId?: number | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  path?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  component?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}
