import { createMessage, type MessageRouter } from "../messaging/index.ts";
import type { WebhookEvent } from "./server.ts";
import type { SubscriptionManager } from "./subscriptions.ts";

/**
 * Processes webhook events against subscriptions and generates
 * structured messages for the routing pipeline.
 */
export class WebhookProcessor {
  constructor(
    private subscriptions: SubscriptionManager,
    private router: MessageRouter,
  ) {}

  async process(event: WebhookEvent): Promise<void> {
    switch (event.type) {
      case "pull_request":
        return this.processPR(event);
      case "pull_request_review":
        return this.processPRReview(event);
      case "push":
        return this.processPush(event);
      case "issue_comment":
        return this.processComment(event);
    }
  }

  private async processPR(event: WebhookEvent): Promise<void> {
    const pr = event.payload.pull_request as Record<string, unknown>;
    const repo = (event.payload.repository as Record<string, unknown>)?.full_name as string;
    const prNumber = pr?.number as number;
    const action = event.action;

    const matches = this.subscriptions.match(repo, prNumber, action);
    if (matches.length === 0) return;

    const title = pr?.title as string;
    const author = (pr?.user as Record<string, unknown>)?.login as string;
    const url = pr?.html_url as string;
    const head = pr?.head as Record<string, unknown> | undefined;

    const severity = action === "closed" && (pr?.merged as boolean) ? "warning" : "info";

    const message = createMessage({
      source: { repo, branch: head?.ref as string | undefined, event: `pr:${action}` },
      status: "proactive",
      severity,
      message: `**PR #${prNumber}** ${action}: [${title}](${url}) by @${author}`,
      metadata: { prNumber, action, author, url },
    });

    await this.router.route(message);
  }

  private async processPRReview(event: WebhookEvent): Promise<void> {
    const review = event.payload.review as Record<string, unknown>;
    const pr = event.payload.pull_request as Record<string, unknown>;
    const repo = (event.payload.repository as Record<string, unknown>)?.full_name as string;
    const prNumber = pr?.number as number;

    const matches = this.subscriptions.match(repo, prNumber, "review_submitted");
    if (matches.length === 0) return;

    const reviewer = (review?.user as Record<string, unknown>)?.login as string;
    const state = review?.state as string;
    const severity = state === "changes_requested" ? "warning" : "info";

    const message = createMessage({
      source: { repo, event: "pr:review" },
      status: "proactive",
      severity,
      message: `**Review on PR #${prNumber}**: ${state} by @${reviewer}`,
      metadata: { prNumber, reviewer, state },
    });

    await this.router.route(message);
  }

  private async processPush(event: WebhookEvent): Promise<void> {
    const repo = (event.payload.repository as Record<string, unknown>)?.full_name as string;
    const ref = event.payload.ref as string;
    const branch = ref?.replace("refs/heads/", "");
    const commits = event.payload.commits as Array<Record<string, unknown>>;

    if (!commits || commits.length === 0) return;

    const message = createMessage({
      source: { repo, branch, event: "push" },
      status: "normal",
      message: `**Push to ${branch}**: ${commits.length} commit(s) — latest: "${commits[commits.length - 1]?.message}"`,
      metadata: { branch, commitCount: commits.length },
    });

    await this.router.route(message);
  }

  private async processComment(event: WebhookEvent): Promise<void> {
    const comment = event.payload.comment as Record<string, unknown>;
    const issue = event.payload.issue as Record<string, unknown>;
    const repo = (event.payload.repository as Record<string, unknown>)?.full_name as string;
    const issueNumber = issue?.number as number;

    const matches = this.subscriptions.match(repo, issueNumber, "commented");
    if (matches.length === 0) return;

    const author = (comment?.user as Record<string, unknown>)?.login as string;
    const body = (comment?.body as string)?.slice(0, 200);

    const message = createMessage({
      source: { repo, event: "issue_comment" },
      status: "proactive",
      message: `**Comment on #${issueNumber}** by @${author}: ${body}`,
      metadata: { issueNumber, author },
    });

    await this.router.route(message);
  }
}
