import type { Metadata } from "next";
import { chatGPTSignOutPath } from "../chatgpt-auth";
import { requireInsightsOwnerPage } from "../insights-auth";
import { loadInsights } from "./data";
import { InsightsDashboard } from "./insights-dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review Insights | Casa del Patio",
  description: "Private owner dashboard for Casa del Patio stakeholder feedback.",
};

export default async function InsightsPage() {
  const owner = await requireInsightsOwnerPage();
  const data = await loadInsights();

  return (
    <InsightsDashboard
      data={data}
      ownerName={owner.fullName ?? "Site owner"}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
