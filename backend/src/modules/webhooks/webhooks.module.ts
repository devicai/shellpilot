import { Module, forwardRef } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { RulesModule } from '../rules/rules.module';

// WebhooksService depends on PoliciesRepository, which lives in RulesModule.
// forwardRef is defensive in case TracesModule (which depends on us) ends up
// transitively imported from RulesModule in the future.
@Module({
  imports: [forwardRef(() => RulesModule)],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
