/**
 * Unit Tests for ChittyID Validation
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock ChittyID API class for testing
class MockChittyIDAPI {
    constructor() {
        this.version = '01';
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

        // Version validation
        if (!/^[0-9]{2}$/.test(version)) {
            return { valid: false, error: 'Version must be 2 digits' };
        }

        // Region validation
        if (!/^[1-9]$/.test(region)) {
            return { valid: false, error: 'Region must be 1 digit (1-9)' };
        }

        // Jurisdiction validation
        if (!/^[A-Z]{3}$/.test(jurisdiction)) {
            return { valid: false, error: 'Jurisdiction must be 3 uppercase letters' };
        }

        // Sequential validation
        if (!/^[0-9]{4}$/.test(sequential)) {
            return { valid: false, error: 'Sequential must be 4 digits' };
        }

        // Entity type validation
        // @canon: chittycanon://gov/governance#core-types
        if (!/^[PLTEA]$/.test(entityType)) {
            return { valid: false, error: 'Entity type must be P, L, T, E, or A' };
        }

        // Year-Month validation
        if (!/^[0-9]{2,3}$/.test(yearMonth)) {
            return { valid: false, error: 'Year-Month must be 2-3 digits' };
        }

        // Trust level validation
        if (!/^[0-5]$/.test(trustLevel)) {
            return { valid: false, error: 'Trust level must be 0-5' };
        }

        // Checksum validation
        if (!/^[0-9]{2}$/.test(checksum)) {
            return { valid: false, error: 'Checksum must be 2 digits' };
        }

        // Mock checksum validation (simplified)
        const baseId = `${version}${region}${jurisdiction}${sequential}${entityType}${yearMonth}${trustLevel}`;
        const expectedChecksum = this.mod97Checksum(baseId).toString().padStart(2, '0');

        if (checksum !== expectedChecksum) {
            return { valid: false, error: 'Invalid checksum' };
        }

        return {
            valid: true,
            parsed: {
                version,
                region,
                jurisdiction,
                sequential,
                entityType,
                yearMonth,
                trustLevel,
                checksum
            },
            metadata: {
                regionName: this.getRegionName(region),
                entityTypeName: this.getEntityTypeName(entityType),
                trustLevelName: this.getTrustLevelName(trustLevel)
            }
        };
    }

    mod97Checksum(str) {
        // Simplified mod-97 checksum for testing
        let sum = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            const value = isNaN(char) ? char.charCodeAt(0) - 55 : parseInt(char);
            sum = (sum * 10 + value) % 97;
        }
        return 98 - ((sum * 100) % 97);
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

    // @canon: chittycanon://gov/governance#core-types
    getEntityTypeName(type) {
        const types = {
            'P': 'ChittyPerson',
            'L': 'ChittyLocation',
            'T': 'ChittyThing',
            'E': 'ChittyEvent',
            'A': 'ChittyAuthority'
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
}

describe('ChittyID Validation', () => {
    let api;

    beforeEach(() => {
        api = new MockChittyIDAPI();
    });

    describe('Valid ChittyIDs', () => {
        it('should validate a properly formatted ChittyID', () => {
            const chittyId = '01-1-USA-0001-P-251-3-15';
            const result = api.validate(chittyId);

            expect(result.valid).toBe(true);
            expect(result.parsed.version).toBe('01');
            expect(result.parsed.region).toBe('1');
            expect(result.parsed.jurisdiction).toBe('USA');
            expect(result.parsed.sequential).toBe('0001');
            expect(result.parsed.entityType).toBe('P');
            expect(result.parsed.yearMonth).toBe('251');
            expect(result.parsed.trustLevel).toBe('3');
        });

        it('should provide metadata for valid ChittyIDs', () => {
            const chittyId = '01-1-USA-0001-P-251-3-15';
            const result = api.validate(chittyId);

            expect(result.metadata.regionName).toBe('North America');
            expect(result.metadata.entityTypeName).toBe('ChittyPerson');
            expect(result.metadata.trustLevelName).toBe('L3 - Verified');
        });

        it('should validate different entity types', () => {
            // Compute checksum for Authority type
            const aBaseId = '011USA0001A2513';
            const aChecksum = api.mod97Checksum(aBaseId).toString().padStart(2, '0');

            const testCases = [
                { id: '01-1-USA-0001-P-251-3-15', type: 'P', name: 'ChittyPerson' },
                { id: '01-1-USA-0001-L-251-3-59', type: 'L', name: 'ChittyLocation' },
                { id: '01-1-USA-0001-T-251-3-03', type: 'T', name: 'ChittyThing' },
                { id: '01-1-USA-0001-E-251-3-47', type: 'E', name: 'ChittyEvent' },
                { id: `01-1-USA-0001-A-251-3-${aChecksum}`, type: 'A', name: 'ChittyAuthority' }
            ];

            testCases.forEach(({ id, type, name }) => {
                const result = api.validate(id);
                expect(result.valid).toBe(true);
                expect(result.parsed.entityType).toBe(type);
                expect(result.metadata.entityTypeName).toBe(name);
            });
        });

        it('should validate different regions', () => {
            const regions = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

            regions.forEach(region => {
                const chittyId = `01-${region}-USA-0001-P-251-3-${api.mod97Checksum(`01${region}USA0001P2513`).toString().padStart(2, '0')}`;
                const result = api.validate(chittyId);
                expect(result.valid).toBe(true);
                expect(result.parsed.region).toBe(region);
            });
        });

        it('should validate different trust levels', () => {
            const trustLevels = ['0', '1', '2', '3', '4', '5'];

            trustLevels.forEach(level => {
                const baseId = `011USA0001P251${level}`;
                const checksum = api.mod97Checksum(baseId).toString().padStart(2, '0');
                const chittyId = `01-1-USA-0001-P-251-${level}-${checksum}`;
                const result = api.validate(chittyId);
                expect(result.valid).toBe(true);
                expect(result.parsed.trustLevel).toBe(level);
            });
        });
    });

    describe('Invalid ChittyIDs', () => {
        it('should reject null or undefined input', () => {
            expect(api.validate(null).valid).toBe(false);
            expect(api.validate(undefined).valid).toBe(false);
            expect(api.validate('').valid).toBe(false);
        });

        it('should reject non-string input', () => {
            expect(api.validate(12345).valid).toBe(false);
            expect(api.validate({}).valid).toBe(false);
            expect(api.validate([]).valid).toBe(false);
        });

        it('should reject incorrect number of parts', () => {
            expect(api.validate('01-1-USA-0001-P-251-3').valid).toBe(false); // 7 parts
            expect(api.validate('01-1-USA-0001-P-251-3-15-extra').valid).toBe(false); // 9 parts
        });

        it('should reject invalid version format', () => {
            expect(api.validate('1-1-USA-0001-P-251-3-15').valid).toBe(false); // 1 digit
            expect(api.validate('001-1-USA-0001-P-251-3-15').valid).toBe(false); // 3 digits
            expect(api.validate('AA-1-USA-0001-P-251-3-15').valid).toBe(false); // letters
        });

        it('should reject invalid region format', () => {
            expect(api.validate('01-0-USA-0001-P-251-3-15').valid).toBe(false); // 0 not allowed
            expect(api.validate('01-10-USA-0001-P-251-3-15').valid).toBe(false); // 2 digits
            expect(api.validate('01-A-USA-0001-P-251-3-15').valid).toBe(false); // letter
        });

        it('should reject invalid jurisdiction format', () => {
            expect(api.validate('01-1-US-0001-P-251-3-15').valid).toBe(false); // 2 letters
            expect(api.validate('01-1-USA1-0001-P-251-3-15').valid).toBe(false); // 4 characters
            expect(api.validate('01-1-usa-0001-P-251-3-15').valid).toBe(false); // lowercase
        });

        it('should reject invalid sequential format', () => {
            expect(api.validate('01-1-USA-001-P-251-3-15').valid).toBe(false); // 3 digits
            expect(api.validate('01-1-USA-00001-P-251-3-15').valid).toBe(false); // 5 digits
            expect(api.validate('01-1-USA-000A-P-251-3-15').valid).toBe(false); // letter
        });

        it('should reject invalid entity type', () => {
            expect(api.validate('01-1-USA-0001-X-251-3-15').valid).toBe(false); // invalid letter
            expect(api.validate('01-1-USA-0001-1-251-3-15').valid).toBe(false); // number
            expect(api.validate('01-1-USA-0001-p-251-3-15').valid).toBe(false); // lowercase
        });

        it('should reject invalid trust level', () => {
            expect(api.validate('01-1-USA-0001-P-251-6-15').valid).toBe(false); // too high
            expect(api.validate('01-1-USA-0001-P-251-A-15').valid).toBe(false); // letter
            expect(api.validate('01-1-USA-0001-P-251-10-15').valid).toBe(false); // 2 digits
        });

        it('should reject invalid checksum format', () => {
            expect(api.validate('01-1-USA-0001-P-251-3-1').valid).toBe(false); // 1 digit
            expect(api.validate('01-1-USA-0001-P-251-3-123').valid).toBe(false); // 3 digits
            expect(api.validate('01-1-USA-0001-P-251-3-AA').valid).toBe(false); // letters
        });

        it('should reject incorrect checksum value', () => {
            const chittyId = '01-1-USA-0001-P-251-3-99'; // Wrong checksum
            const result = api.validate(chittyId);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Invalid checksum');
        });
    });

    describe('Edge Cases', () => {
        it('should handle minimum sequential number', () => {
            const baseId = '011USA0000P2513';
            const checksum = api.mod97Checksum(baseId).toString().padStart(2, '0');
            const chittyId = `01-1-USA-0000-P-251-3-${checksum}`;
            const result = api.validate(chittyId);
            expect(result.valid).toBe(true);
        });

        it('should handle maximum sequential number', () => {
            const baseId = '011USA9999P2513';
            const checksum = api.mod97Checksum(baseId).toString().padStart(2, '0');
            const chittyId = `01-1-USA-9999-P-251-3-${checksum}`;
            const result = api.validate(chittyId);
            expect(result.valid).toBe(true);
        });

        it('should handle 2-digit year-month codes', () => {
            const baseId = '011USA0001P253';
            const checksum = api.mod97Checksum(baseId).toString().padStart(2, '0');
            const chittyId = `01-1-USA-0001-P-25-3-${checksum}`;
            const result = api.validate(chittyId);
            expect(result.valid).toBe(true);
        });

        it('should handle 3-digit year-month codes', () => {
            const baseId = '011USA0001P2513';
            const checksum = api.mod97Checksum(baseId).toString().padStart(2, '0');
            const chittyId = `01-1-USA-0001-P-251-3-${checksum}`;
            const result = api.validate(chittyId);
            expect(result.valid).toBe(true);
        });
    });

    describe('Checksum Algorithm', () => {
        it('should generate consistent checksums', () => {
            const baseId = '011USA0001P2513';
            const checksum1 = api.mod97Checksum(baseId);
            const checksum2 = api.mod97Checksum(baseId);
            expect(checksum1).toBe(checksum2);
        });

        it('should generate different checksums for different inputs', () => {
            const baseId1 = '011USA0001P2513';
            const baseId2 = '011USA0002P2513';
            const checksum1 = api.mod97Checksum(baseId1);
            const checksum2 = api.mod97Checksum(baseId2);
            expect(checksum1).not.toBe(checksum2);
        });

        it('should generate valid 2-digit checksums', () => {
            const testInputs = [
                '011USA0001P2513',
                '012EUR0001L2514',
                '013ASI0001T2515',
                '014AFR0001E2510'
            ];

            testInputs.forEach(input => {
                const checksum = api.mod97Checksum(input);
                expect(checksum).toBeGreaterThanOrEqual(0);
                expect(checksum).toBeLessThanOrEqual(97);
                expect(Number.isInteger(checksum)).toBe(true);
            });
        });
    });
});

describe('ChittyID Format Specification', () => {
    let api;

    beforeEach(() => {
        api = new MockChittyIDAPI();
    });

    it('should follow the VV-G-LLL-SSSS-T-YM-C-X format', () => {
        const validFormat = /^[0-9]{2}-[1-9]-[A-Z]{3}-[0-9]{4}-[PLTEA]-[0-9]{2,3}-[0-5]-[0-9]{2}$/;

        const testIds = [
            '01-1-USA-0001-P-251-3-15',
            '02-9-DEU-9999-L-25-0-99',
            '03-5-JPN-5000-T-123-5-01'
        ];

        testIds.forEach(id => {
            expect(validFormat.test(id)).toBe(true);
        });
    });

    it('should support all documented regions', () => {
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

        Object.keys(regions).forEach(region => {
            expect(api.getRegionName(region)).toBe(regions[region]);
        });
    });

    it('should support all documented entity types', () => {
        const entityTypes = {
            'P': 'ChittyPerson',
            'L': 'ChittyLocation',
            'T': 'ChittyThing',
            'E': 'ChittyEvent',
            'A': 'ChittyAuthority'
        };

        Object.keys(entityTypes).forEach(type => {
            expect(api.getEntityTypeName(type)).toBe(entityTypes[type]);
        });
    });

    it('should support all documented trust levels', () => {
        const trustLevels = {
            '0': 'L0 - Unverified',
            '1': 'L1 - Basic',
            '2': 'L2 - Standard',
            '3': 'L3 - Verified',
            '4': 'L4 - Premium',
            '5': 'L5 - Official'
        };

        Object.keys(trustLevels).forEach(level => {
            expect(api.getTrustLevelName(level)).toBe(trustLevels[level]);
        });
    });
});