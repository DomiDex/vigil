import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { askVigil } from "../../server/functions";

interface AskVigilProps {
  repo?: string;
}

export function AskVigil({ repo }: AskVigilProps) {
  const [question, setQuestion] = useState("");

  const mutation = useMutation({
    mutationFn: (data: { question: string; repo?: string }) =>
      askVigil({ data }),
  });

  const handleAsk = () => {
    if (question.trim()) {
      mutation.mutate({ question: question.trim(), repo });
      setQuestion("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageCircle className="size-4" />
          Ask Vigil
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask a question about this repo..."
            className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          />
          <Button
            size="sm"
            onClick={handleAsk}
            disabled={!question.trim() || mutation.isPending}
          >
            <Send className="size-4" />
          </Button>
        </div>
        {mutation.isPending && (
          <div className="text-sm text-muted-foreground">Thinking...</div>
        )}
        {mutation.isSuccess && (
          <div className="text-sm text-muted-foreground">
            Question submitted successfully.
          </div>
        )}
        {mutation.isError && (
          <div className="text-sm text-destructive">
            Failed to submit question.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
