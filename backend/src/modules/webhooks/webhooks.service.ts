import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PoliciesRepository } from '../rules/policies.repository';
import { Policy, WebhookEvent, WEBHOOK_EVENTS } from '../rules/schema/policy.schema';
import { TraceDecision } from '../traces/dto/create-trace.dto';
import { Trace } from '../traces/schema/trace.schema';

// Maps a trace decision into the webhook event key the policy uses to look up
// a URL. Decisions that don't have an event (allow / install / uninstall /
// etc.) return null and are silently skipped.
const DECISION_TO_EVENT: Partial<Record<TraceDecision, WebhookEvent>> = {
  deny: 'on_deny',
  'requires-approval': 'on_requires_approval',
  'jit-issued': 'on_jit_issued',
  'binary-missing': 'on_binary_missing',
};

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000]; // 3 attempts total
const REQUEST_TIMEOUT_MS = 5_000;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly policies: PoliciesRepository) {}

  /**
   * Fire-and-forget dispatch. Returns immediately; delivery (incl. retries)
   * happens on the event loop without blocking the trace ingest path. This is
   * intentional — a downstream Slack hook hiccup must never delay a CLI invocation.
   */
  emit(trace: Trace): void {
    // Map decision → event up front so we don't even hit the DB for traces
    // that have no webhook event. allow / install / uninstall noise stays out.
    const event = DECISION_TO_EVENT[trace.decision];
    if (!event) return;

    // Defer the actual send so the caller (TracesService.ingest) returns
    // promptly. The fire path runs unawaited; errors land in the logger.
    void this.dispatch(event, trace).catch((err) => {
      this.logger.warn(`webhook dispatch failed: ${(err as Error).message}`);
    });
  }

  /**
   * Synchronous test ping for the admin UI's "Test webhook" button. Sends a
   * deterministic payload to the configured URL and surfaces the receiver's
   * response (status / first 200 chars of body) so admins can confirm signing
   * and delivery without waiting for a real trace.
   */
  async testEvent(policyId: string, event: WebhookEvent): Promise<{ status: number; body: string }> {
    if (!WEBHOOK_EVENTS.includes(event)) {
      throw new BadRequestException(`unknown event ${event}`);
    }
    const policy = (await this.policies.findById(policyId, {})) as Policy & { _id?: unknown };
    if (!policy) throw new NotFoundException('Policy not found');
    const url = (policy.webhooks ?? {})[event];
    if (!url) throw new BadRequestException(`Policy has no ${event} URL configured`);

    const fakeTrace = {
      cli: 'shellpilot-test',
      commandPath: ['webhook', 'test'],
      args: ['--event', event],
      decision: 'deny',
      reason: 'test ping from the ShellPilot admin UI',
      timestamp: new Date(),
    } as unknown as Trace;
    const payload = this.buildPayload(event, fakeTrace, policy);
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'shellpilot-webhooks/1.0',
      'X-ShellPilot-Event': event,
      'X-ShellPilot-Test': '1',
    };
    if (policy.webhookSecret) {
      const sig = createHmac('sha256', policy.webhookSecret).update(body).digest('hex');
      headers['X-ShellPilot-Signature'] = `sha256=${sig}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const resp = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
      const text = await resp.text();
      return { status: resp.status, body: text.slice(0, 200) };
    } finally {
      clearTimeout(timer);
    }
  }

  private async dispatch(event: WebhookEvent, trace: Trace): Promise<void> {
    const policy = await this.policies.findActive();
    if (!policy) return;
    const url = (policy.webhooks ?? {})[event];
    if (!url) return;

    const payload = this.buildPayload(event, trace, policy);
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'shellpilot-webhooks/1.0',
      'X-ShellPilot-Event': event,
    };
    if (policy.webhookSecret) {
      const sig = createHmac('sha256', policy.webhookSecret).update(body).digest('hex');
      headers['X-ShellPilot-Signature'] = `sha256=${sig}`;
    }

    await this.deliverWithRetry(url, body, headers, event);
  }

  private buildPayload(event: WebhookEvent, trace: Trace, policy: Policy & { _id?: unknown }): unknown {
    const policyId = (policy._id as { toString(): string } | undefined)?.toString();
    return {
      event,
      timestamp: new Date().toISOString(),
      policy: { id: policyId, name: policy.name },
      trace: this.serialiseTrace(trace),
    };
  }

  private serialiseTrace(trace: Trace): Record<string, unknown> {
    const t = trace as unknown as Record<string, unknown> & {
      toJSON?: () => Record<string, unknown>;
    };
    if (typeof t.toJSON === 'function') return t.toJSON();
    return t;
  }

  private async deliverWithRetry(
    url: string,
    body: string,
    headers: Record<string, string>,
    event: WebhookEvent,
  ): Promise<void> {
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal,
          });
          if (resp.ok) return;
          // 4xx errors mean the receiver rejected us — retrying won't help.
          // 5xx and network errors get retried.
          if (resp.status >= 400 && resp.status < 500) {
            this.logger.warn(`webhook ${event} → ${url} returned ${resp.status} (no retry)`);
            return;
          }
          lastErr = new Error(`status ${resp.status}`);
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        lastErr = err as Error;
      }
      if (attempt < RETRY_DELAYS_MS.length - 1) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
    this.logger.warn(
      `webhook ${event} → ${url} failed after ${RETRY_DELAYS_MS.length} attempts: ${lastErr?.message ?? 'unknown'}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
