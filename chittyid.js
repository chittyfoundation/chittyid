class ChittyID {
    constructor() {
        this.version = "01";
        this.sequentialCounter = 1;
    }

    mod97Checksum(str) {
        let checksum = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char >= '0' && char <= '9') {
                checksum = (checksum * 10 + parseInt(char)) % 97;
            } else if (char >= 'A' && char <= 'Z') {
                const value = char.charCodeAt(0) - 55; // A=10, B=11, etc.
                checksum = (checksum * 100 + value) % 97;
            }
        }
        return (98 - checksum) % 97;
    }

    getCurrentYearMonth() {
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        return year + month.slice(1); // YM format: e.g., "25" + "9" = "259"
    }

    generateSequential() {
        const seq = this.sequentialCounter.toString().padStart(4, '0');
        this.sequentialCounter++;
        if (this.sequentialCounter > 9999) {
            this.sequentialCounter = 1;
        }
        return seq;
    }

    generate(region, jurisdiction, entityType, trustLevel) {
        if (!region || !jurisdiction || !entityType || trustLevel === undefined) {
            throw new Error('All parameters are required');
        }

        if (jurisdiction.length !== 3) {
            throw new Error('Jurisdiction must be exactly 3 letters');
        }

        if (!/^[0-9]$/.test(region)) {
            throw new Error('Region must be a single digit');
        }

        if (!/^[PLTE]$/.test(entityType)) {
            throw new Error('Entity type must be P, L, T, or E');
        }

        if (!/^[0-5]$/.test(trustLevel)) {
            throw new Error('Trust level must be 0-5');
        }

        const sequential = this.generateSequential();
        const yearMonth = this.getCurrentYearMonth();

        const baseId = `${this.version}${region}${jurisdiction.toUpperCase()}${sequential}${entityType}${yearMonth}${trustLevel}`;
        const checksum = this.mod97Checksum(baseId).toString().padStart(2, '0');

        return `${this.version}-${region}-${jurisdiction.toUpperCase()}-${sequential}-${entityType}-${yearMonth}-${trustLevel}-${checksum}`;
    }

    validate(chittyId) {
        if (!chittyId || typeof chittyId !== 'string') {
            return { valid: false, error: 'ChittyID is required and must be a string' };
        }

        const parts = chittyId.split('-');
        if (parts.length !== 8) {
            return { valid: false, error: 'Invalid format: must have 8 parts separated by hyphens' };
        }

        const [version, region, jurisdiction, sequential, entityType, yearMonth, trustLevel, checksum] = parts;

        // Validate each component
        if (!/^[0-9]{2}$/.test(version)) {
            return { valid: false, error: 'Version must be 2 digits' };
        }

        if (!/^[0-9]$/.test(region)) {
            return { valid: false, error: 'Region must be 1 digit' };
        }

        if (!/^[A-Z]{3}$/.test(jurisdiction)) {
            return { valid: false, error: 'Jurisdiction must be 3 uppercase letters' };
        }

        if (!/^[0-9]{4}$/.test(sequential)) {
            return { valid: false, error: 'Sequential must be 4 digits' };
        }

        if (!/^[PLTE]$/.test(entityType)) {
            return { valid: false, error: 'Entity type must be P, L, T, or E' };
        }

        if (!/^[0-9]{2,3}$/.test(yearMonth)) {
            return { valid: false, error: 'Year-Month must be 2-3 digits' };
        }

        if (!/^[0-5]$/.test(trustLevel)) {
            return { valid: false, error: 'Trust level must be 0-5' };
        }

        if (!/^[0-9]{2}$/.test(checksum)) {
            return { valid: false, error: 'Checksum must be 2 digits' };
        }

        // Validate checksum
        const baseId = `${version}${region}${jurisdiction}${sequential}${entityType}${yearMonth}${trustLevel}`;
        const calculatedChecksum = this.mod97Checksum(baseId).toString().padStart(2, '0');

        if (checksum !== calculatedChecksum) {
            return {
                valid: false,
                error: `Invalid checksum: expected ${calculatedChecksum}, got ${checksum}`
            };
        }

        return {
            valid: true,
            components: {
                version,
                region,
                jurisdiction,
                sequential,
                entityType: this.getEntityTypeName(entityType),
                yearMonth,
                trustLevel: this.getTrustLevelName(trustLevel),
                checksum
            }
        };
    }

    getEntityTypeName(type) {
        const types = {
            'P': 'ChittyPerson',
            'L': 'ChittyLocation',
            'T': 'ChittyThing',
            'E': 'ChittyEvent'
        };
        return types[type] || type;
    }

    getTrustLevelName(level) {
        const levels = {
            '0': 'L0 - Unverified',
            '1': 'L1 - Basic',
            '2': 'L2 - Standard',
            '3': 'L3 - Verified',
            '4': 'L4 - Premium',
            '5': 'L5 - Official'
        };
        return levels[level] || level;
    }

    getRegionName(region) {
        const regions = {
            '1': 'North America',
            '2': 'South America',
            '3': 'Europe',
            '4': 'Asia',
            '5': 'Africa',
            '6': 'Oceania',
            '7': 'Antarctica',
            '8': 'International Waters',
            '9': 'Digital/Virtual'
        };
        return regions[region] || region;
    }
}

