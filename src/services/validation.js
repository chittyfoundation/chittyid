/**
 * Validation Service
 * Handles ChittyID validation without pipeline requirements
 */

export default class ValidationService {
  constructor(env) {
    this.env = env;
  }

  /**
   * Validate a ChittyID format and checksum
   */
  async validate(chittyId, context = {}) {
    if (!chittyId || typeof chittyId !== 'string') {
      return {
        valid: false,
        error: 'ChittyID is required and must be a string'
      };
    }

    const parts = chittyId.split('-');
    if (parts.length !== 8) {
      return {
        valid: false,
        error: 'Invalid format: must have 8 parts separated by hyphens',
        format: 'Expected: VV-G-LLL-SSSS-T-YM-C-X'
      };
    }

    const [version, region, jurisdiction, sequential, entityType, yearMonth, trustLevel, checksum] = parts;

    // Validate each component
    const validations = [
      {
        field: 'version',
        value: version,
        pattern: /^[0-9]{2}$/,
        error: 'Version must be 2 digits (01-05)'
      },
      {
        field: 'region',
        value: region,
        pattern: /^[1-9]$/,
        error: 'Region must be 1 digit (1-9)'
      },
      {
        field: 'jurisdiction',
        value: jurisdiction,
        pattern: /^[A-Z]{3}$/,
        error: 'Jurisdiction must be 3 uppercase letters'
      },
      {
        field: 'sequential',
        value: sequential,
        pattern: /^[0-9]{4}$/,
        error: 'Sequential must be 4 digits'
      },
      {
        field: 'entityType',
        value: entityType,
        pattern: /^[PLTEA]$/,
        error: 'Entity type must be P, L, T, E, or A'
      },
      {
        field: 'yearMonth',
        value: yearMonth,
        pattern: /^[0-9]{2,4}$/,
        error: 'Year-Month must be 2-4 digits'
      },
      {
        field: 'trustLevel',
        value: trustLevel,
        pattern: /^[0-5]$/,
        error: 'Trust level must be 0-5'
      },
      {
        field: 'checksum',
        value: checksum,
        pattern: /^[0-9]{2}$/,
        error: 'Checksum must be 2 digits'
      }
    ];

    for (const validation of validations) {
      if (!validation.pattern.test(validation.value)) {
        return {
          valid: false,
          error: validation.error,
          field: validation.field,
          value: validation.value
        };
      }
    }

    // Verify checksum
    const baseId = parts.slice(0, 7).join('');
    const calculatedChecksum = this.calculateChecksum(baseId);

    if (calculatedChecksum !== checksum) {
      return {
        valid: false,
        error: 'Invalid checksum',
        expected: calculatedChecksum,
        actual: checksum
      };
    }

    // Get additional metadata
    const metadata = {
      version: this.getVersionName(version),
      region: this.getRegionName(region),
      entityType: this.getEntityTypeName(entityType),
      trustLevel: this.getTrustLevelName(trustLevel),
      yearMonth: this.formatYearMonth(yearMonth),
      jurisdiction: jurisdiction
    };

    // Store validation in cache
    if (this.env.PLATFORM_CACHE) {
      await this.env.PLATFORM_CACHE.put(
        `validation:${chittyId}`,
        JSON.stringify({
          valid: true,
          metadata,
          context,
          timestamp: new Date().toISOString()
        }),
        { expirationTtl: 3600 }
      );
    }

    return {
      valid: true,
      chittyId,
      components: {
        version,
        region,
        jurisdiction,
        sequential,
        entityType,
        yearMonth,
        trustLevel,
        checksum
      },
      metadata
    };
  }

  /**
   * Get detailed information about a ChittyID
   */
  async getInfo(chittyId) {
    // First validate the format
    const validation = await this.validate(chittyId);

    if (!validation.valid) {
      return null;
    }

    // Check if we have stored data
    let storedData = null;
    if (this.env.CHITTY_IDS) {
      const data = await this.env.CHITTY_IDS.get(chittyId);
      if (data) {
        storedData = JSON.parse(data);
      }
    }

    // Check validation cache
    let cachedValidation = null;
    if (this.env.PLATFORM_CACHE) {
      const cached = await this.env.PLATFORM_CACHE.get(`validation:${chittyId}`);
      if (cached) {
        cachedValidation = JSON.parse(cached);
      }
    }

    return {
      ...validation,
      stored: storedData,
      cached: cachedValidation,
      timestamp: new Date().toISOString()
    };
  }

  calculateChecksum(baseId) {
    const clean = baseId.replace(/-/g, '');
    let sum = 0;
    for (let i = 0; i < clean.length; i++) {
      sum += clean.charCodeAt(i);
    }
    return (sum % 97).toString().padStart(2, '0');
  }

  getVersionName(version) {
    const versions = {
      '01': 'Deprecated',
      '02': 'Legacy',
      '03': 'Current',
      '04': 'Beta',
      '05': 'Experimental'
    };
    return versions[version] || `Version ${version}`;
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
    return regions[region] || `Region ${region}`;
  }

  // @canon: chittycanon://gov/governance#core-types
  getEntityTypeName(type) {
    const types = {
      'P': 'Person',
      'L': 'Location',
      'T': 'Thing',
      'E': 'Event',
      'A': 'Authority'
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
    return levels[level] || `Level ${level}`;
  }

  formatYearMonth(yearMonth) {
    if (yearMonth.length === 4) {
      // Format: YYMM
      const year = '20' + yearMonth.substring(0, 2);
      const month = yearMonth.substring(2, 4);
      return `${year}-${month}`;
    } else if (yearMonth.length === 3) {
      // Format: YMM
      const year = '202' + yearMonth[0];
      const month = yearMonth.substring(1, 3);
      return `${year}-${month}`;
    } else if (yearMonth.length === 2) {
      // Format: YM
      const year = '202' + yearMonth[0];
      const month = '0' + yearMonth[1];
      return `${year}-${month}`;
    }
    return yearMonth;
  }
}