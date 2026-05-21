import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Policy, PolicySchema } from './schema/policy.schema';
import { Rule, RuleSchema } from './schema/rule.schema';
import { Cli, CliSchema } from '../clis-catalog/schema/cli.schema';
import { PoliciesRepository } from './policies.repository';
import { RulesRepository } from './rules.repository';
import { RulesService } from './rules.service';
import { RulesController } from './rules.controller';
import { PolicyEvaluatorService } from './evaluator/policy-evaluator.service';
import { PolicyYamlService } from './yaml/policy-yaml.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Policy.name, schema: PolicySchema },
      { name: Rule.name, schema: RuleSchema },
      { name: Cli.name, schema: CliSchema },
    ]),
  ],
  controllers: [RulesController],
  providers: [PoliciesRepository, RulesRepository, RulesService, PolicyEvaluatorService, PolicyYamlService],
  exports: [PolicyEvaluatorService, RulesService],
})
export class RulesModule {}
