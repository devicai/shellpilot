import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags, ApiSecurity } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { CurrentApiKey } from '../../common/decorators/current-api-key.decorator';
import { AuthenticatedApiKey, ExtensionScope } from '../../interfaces';
import { RulesService } from './rules.service';
import { PolicyEvaluatorService } from './evaluator/policy-evaluator.service';
import { PolicyYamlService } from './yaml/policy-yaml.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WebhookEvent } from './schema/policy.schema';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { EvaluateDto } from './dto/evaluate.dto';

@ApiTags('Rules')
@Controller('rules')
export class RulesController {
  constructor(
    private readonly service: RulesService,
    private readonly evaluator: PolicyEvaluatorService,
    private readonly yamlCompiler: PolicyYamlService,
    private readonly webhooks: WebhooksService,
  ) {}

  // --- Active policy as YAML (consumed by the Go wrapper) ---

  @ApiSecurity('x-api-key')
  @UseGuards(ApiKeyAuthGuard)
  @Get('active.yaml')
  @Header('Content-Type', 'application/yaml; charset=utf-8')
  @ApiProduces('application/yaml')
  @ApiOperation({ summary: "Effective policy for the API key's identity, compiled to YAML (Go wrapper)" })
  getActivePolicyYaml(@CurrentApiKey() apiKey: AuthenticatedApiKey, @Scope() scope: ExtensionScope) {
    return this.yamlCompiler.compileEffectivePolicyYamlForUser(apiKey.userId, scope);
  }

  // --- Policies (JWT) ---

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  @Get('policies')
  @ApiOperation({ summary: 'List policies (JWT or API key). Pass ownerUserId to fetch a user\'s individual policies; without it the list is shared policies only.' })
  listPolicies(
    @Scope() scope: ExtensionScope,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('ownerUserId') ownerUserId?: string,
  ) {
    return this.service.listPolicies(
      scope,
      {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      },
      ownerUserId,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  @Get('policies/:id')
  @ApiOperation({ summary: 'Get policy by id' })
  getPolicy(@Param('id') id: string, @Scope() scope: ExtensionScope) {
    return this.service.getPolicy(id, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Post('policies')
  @ApiOperation({ summary: 'Create policy' })
  createPolicy(@Body() dto: CreatePolicyDto, @Scope() scope: ExtensionScope) {
    return this.service.createPolicy(dto, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Put('policies/:id')
  @ApiOperation({ summary: 'Replace policy' })
  updatePolicy(@Param('id') id: string, @Body() dto: UpdatePolicyDto, @Scope() scope: ExtensionScope) {
    return this.service.updatePolicy(id, dto, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Post('policies/:id/activate')
  @ApiOperation({ summary: 'Activate a policy (deactivates all others)' })
  activatePolicy(@Param('id') id: string, @Scope() scope: ExtensionScope) {
    return this.service.activatePolicy(id, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('policies/:id')
  @ApiOperation({ summary: 'Delete policy and all its rules' })
  async deletePolicy(@Param('id') id: string, @Scope() scope: ExtensionScope) {
    await this.service.deletePolicy(id, scope);
    return { status: 'ok' };
  }

  // --- Webhook test ---

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Post('policies/:id/webhooks/:event/test')
  @ApiOperation({ summary: 'Send a test ping to a configured webhook URL' })
  testWebhook(@Param('id') id: string, @Param('event') event: string, @Scope() scope: ExtensionScope) {
    return this.webhooks.testEvent(id, event as WebhookEvent, scope);
  }

  // --- Rules ---

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  @Get('policies/:policyId/rules')
  @ApiOperation({ summary: 'List rules for a policy' })
  listRules(@Param('policyId') policyId: string, @Scope() scope: ExtensionScope) {
    return this.service.listRules(policyId, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Post('policies/:policyId/rules')
  @ApiOperation({ summary: 'Create rule under a policy' })
  createRule(@Param('policyId') policyId: string, @Body() dto: CreateRuleDto, @Scope() scope: ExtensionScope) {
    return this.service.createRule(policyId, dto, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Patch('rules/:id')
  @ApiOperation({ summary: 'Update rule' })
  updateRule(@Param('id') id: string, @Body() dto: UpdateRuleDto, @Scope() scope: ExtensionScope) {
    return this.service.updateRule(id, dto, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Delete('rules/:id')
  @ApiOperation({ summary: 'Delete rule' })
  async deleteRule(@Param('id') id: string, @Scope() scope: ExtensionScope) {
    await this.service.deleteRule(id, scope);
    return { status: 'ok' };
  }

  // --- Evaluate (consumed by the Go wrapper) ---

  @ApiSecurity('x-api-key')
  @UseGuards(ApiKeyAuthGuard)
  @Post('evaluate')
  @ApiOperation({ summary: "Evaluate a CLI command against the API key's effective policy" })
  evaluate(@Body() dto: EvaluateDto, @CurrentApiKey() apiKey: AuthenticatedApiKey, @Scope() scope: ExtensionScope) {
    // Identity comes from the authenticated key, never the body (a key must not
    // evaluate as another user). dto.policyId stays as an explicit admin/test override.
    return this.evaluator.evaluate(
      dto.cli,
      dto.args,
      { userId: apiKey.userId, policyOverrideId: dto.policyId },
      scope,
    );
  }
}
