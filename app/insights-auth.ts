import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { requireChatGPTUser, type ChatGPTUser } from "./chatgpt-auth";

type InsightsRuntimeEnv = {
  INSIGHTS_OWNER_EMAILS?: string;
};

function ownerEmails() {
  return ((env as unknown as InsightsRuntimeEnv).INSIGHTS_OWNER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function localOwner(): ChatGPTUser {
  return {
    userId: "local-insights-owner",
    displayName: "Local owner preview",
    email: "local-preview@example.invalid",
    fullName: "Local owner preview",
  };
}

export async function requireInsightsOwnerPage(): Promise<ChatGPTUser> {
  if (process.env.NODE_ENV === "development") return localOwner();

  const user = await requireChatGPTUser("/insights");
  const allowed = ownerEmails();

  if (allowed.length === 0) {
    throw new Error("Insights owner allowlist is not configured.");
  }

  if (!allowed.includes(user.email.trim().toLowerCase())) notFound();
  return user;
}
