/**
 * Notion Webhook Endpoint for Cloudflare Pages Functions
 * Handles real-time updates from Notion
 */

import { handleNotionWebhook } from '../../src/services/notion-webhook.js';

/**
 * POST /webhooks/notion
 * Receives and processes Notion webhook events
 */
export async function onRequestPost({ request, env }) {
  try {
    // Check if webhooks are enabled
    if (!env.NOTION_WEBHOOK_SECRET) {
      return new Response(
        JSON.stringify({
          error: 'Webhooks not configured'
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Process the webhook
    const result = await handleNotionWebhook(request, env);

    // Return appropriate response
    return new Response(
      JSON.stringify(result),
      {
        status: result.status || (result.success ? 200 : 500),
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('Webhook endpoint error:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * GET /webhooks/notion
 * Health check and webhook status
 */
export async function onRequestGet({ env }) {
  try {
    // Get webhook metrics
    const metricsData = await env.AUTH_CACHE.get('metrics:notion:webhooks');
    const metrics = metricsData ? JSON.parse(metricsData) : null;

    // Get recent webhook logs
    const logs = [];
    const logKeys = await env.AUTH_CACHE.list({ prefix: 'webhook:log:', limit: 10 });

    for (const key of logKeys.keys) {
      const log = await env.AUTH_CACHE.get(key.name);
      if (log) {
        logs.push(JSON.parse(log));
      }
    }

    // Get DLQ status
    const dlqKeys = await env.AUTH_CACHE.list({ prefix: 'dlq:webhook:', limit: 100 });
    const dlqCount = dlqKeys.keys.length;

    return new Response(
      JSON.stringify({
        status: 'healthy',
        webhook: {
          configured: !!env.NOTION_WEBHOOK_SECRET,
          url: `https://id.chitty.cc/webhooks/notion`
        },
        metrics: metrics || {
          webhooks_received: 0,
          webhooks_processed: 0,
          webhooks_failed: 0,
          events_by_type: {}
        },
        recentLogs: logs.slice(0, 5),
        dlq: {
          count: dlqCount,
          hasErrors: dlqCount > 0
        },
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'error',
        error: error.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * PUT /webhooks/notion/retry
 * Retry failed webhook events from DLQ
 */
export async function onRequestPut({ env }) {
  try {
    const dlqKeys = await env.AUTH_CACHE.list({ prefix: 'dlq:webhook:' });
    let processed = 0;
    let failed = 0;

    for (const key of dlqKeys.keys) {
      const dlqData = await env.AUTH_CACHE.get(key.name);
      if (!dlqData) continue;

      const entry = JSON.parse(dlqData);

      // Check if ready for retry (exponential backoff)
      const retryDelay = Math.min(1000 * Math.pow(2, entry.attempts), 3600000);
      const nextRetry = new Date(entry.timestamp).getTime() + retryDelay;

      if (Date.now() < nextRetry) {
        continue; // Not ready for retry yet
      }

      try {
        // Reconstruct request
        const request = new Request('https://id.chitty.cc/webhooks/notion', {
          method: 'POST',
          headers: entry.headers,
          body: entry.body
        });

        // Retry processing
        const result = await handleNotionWebhook(request, env);

        if (result.success) {
          // Success - remove from DLQ
          await env.AUTH_CACHE.delete(key.name);
          processed++;
        } else {
          // Failed again - update attempts
          entry.attempts++;
          if (entry.attempts > 5) {
            // Max retries exceeded - move to permanent failure
            await env.AUTH_CACHE.put(
              `dlq:webhook:permanent:${key.name.split(':')[2]}`,
              JSON.stringify(entry),
              { expirationTtl: 86400 * 30 } // Keep for 30 days
            );
            await env.AUTH_CACHE.delete(key.name);
          } else {
            await env.AUTH_CACHE.put(key.name, JSON.stringify(entry));
          }
          failed++;
        }
      } catch (error) {
        console.error('DLQ retry error:', error);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        failed,
        remaining: dlqKeys.keys.length - processed
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to process DLQ',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * DELETE /webhooks/notion/dlq
 * Clear the webhook DLQ
 */
export async function onRequestDelete({ env }) {
  try {
    const dlqKeys = await env.AUTH_CACHE.list({ prefix: 'dlq:webhook:' });
    let deleted = 0;

    for (const key of dlqKeys.keys) {
      await env.AUTH_CACHE.delete(key.name);
      deleted++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted,
        message: `Cleared ${deleted} items from webhook DLQ`
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to clear DLQ',
        message: error.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}