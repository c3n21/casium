export const ERROR_CODES = {
  AGENTKIT_UNVERIFIED: "AGENTKIT_UNVERIFIED",
  DUPLICATE_HUMAN_LISTING: "DUPLICATE_HUMAN_LISTING",
  MANDATE_EVM_MISMATCH: "MANDATE_EVM_MISMATCH",
  MANDATE_SUI_MISMATCH: "MANDATE_SUI_MISMATCH",
  LISTING_NOT_FOUND: "LISTING_NOT_FOUND",
  SUI_MANDATE_REJECTED: "SUI_MANDATE_REJECTED",
  RECEIPT_INVALID: "RECEIPT_INVALID",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  [ERROR_CODES.AGENTKIT_UNVERIFIED]: 401,
  [ERROR_CODES.DUPLICATE_HUMAN_LISTING]: 409,
  [ERROR_CODES.MANDATE_EVM_MISMATCH]: 403,
  [ERROR_CODES.MANDATE_SUI_MISMATCH]: 403,
  [ERROR_CODES.LISTING_NOT_FOUND]: 404,
  [ERROR_CODES.SUI_MANDATE_REJECTED]: 422,
  [ERROR_CODES.RECEIPT_INVALID]: 422,
  [ERROR_CODES.IDEMPOTENCY_CONFLICT]: 409,
};

export const USER_FACING_ERRORS: Record<ErrorCode, string> = {
  [ERROR_CODES.AGENTKIT_UNVERIFIED]: "AgentKit could not verify this human-backed agent request.",
  [ERROR_CODES.DUPLICATE_HUMAN_LISTING]: "This World human has already applied to this listing.",
  [ERROR_CODES.MANDATE_EVM_MISMATCH]: "The verified EVM agent does not match the Sui mandate.",
  [ERROR_CODES.MANDATE_SUI_MISMATCH]: "The Sui agent address does not match the mandate.",
  [ERROR_CODES.LISTING_NOT_FOUND]: "The provider listing was not found.",
  [ERROR_CODES.SUI_MANDATE_REJECTED]: "Sui rejected the application under the mandate rules.",
  [ERROR_CODES.RECEIPT_INVALID]: "The Sui receipt does not match this application.",
  [ERROR_CODES.IDEMPOTENCY_CONFLICT]: "This idempotency key was reused with different application data.",
};
