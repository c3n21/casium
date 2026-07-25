import { z } from "zod";

const MandateRegistrationSchema = z.object({
  mandateId: z.string().min(1),
  ownerCapId: z.string().min(1),
  agentCapId: z.string().min(1),
  agentSuiAddress: z.string().min(1),
  txDigest: z.string().min(1),
});

export type MandateRegistration = z.infer<typeof MandateRegistrationSchema> & {
  registeredAt: string;
};

type RegistrationResult =
  | { ok: true; value: MandateRegistration }
  | { ok: false; error: string };

export function createMandateService() {
  const mandates = new Map<string, MandateRegistration>();

  return {
    register(input: unknown): RegistrationResult {
      const parsed = MandateRegistrationSchema.safeParse(input);
      if (!parsed.success) {
        return { ok: false, error: "MANDATE_INVALID" };
      }
      const registration: MandateRegistration = {
        ...parsed.data,
        registeredAt: new Date().toISOString(),
      };
      mandates.set(parsed.data.mandateId, registration);
      return { ok: true, value: registration };
    },
    get(mandateId: string): MandateRegistration | null {
      return mandates.get(mandateId) ?? null;
    },
    list(): MandateRegistration[] {
      return [...mandates.values()];
    },
  };
}

export type MandateService = ReturnType<typeof createMandateService>;
