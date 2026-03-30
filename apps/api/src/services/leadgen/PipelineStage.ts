/**
 * Generic pipeline stage interface.
 * Every layer in the lead generation pipeline implements this contract.
 */
export type ValidationTelemetry = {
  layer_confidence: number;
  reasoning: string;
  is_valid: boolean;
};

export type StageResult<TOutput> = {
  output: TOutput;
  telemetry: ValidationTelemetry;
  llmProvider?: string;
  llmModel?: string;
  llmTokensUsed?: number;
  apiCost?: number;
};

export interface PipelineStage<TInput, TOutput> {
  readonly name: string;
  execute(input: TInput): Promise<StageResult<TOutput>>;
}
