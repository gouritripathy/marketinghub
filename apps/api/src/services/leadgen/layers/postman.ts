import type { PipelineStage, StageResult, ValidationTelemetry } from '../PipelineStage';
import { findEmail, verifyEmail, evaluateDeliverability } from '../external/emailVerification';

export type PostmanInput = {
  firstName: string;
  lastName: string;
  companyDomain: string;
};

export type PostmanOutput = {
  contact_data: {
    verified_email: string;
    deliverability_status: string;
  };
  validation_telemetry: ValidationTelemetry;
};

const COMMON_PATTERNS = [
  (f: string, l: string) => `${f}.${l}`,
  (f: string, l: string) => `${f[0]}${l}`,
  (f: string, l: string) => `${f}${l}`,
  (f: string, l: string) => `${f}${l[0]}`,
  (f: string, l: string) => `${f}_${l}`,
  (f: string, l: string) => `${l}.${f}`,
];

export class PostmanStage implements PipelineStage<PostmanInput, PostmanOutput> {
  readonly name = 'POSTMAN';

  async execute(input: PostmanInput): Promise<StageResult<PostmanOutput>> {
    const { firstName, lastName, companyDomain } = input;
    const fLower = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const lLower = lastName.toLowerCase().replace(/[^a-z]/g, '');

    // Step 1: Try Hunter.io email finder
    let email: string | null = null;
    let apiCost = 0;

    try {
      const hunterResult = await findEmail(firstName, lastName, companyDomain);
      apiCost += 0.01;
      if (hunterResult.email && hunterResult.confidence >= 70) {
        email = hunterResult.email;
      }
    } catch {
      // Hunter failed — fall through to pattern generation
    }

    // Step 2: If Hunter didn't find a high-confidence email, generate patterns
    if (!email) {
      const candidates = COMMON_PATTERNS.map(
        (pattern) => `${pattern(fLower, lLower)}@${companyDomain}`,
      );

      for (const candidate of candidates) {
        try {
          const result = await verifyEmail(candidate);
          apiCost += 0.002;
          if (result.status === 'valid') {
            email = candidate;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (!email) {
      return {
        output: {
          contact_data: { verified_email: '', deliverability_status: 'not_found' },
          validation_telemetry: {
            layer_confidence: 0,
            reasoning: `No deliverable email found for ${firstName} ${lastName} at ${companyDomain}`,
            is_valid: false,
          },
        },
        telemetry: {
          layer_confidence: 0,
          reasoning: `No deliverable email found for ${firstName} ${lastName} at ${companyDomain}`,
          is_valid: false,
        },
        apiCost,
      };
    }

    // Step 3: Final SMTP verification
    const verification = await verifyEmail(email);
    apiCost += 0.002;

    const deliverability = evaluateDeliverability(verification.status);

    return {
      output: {
        contact_data: {
          verified_email: email,
          deliverability_status: verification.status,
        },
        validation_telemetry: {
          layer_confidence: deliverability.confidence,
          reasoning: deliverability.reasoning,
          is_valid: deliverability.is_valid,
        },
      },
      telemetry: {
        layer_confidence: deliverability.confidence,
        reasoning: deliverability.reasoning,
        is_valid: deliverability.is_valid,
      },
      apiCost,
    };
  }
}