// Global instance
const chittyIDGenerator = new ChittyID();

function generateChittyID() {
    try {
        const region = document.getElementById('region').value;
        const jurisdiction = document.getElementById('jurisdiction').value;
        const entityType = document.getElementById('entityType').value;
        const trustLevel = document.getElementById('trustLevel').value;

        if (!jurisdiction) {
            alert('Please enter a jurisdiction');
            return;
        }

        const chittyId = chittyIDGenerator.generate(region, jurisdiction, entityType, trustLevel);

        document.getElementById('chittyid').textContent = chittyId;

        const breakdown = `
            <strong>Breakdown:</strong><br>
            • Version: ${chittyIDGenerator.version}<br>
            • Region: ${region} (${chittyIDGenerator.getRegionName(region)})<br>
            • Jurisdiction: ${jurisdiction.toUpperCase()}<br>
            • Sequential: ${chittyId.split('-')[3]}<br>
            • Type: ${chittyIDGenerator.getEntityTypeName(entityType)}<br>
            • Year-Month: ${chittyId.split('-')[5]}<br>
            • Trust: ${chittyIDGenerator.getTrustLevelName(trustLevel)}<br>
            • Checksum: ${chittyId.split('-')[7]}
        `;

        document.getElementById('breakdown').innerHTML = breakdown;
        document.getElementById('result').style.display = 'block';

    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function validateChittyID() {
    const input = document.getElementById('validateInput').value.trim();

    if (!input) {
        alert('Please enter a ChittyID to validate');
        return;
    }

    const result = chittyIDGenerator.validate(input);

    if (result.valid) {
        document.getElementById('chittyid').textContent = input;
        document.getElementById('chittyid').style.background = '#c6f6d5';
        document.getElementById('chittyid').style.color = '#22543d';

        const breakdown = `
            <strong>✅ Valid ChittyID</strong><br>
            • Version: ${result.components.version}<br>
            • Region: ${result.components.region} (${chittyIDGenerator.getRegionName(result.components.region)})<br>
            • Jurisdiction: ${result.components.jurisdiction}<br>
            • Sequential: ${result.components.sequential}<br>
            • Type: ${result.components.entityType}<br>
            • Year-Month: ${result.components.yearMonth}<br>
            • Trust: ${result.components.trustLevel}<br>
            • Checksum: ${result.components.checksum} ✓
        `;

        document.getElementById('breakdown').innerHTML = breakdown;
    } else {
        document.getElementById('chittyid').textContent = input;
        document.getElementById('chittyid').style.background = '#fed7d7';
        document.getElementById('chittyid').style.color = '#c53030';

        document.getElementById('breakdown').innerHTML = `<strong>❌ Invalid ChittyID</strong><br>Error: ${result.error}`;
    }

    document.getElementById('result').style.display = 'block';
}

// Reset styles when generating new ID
function resetResultStyles() {
    document.getElementById('chittyid').style.background = 'white';
    document.getElementById('chittyid').style.color = '#2d3748';
}

// Auto-format jurisdiction input
document.getElementById('jurisdiction').addEventListener('input', function(e) {
    e.target.value = e.target.value.toUpperCase();
});

// Enter key support
document.getElementById('validateInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        validateChittyID();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('jurisdiction').focus();
});