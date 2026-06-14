import { Module } from '@nestjs/common';
import { PublicConfigController } from './public-config.controller';

/**
 * Exposes GET /public-config — an unauthenticated endpoint the frontend reads at
 * boot to adapt the login UI to the providers enabled in config.yml.
 */
@Module({
  controllers: [PublicConfigController],
})
export class PublicConfigModule {}
