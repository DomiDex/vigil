import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { askVigil } from "../../server/functions";

interface ReplyFormProps {
  messageId: string;
}

export function ReplyForm({ messageId }: ReplyFormProps) {
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleSubmit() {
    if (!reply.trim() || submitting) return;
    setSubmitting(true);
    try {
      await askVigil({ data: { question: reply } });
      setReply("");
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 3000);
    } catch {
      // Error handling deferred
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        placeholder="Reply to this message..."
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        disabled={submitting}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !reply.trim()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Sending..." : "Reply"}
        </button>
        {confirmed && (
          <span className="text-xs text-green-500">Reply sent</span>
        )}
      </div>
    </div>
  );
}
