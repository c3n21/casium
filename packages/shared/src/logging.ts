export type LogFields = {
  correlationId?: string;
  applicationId?: string;
  mandateId?: string;
  receiptId?: string;
  txDigest?: string;
  agentEvmAddress?: string;
  agentSuiAddress?: string;
  humanIdHash?: string;
  walrusBlobId?: string;
};

export function createStructuredLogger(service: string) {
  return {
    info(message: string, fields?: LogFields) {
      console.log(
        JSON.stringify({ level: "info", service, message, ...fields, ts: new Date().toISOString() }),
      );
    },
    error(message: string, fields?: LogFields) {
      console.error(
        JSON.stringify({ level: "error", service, message, ...fields, ts: new Date().toISOString() }),
      );
    },
  };
}

export type StructuredLogger = ReturnType<typeof createStructuredLogger>;
