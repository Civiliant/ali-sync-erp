import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export class AssignUserRolesDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds!: number[];
}
