#!/usr/bin/env node

/**
 * ChittyID Basic Usage Examples
 * Demonstrates common usage patterns for the ChittyID API
 */

const API_BASE = 'https://foundation.thechitty.com';

// Example 1: Check system health
async function checkHealth() {
    console.log('🏥 Checking ChittyID system health...');

    try {
        const response = await fetch(`${API_BASE}/api/health`);
        const health = await response.json();

        console.log('Status:', health.status);
        console.log('Version:', health.version);
        console.log('Response Time:', health.response_time_ms + 'ms');
        console.log('Components:', health.components);

        return health.status === 'healthy';
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        return false;
    }
}

// Example 2: Validate a ChittyID
async function validateChittyID(chittyId) {
    console.log(`🔍 Validating ChittyID: ${chittyId}`);

    try {
        const response = await fetch(`${API_BASE}/api/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: chittyId })
        });

        const result = await response.json();

        if (result.success && result.valid) {
            console.log('✅ Valid ChittyID');
            console.log('  Version:', result.parsed.version);
            console.log('  Region:', result.metadata.regionName);
            console.log('  Entity Type:', result.metadata.entityTypeName);
            console.log('  Trust Level:', result.metadata.trustLevelName);
        } else {
            console.log('❌ Invalid ChittyID:', result.error);
        }

        return result;
    } catch (error) {
        console.error('❌ Validation failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Example 3: Get ChittyID information
async function getChittyIDInfo(chittyId) {
    console.log(`📋 Getting info for ChittyID: ${chittyId}`);

    try {
        const response = await fetch(`${API_BASE}/api/info/${chittyId}`);
        const result = await response.json();

        if (result.success) {
            console.log('✅ ChittyID Information:');
            console.log('  ID:', result.chittyId);
            console.log('  Format:', result.format);
            console.log('  Components:', result.parsed);
            console.log('  Metadata:', result.metadata);
        } else {
            console.log('❌ Failed to get info:', result.error);
        }

        return result;
    } catch (error) {
        console.error('❌ Info request failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Example 4: Get format specification
async function getFormatSpec() {
    console.log('📐 Getting ChittyID format specification...');

    try {
        const response = await fetch(`${API_BASE}/api/spec`);
        const spec = await response.json();

        console.log('✅ Format Specification:');
        console.log('  Format:', spec.specification.format);
        console.log('  Components:', spec.specification.components);
        console.log('  Entity Types:', spec.specification.entityTypes);
        console.log('  Trust Levels:', spec.specification.trustLevels);

        return spec;
    } catch (error) {
        console.error('❌ Spec request failed:', error.message);
        return null;
    }
}

// Example 5: Check service registry health
async function checkServiceHealth() {
    console.log('🏢 Checking ChittyOS service registry health...');

    try {
        const response = await fetch(`${API_BASE}/api/services/health`);
        const health = await response.json();

        console.log('✅ Service Health Summary:');
        console.log(`  Total Services: ${health.total}`);
        console.log(`  Healthy: ${health.healthy}`);
        console.log(`  Unhealthy: ${health.unhealthy}`);
        console.log(`  Health Percentage: ${health.healthPercentage}%`);

        if (health.topIssues && health.topIssues.length > 0) {
            console.log('  Top Issues:', health.topIssues);
        }

        return health;
    } catch (error) {
        console.error('❌ Service health check failed:', error.message);
        return null;
    }
}

// Example 6: Check session sync health
async function checkSessionHealth() {
    console.log('🔄 Checking session synchronization health...');

    try {
        const response = await fetch(`${API_BASE}/api/session/health`);
        const health = await response.json();

        console.log('✅ Session Health:');
        console.log('  Status:', health.status);
        console.log('  Active Sessions:', health.sessions_active);
        console.log('  Sync Status:', health.sync_status);

        return health;
    } catch (error) {
        console.error('❌ Session health check failed:', error.message);
        return null;
    }
}

// Example 7: Check Notion bridge status
async function checkNotionBridge() {
    console.log('🌉 Checking Notion bridge status...');

    try {
        const response = await fetch(`${API_BASE}/bridges/notion/status`);
        const status = await response.json();

        console.log('✅ Notion Bridge Status:');
        console.log('  Status:', status.status);
        console.log('  Sync Enabled:', status.sync_enabled);
        console.log('  DLQ Size:', status.dlq_size);
        console.log('  Success Rate:', (status.metrics.success_rate * 100).toFixed(1) + '%');
        console.log('  Synced Today:', status.metrics.synced_today);

        return status;
    } catch (error) {
        console.error('❌ Notion bridge check failed:', error.message);
        return null;
    }
}

// Example 8: Attempt to generate ChittyID (will fail without auth)
async function attemptGeneration() {
    console.log('🆔 Attempting ChittyID generation (should fail without auth)...');

    try {
        const response = await fetch(`${API_BASE}/api/get-chittyid?for=person`);
        const result = await response.json();

        if (response.status === 401) {
            console.log('✅ Security working: Authentication required');
            console.log('  Message:', result.message);
        } else {
            console.log('⚠️  Unexpected result:', result);
        }

        return result;
    } catch (error) {
        console.error('❌ Generation attempt failed:', error.message);
        return null;
    }
}

// Main demo function
async function runDemo() {
    console.log('🚀 ChittyID API Demo Starting...\n');

    // Run all examples
    const results = {
        health: await checkHealth(),
        validation: await validateChittyID('03-1-USA-0001-P-251-3-15'),
        info: await getChittyIDInfo('03-1-USA-0001-P-251-3-15'),
        spec: await getFormatSpec(),
        serviceHealth: await checkServiceHealth(),
        sessionHealth: await checkSessionHealth(),
        notionBridge: await checkNotionBridge(),
        generation: await attemptGeneration()
    };

    console.log('\n📊 Demo Summary:');
    console.log('  System Health:', results.health ? '✅ Healthy' : '❌ Unhealthy');
    console.log('  Validation:', results.validation.success ? '✅ Working' : '❌ Failed');
    console.log('  Info Retrieval:', results.info.success ? '✅ Working' : '❌ Failed');
    console.log('  Spec Retrieval:', results.spec ? '✅ Working' : '❌ Failed');
    console.log('  Service Health:', results.serviceHealth ? '✅ Working' : '❌ Failed');
    console.log('  Session Health:', results.sessionHealth ? '✅ Working' : '❌ Failed');
    console.log('  Notion Bridge:', results.notionBridge ? '✅ Working' : '❌ Failed');
    console.log('  Security:', results.generation ? '✅ Protected' : '❌ Exposed');

    console.log('\n🎉 Demo completed!');

    return results;
}

// Handle command line usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const command = process.argv[2];

    switch (command) {
        case 'health':
            await checkHealth();
            break;
        case 'validate':
            if (process.argv[3]) {
                await validateChittyID(process.argv[3]);
            } else {
                console.error('Usage: node basic-usage.js validate <chittyid>');
            }
            break;
        case 'info':
            if (process.argv[3]) {
                await getChittyIDInfo(process.argv[3]);
            } else {
                console.error('Usage: node basic-usage.js info <chittyid>');
            }
            break;
        case 'spec':
            await getFormatSpec();
            break;
        case 'services':
            await checkServiceHealth();
            break;
        case 'sessions':
            await checkSessionHealth();
            break;
        case 'notion':
            await checkNotionBridge();
            break;
        case 'demo':
        default:
            await runDemo();
            break;
    }
}

export {
    checkHealth,
    validateChittyID,
    getChittyIDInfo,
    getFormatSpec,
    checkServiceHealth,
    checkSessionHealth,
    checkNotionBridge,
    attemptGeneration,
    runDemo
};