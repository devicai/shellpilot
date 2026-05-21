import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/users/schema/user.schema';

export const ROLES_KEY = 'roles';

/** Restricts a route to one or more roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
