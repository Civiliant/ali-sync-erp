import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export class AssignRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @Min(1, { each: true })
  permissionIds!: number[];
}
