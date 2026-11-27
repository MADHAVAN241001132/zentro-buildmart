'use client';

import { useActionState, useEffect, useState } from 'react';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@/lib/validation/admin';
import { ScrollableSelect } from '@/components/ui/scrollable-select';
import { updateTicketAction, type TicketUpdateState } from '@/app/admin/(portal)/support/actions';

const INITIAL: TicketUpdateState = { ok: false };

export function TicketUpdateForm({
  ticketId,
  initialStatus,
  initialPriority,
}: {
  ticketId: string;
  initialStatus: string;
  initialPriority: string;
}) {
  const [state, action, pending] = useActionState(updateTicketAction, INITIAL);
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState(initialPriority);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    setPriority(initialPriority);
  }, [initialPriority]);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="sr-only" htmlFor={`s-${ticketId}`}>Status</label>
      <ScrollableSelect
        id={`s-${ticketId}`}
        name="status"
        value={status}
        onValueChange={setStatus}
        ariaLabel="Ticket status"
        className="min-w-[130px]"
        buttonClassName="min-h-[38px] px-2.5 py-1.5 text-xs sm:text-sm"
        options={TICKET_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))}
      />
      <label className="sr-only" htmlFor={`p-${ticketId}`}>Priority</label>
      <ScrollableSelect
        id={`p-${ticketId}`}
        name="priority"
        value={priority}
        onValueChange={setPriority}
        ariaLabel="Ticket priority"
        className="min-w-[110px]"
        buttonClassName="min-h-[38px] px-2.5 py-1.5 text-xs sm:text-sm"
        options={TICKET_PRIORITIES.map((p) => ({ value: p, label: p }))}
      />
      <button
        type="submit"
        disabled={pending}
        className="min-h-[38px] rounded-control bg-burgundy px-3 py-1.5 text-xs font-semibold text-cream hover:bg-burgundy-deep disabled:opacity-60 sm:text-sm"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      {state.message ? (
        <span role={state.ok ? 'status' : 'alert'} className={`text-xs font-medium ${state.ok ? 'text-success' : 'text-danger'}`}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
