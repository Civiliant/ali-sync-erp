import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import { Permissions } from './permissions.decorator.js';
import { PermissionsService } from './permissions.service.js';
import { AssignRolePermissionsDto } from './dto/assign-role-permissions.dto.js';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto.js';
import { CreateMenuDto } from './dto/create-menu.dto.js';
import { CreatePermissionDto } from './dto/create-permission.dto.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateMenuDto } from './dto/update-menu.dto.js';
import { UpdatePermissionDto } from './dto/update-permission.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { PermissionsAuditInterceptor } from './permissions-audit.interceptor.js';

@Controller('permissions')
@UseInterceptors(PermissionsAuditInterceptor)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('roles')
  @Permissions('role:read')
  listRoles() {
    return this.permissionsService.listRoles();
  }

  @Post('roles')
  @Permissions('role:manage')
  createRole(@Body() dto: CreateRoleDto) {
    return this.permissionsService.createRole(dto);
  }

  @Put('roles/:id')
  @Permissions('role:manage')
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.permissionsService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @Permissions('role:manage')
  deleteRole(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.deleteRole(id);
  }

  @Put('roles/:id/permissions')
  @Permissions('role:manage')
  assignRolePermissions(
    @Param('id', ParseIntPipe) roleId: number,
    @Body() dto: AssignRolePermissionsDto,
  ) {
    return this.permissionsService.assignRolePermissions(roleId, dto);
  }

  @Get('roles/:id/permissions')
  @Permissions('role:read')
  listRolePermissions(@Param('id', ParseIntPipe) roleId: number) {
    return this.permissionsService.listRolePermissions(roleId);
  }

  @Put('users/:id/roles')
  @Permissions('user:manage')
  assignUserRoles(
    @Param('id', ParseIntPipe) userId: number,
    @Body() dto: AssignUserRolesDto,
  ) {
    return this.permissionsService.assignUserRoles(userId, dto);
  }

  @Get('users/:id/roles')
  @Permissions('role:read')
  listUserRoles(@Param('id', ParseIntPipe) userId: number) {
    return this.permissionsService.listUserRoles(userId);
  }

  @Get('items')
  @Permissions('role:read')
  listPermissions() {
    return this.permissionsService.listPermissions();
  }

  @Post('items')
  @Permissions('role:manage')
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.createPermission(dto);
  }

  @Put('items/:id')
  @Permissions('role:manage')
  updatePermission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.permissionsService.updatePermission(id, dto);
  }

  @Delete('items/:id')
  @Permissions('role:manage')
  deletePermission(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.deletePermission(id);
  }

  @Get('menus')
  @Permissions('role:read')
  listMenus() {
    return this.permissionsService.listMenus();
  }

  @Post('menus')
  @Permissions('role:manage')
  createMenu(@Body() dto: CreateMenuDto) {
    return this.permissionsService.createMenu(dto);
  }

  @Put('menus/:id')
  @Permissions('role:manage')
  updateMenu(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMenuDto,
  ) {
    return this.permissionsService.updateMenu(id, dto);
  }

  @Delete('menus/:id')
  @Permissions('role:manage')
  deleteMenu(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.deleteMenu(id);
  }
}
