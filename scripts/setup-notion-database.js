/**
 * Notion Database Setup Script for ATOMIC FACTS
 * Run this to create/update all required properties in your Notion database
 */

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID_ATOMIC_FACTS;
const NOTION_VERSION = '2022-06-28';

async function setupNotionDatabase() {
    if (!NOTION_TOKEN || !DATABASE_ID) {
        console.error('Missing NOTION_TOKEN or NOTION_DATABASE_ID_ATOMIC_FACTS environment variables');
        process.exit(1);
    }

    console.log('Setting up Notion database properties...');

    const properties = {
        'Fact ID': {
            type: 'title',
            title: {}
        },
        'Parent Document': {
            type: 'rich_text',
            rich_text: {}
        },
        'Fact Text': {
            type: 'rich_text',
            rich_text: {}
        },
        'Fact Type': {
            type: 'select',
            select: {
                options: [
                    { name: 'DATE', color: 'blue' },
                    { name: 'AMOUNT', color: 'green' },
                    { name: 'ADMISSION', color: 'red' },
                    { name: 'IDENTITY', color: 'purple' },
                    { name: 'LOCATION', color: 'yellow' },
                    { name: 'RELATIONSHIP', color: 'pink' },
                    { name: 'ACTION', color: 'orange' },
                    { name: 'STATUS', color: 'gray' }
                ]
            }
        },
        'Location in Document': {
            type: 'rich_text',
            rich_text: {}
        },
        'Classification Level': {
            type: 'select',
            select: {
                options: [
                    { name: 'FACT', color: 'green' },
                    { name: 'SUPPORTED_CLAIM', color: 'blue' },
                    { name: 'ASSERTION', color: 'yellow' },
                    { name: 'ALLEGATION', color: 'orange' },
                    { name: 'CONTRADICTION', color: 'red' }
                ]
            }
        },
        'Weight': {
            type: 'number',
            number: {
                format: 'number'
            }
        },
        'Credibility Factors': {
            type: 'multi_select',
            multi_select: {
                options: [
                    { name: 'Direct Evidence', color: 'green' },
                    { name: 'Documentary', color: 'blue' },
                    { name: 'Witness Statement', color: 'purple' },
                    { name: 'Expert Opinion', color: 'yellow' },
                    { name: 'Circumstantial', color: 'orange' },
                    { name: 'Hearsay', color: 'gray' },
                    { name: 'Blockchain Verified', color: 'pink' },
                    { name: 'AI Analyzed', color: 'brown' }
                ]
            }
        },
        'ChittyChain Status': {
            type: 'select',
            select: {
                options: [
                    { name: 'Minted', color: 'green' },
                    { name: 'Pending', color: 'yellow' },
                    { name: 'Rejected', color: 'red' }
                ]
            }
        },
        'Verification Date': {
            type: 'date',
            date: {}
        },
        'Verification Method': {
            type: 'rich_text',
            rich_text: {}
        },
        'External ID': {
            type: 'rich_text',
            rich_text: {}
        },
        'Evidence Vault URL': {
            type: 'url',
            url: {}
        },
        'Sync Status': {
            type: 'select',
            select: {
                options: [
                    { name: 'Synced', color: 'green' },
                    { name: 'Pending', color: 'yellow' },
                    { name: 'Failed', color: 'red' },
                    { name: 'Stale', color: 'gray' }
                ]
            }
        },
        'Last Synced': {
            type: 'date',
            date: {}
        }
    };

    try {
        // First, fetch current database properties
        const currentDb = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Notion-Version': NOTION_VERSION
            }
        });

        if (!currentDb.ok) {
            throw new Error(`Failed to fetch database: ${currentDb.status} ${await currentDb.text()}`);
        }

        const dbData = await currentDb.json();
        const currentProps = dbData.properties;

        console.log('Current properties:', Object.keys(currentProps));

        // Update database with new properties
        const updatePayload = {
            properties: {}
        };

        // Only add properties that don't exist
        for (const [name, config] of Object.entries(properties)) {
            if (!currentProps[name]) {
                console.log(`Adding property: ${name}`);
                updatePayload.properties[name] = config;
            } else {
                console.log(`Property exists: ${name}`);
            }
        }

        if (Object.keys(updatePayload.properties).length > 0) {
            console.log('Updating database properties...');

            const response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${NOTION_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': NOTION_VERSION
                },
                body: JSON.stringify(updatePayload)
            });

            if (!response.ok) {
                throw new Error(`Failed to update database: ${response.status} ${await response.text()}`);
            }

            console.log('✅ Database properties updated successfully');
        } else {
            console.log('✅ All properties already exist');
        }

        // Create a test page to verify
        console.log('Creating test page...');
        const testPage = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_TOKEN}`,
                'Content-Type': 'application/json',
                'Notion-Version': NOTION_VERSION
            },
            body: JSON.stringify({
                parent: { database_id: DATABASE_ID },
                properties: {
                    'Fact ID': {
                        title: [{
                            text: { content: `TEST-${Date.now()}` }
                        }]
                    },
                    'Fact Text': {
                        rich_text: [{
                            text: { content: 'Test fact created by setup script' }
                        }]
                    },
                    'Fact Type': {
                        select: { name: 'DATE' }
                    },
                    'Classification Level': {
                        select: { name: 'FACT' }
                    },
                    'Weight': {
                        number: 0.95
                    },
                    'ChittyChain Status': {
                        select: { name: 'Pending' }
                    },
                    'Sync Status': {
                        select: { name: 'Synced' }
                    }
                }
            })
        });

        if (testPage.ok) {
            const pageData = await testPage.json();
            console.log('✅ Test page created:', pageData.url);
        } else {
            console.error('Failed to create test page:', await testPage.text());
        }

        console.log('\n✅ Notion database setup complete!');
        console.log('\nAdd these to your wrangler.toml or .env:');
        console.log(`NOTION_TOKEN=${NOTION_TOKEN}`);
        console.log(`NOTION_DATABASE_ID_ATOMIC_FACTS=${DATABASE_ID}`);

    } catch (error) {
        console.error('Setup failed:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    setupNotionDatabase();
}

module.exports = { setupNotionDatabase };