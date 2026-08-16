# Plan - Resolve Ambiguous broadcast_id in get_partner_open_offers

The error `column reference "broadcast_id" is ambiguous` is occurring within the `get_partner_open_offers` database function. This usually happens when a column name is shared between joined tables or when a variable name matches a column name without proper qualification.

## Proposed Changes

### Database Migration

1. **Update `get_partner_open_offers` RPC:**
   - Qualify all column references in the `SELECT` and `INSERT` statements within the function.
   - Specifically, ensure `broadcast_id` is always prefixed with the table alias (e.g., `mb.id`, `mo.broadcast_id`, or `o.broadcast_id`).
   - Check if any parameter names conflict with column names and prefix them (e.g., `p_partner_id`).

### Verification

1. **Verify RPC Execution:**
   - Call the `get_partner_open_offers` function using `supabase--read_query` to ensure it no longer throws the ambiguity error.
2. **Verify App UI:**
   - Check the Partner App marketplace/offers view to confirm data is loading correctly.

## Technical Details

The ambiguity likely arises in the `INSERT INTO public.marketplace_offers ... SELECT ...` block or the final `RETURN QUERY SELECT ...` block where `broadcast_id` is used. I will explicitly qualify every column reference in the function body.
