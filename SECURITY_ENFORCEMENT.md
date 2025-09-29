# ChittyID Security Enforcement Policy

## 🔒 **STRICT SERVER-ONLY GENERATION POLICY**

**EFFECTIVE IMMEDIATELY**: All ChittyID generation is restricted to authorized servers only.

### 🚫 **PROHIBITED ACTIVITIES**

1. **NO LOCAL GENERATION** - ChittyIDs cannot be generated locally under any circumstances
2. **NO FALLBACK GENERATION** - Local fallback mechanisms are prohibited
3. **NO OFFLINE MODE** - ChittyID operations require server connectivity
4. **NO MOCK GENERATION** - Even in tests, use real server or proper error handling

### ✅ **AUTHORIZED GENERATION**

**ONLY** the following servers may generate ChittyIDs:

1. **Primary Server**: `https://id.chitty.cc`
2. **Hybrid System**: `id.chitty.cc/ontology/*`, `id.chitty.cc/translate/*`, `id.chitty.cc/governance/*`
3. **Authorized Backup** (when configured): `https://fallback.id.chitty.cc`

### 🔧 **IMPLEMENTATION REQUIREMENTS**

#### For Client Libraries:
```javascript
// ✅ CORRECT - Server request only
const chittyId = await client.requestChittyID({
  type: 'document',
  metadata: {...}
});

// ❌ FORBIDDEN - Local generation
const chittyId = generateLocalChittyID(); // VIOLATION
```

#### Pipeline Enforcement:
All requests must include:
```
X-ChittyOS-Pipeline: Router→Intake→Trust→Authorization→Generation
```

#### Error Handling:
```javascript
// ✅ CORRECT - Fail fast, no fallback
if (!serverAvailable) {
  throw new Error('Server required. No local generation available.');
}

// ❌ FORBIDDEN - Local fallback
if (!serverAvailable) {
  return generateFallbackId(); // VIOLATION
}
```

### 🛡️ **SECURITY MEASURES**

#### 1. Pipeline Enforcement
- All ID generation requests must flow through the ChittyOS 5-layer pipeline
- Pipeline violations result in immediate request rejection
- No bypass mechanisms permitted

#### 2. API Key Requirements
- All clients must authenticate with `CHITTY_API_KEY`
- Requests without valid authentication are rejected
- No anonymous generation permitted

#### 3. Content Binding
- All IDs cryptographically bound to content via SHA-256 hashing
- VRF checksums with drand beacon integration
- Tamper-evident ID structure

#### 4. Audit Logging
- All generation attempts logged for compliance
- Failed generation attempts tracked
- Violation attempts flagged for security review

### 📋 **COMPLIANCE VALIDATION**

#### Automated Checks:
```bash
# Run compliance validation
./scripts/validate-compliance.sh

# Check for violations
grep -r "generateChittyID\|generateFallback\|localGeneration" . --include="*.js"
```

#### Regular Audits:
- Weekly automated scans for policy violations
- Manual security reviews for new code
- Penetration testing of enforcement mechanisms

### 🚨 **VIOLATION CONSEQUENCES**

#### Code Violations:
1. **Immediate**: Code review failure
2. **Deployment**: Blocked until fixed
3. **Production**: Automatic rollback if detected

#### Security Violations:
1. **Detection**: Immediate alert to security team
2. **Investigation**: Full security audit
3. **Remediation**: Forced compliance update

### 🔍 **MONITORING & DETECTION**

#### Real-time Monitoring:
- Server health monitoring (id.chitty.cc)
- Pipeline enforcement validation
- Request pattern analysis
- Anomaly detection for unusual generation patterns

#### Compliance Scanning:
- Daily automated code scans
- Pre-commit hooks for violation detection
- CI/CD pipeline integration
- Production runtime monitoring

### 📞 **INCIDENT RESPONSE**

#### If Server Unavailable:
1. **DO NOT** implement local fallback
2. **DO** display appropriate error to user
3. **DO** retry with exponential backoff
4. **DO** escalate to infrastructure team

#### If Violations Detected:
1. **Immediate**: Stop the violating process
2. **Assessment**: Determine scope of impact
3. **Remediation**: Fix the violation
4. **Validation**: Re-run compliance checks

### 🎯 **APPROVED PATTERNS**

#### Client Implementation:
```javascript
export class ChittyIDClient {
  async requestChittyID(options) {
    if (!this.apiKey) {
      throw new Error('API key required. No local generation.');
    }

    // Server request only
    const response = await fetch('https://id.chitty.cc/api/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-ChittyOS-Pipeline': 'Router→Intake→Trust→Authorization→Generation'
      },
      body: JSON.stringify(options)
    });

    if (!response.ok) {
      throw new Error('Server generation failed. No local fallback.');
    }

    return response.json();
  }
}
```

#### Server Implementation:
```javascript
export class ChittyIDServer {
  async generateHybridId(request) {
    // Validate pipeline
    this.validatePipelineRequest(request);

    // Generate with VRF + drand
    const ssss = crypto.getRandomValues(new Uint8Array(2));
    const randomNum = (ssss[0] << 8) | ssss[1];
    const sequence = ((randomNum % 9000) + 1000).toString();

    // Create dual format IDs
    return {
      technical_id: `AA-C-${namespace}-${sequence}-I-${yearMonth}-7-${checksum}`,
      legal_id: `01-N-${jurisdiction}-${sequence}-P-${yearMonth}-3-${checksum}`
    };
  }
}
```

### 📚 **REFERENCES**

- [ChittyID Technical Specification](./docs/CHITTYID_SPEC.md)
- [Hybrid ID System Documentation](./docs/HYBRID_SYSTEM.md)
- [Security Architecture](./docs/SECURITY_ARCHITECTURE.md)
- [Compliance Validation Script](./scripts/validate-compliance.sh)

---

**This policy is mandatory and non-negotiable. All code must comply before deployment.**

**Last Updated**: September 28, 2025
**Policy Version**: 2.0
**Enforcement**: STRICT