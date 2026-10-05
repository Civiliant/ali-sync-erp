import { SetMetadata } from '@nestjs/common';
import { REQUIRED_PERMISSIONS } from './permissions.constants.js';

export const Permissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
