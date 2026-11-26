import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { renewRequestKey, type Claim } from '@/lib/services/request-keys';
import { classifyStepError, classifyStepOutcome } from '@/lib/planner/cart-step-outcome';

export interface CartLineRequest {
  variantId: string;
  quantity: number;
  /** Shown to the guest when this line cannot be confirmed. */
  label: string;
}

export interface OnceCartResult {
  /** Lines this attempt added to the cart. */
  added: number;
  /** Lines an earlier attempt of this same request already added. Not added again. */
  alreadyApplied: number;
  /** Lines refused by the cart's own checks (price, stock, product) or rejected with no change made. */
  problems: string[];
  /** Lines whose outcome is unknown. They are reported for the guest to check and are never repeated. */
  uncertain: string[];
  /** True when another attempt took over the request while this one was running. */
  takenOver: boolean;
}

/**
 * Adds each line to the cart at most once per request. Each line is one database transaction: the cart mutation and
 * the completed request step commit together, or neither does. A line whose outcome is unknown (the connection failed
 * mid-call) is reported as uncertain and is not repeated by this code.
 */
export async function addCartLinesOnce(
  storeId: string,
  sessionId: string,
  claim: Claim,
  lines: CartLineRequest[],
): Promise<OnceCartResult> {
  const result: OnceCartResult = { added: 0, alreadyApplied: 0, problems: [], uncertain: [], takenOver: false };
  const admin = createSupabaseAdminClient();
  for (const [index, line] of lines.entries()) {
    if (!(await renewRequestKey(claim))) {
      result.takenOver = true;
      break;
    }
    const { data, error } = await admin.rpc('guest_cart_add_step', {
      p_store: storeId,
      p_session: sessionId,
      p_request: claim.id,
      p_attempt: claim.attempt,
      p_index: index,
      p_variant: line.variantId,
      p_quantity: line.quantity,
    });
    if (error) {
      const kind = classifyStepError(error.code);
      if (kind === 'takenOver') {
        // A newer attempt owns the request now. Nothing from this attempt was written.
        result.takenOver = true;
        break;
      }
      if (kind === 'refused') {
        // The whole transaction rolled back, so neither the cart nor the step changed and the line may be retried later.
        result.problems.push(`${line.label}: ${error.message}`);
      } else {
        // The call failed without a database answer, so the outcome is unknown. Never repeat it here.
        result.uncertain.push(line.label);
      }
      continue;
    }
    const outcome = (data ?? {}) as { outcome?: string; message?: string };
    switch (classifyStepOutcome(outcome.outcome)) {
      case 'added':
        result.added += 1;
        break;
      case 'alreadyApplied':
        result.alreadyApplied += 1;
        break;
      case 'uncertain':
        result.uncertain.push(line.label);
        break;
      default:
        result.problems.push(`${line.label}: ${outcome.message ?? 'This item could not be added.'}`);
    }
  }
  return result;
}
